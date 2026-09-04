const { HumanMessage } = require('@langchain/core/messages');
const { agent, thinkingAgent } = require('../../gemini');
const { MariaDBChatHistory } = require('./MariaDBHistory');
const { extractText, extractPlan, isRecursionLimitError } = require('./agentHelpers');
const { takeChartConfig } = require('../tools/chartTools');
const { takeThoughts, peekThoughts } = require('./thoughts');
const { setPendingApproval, approvalReply } = require('./approval');

function extractReplyText(content) {
    if (Array.isArray(content)) {
        return content
            .filter(part => typeof part === 'string' || (part && !part.thought && part.type !== 'thinking'))
            .map(part => (typeof part === 'string' ? part : part.text || ''))
            .join('');
    }
    return content ? content.toString() : '';
}

class StreamingAgent {

    constructor({ activeAgent, streamInput, runConfig, sessionId, userInput, thinking, history }, onEvent) {
        // dependencies - needed by the agent for a generation
        this.activeAgent = activeAgent;
        this.streamInput = streamInput;
        this.runConfig = runConfig;
        this.sessionId = sessionId;
        this.userInput = userInput;
        this.thinking = thinking;
        this.history = history;
        this.onEvent = onEvent;

        // Part 1: run  state
        this.reply = ""; // the final reply to send back
        this.replyStreamed = false; // has a reply been streamed back already?
        this.todos = null; // the agent's plan for this session
        this.streamedThoughts = 0; // the index of the last thought that was streamed back
        this.lastPlanText = ""; // the last plan text that was streamed back

        this.handlers = {
            on_chat_model_stream: this.processTokens,
            on_chat_model_end: this.processChatModelEnd,
            on_tool_start: this.processToolStart,
            on_tool_end: this.processToolEnd,
            on_chain_stream: this.processPlan,
        };

    }

    chunk(text) {
        this.onEvent('chunk', { text });
    }

    streamNewThoughts() {
        const thoughts = peekThoughts(this.sessionId);
        if (thoughts.length > this.streamedThoughts) {
            const newThoughts = thoughts.slice(this.streamedThoughts);
            for (const t of newThoughts) {
                this.chunk(`\n\n> 💭 *${t}*`);
            }
            this.streamedThoughts = thoughts.length;
        }
    }

    processTokens = async (data, event) => {
        if (event?.tags?.includes('justification')) return;
        const c = data.chunk;
        // if there's no content, return
        if (!c || !c.content) return;

        // If content is an array, it might contain thoughts or tool calls
        if (Array.isArray(c.content)) {
            for (const part of c.content) {
                const thoughtText = (part && (part.thought === true || part.type === 'thinking')) ? (part.thinking || part.text) : null;
                if (thoughtText) {
                    this.chunk(`\n\n> 💭 *${thoughtText}*`);
                }
            }
        }

        // if content is not a string, return immediately, as arrays hold thoughts or tool calls
        if (typeof c.content !== 'string') return;
        // if there are tool call chunks, return (a tool-call turn, not reply text)
        if ((c.tool_call_chunks || []).length > 0) return;

        const prefix = (this.replyStreamed === false) ? '\n\n---\n\n' : '';
        this.chunk(prefix + c.content);
        this.replyStreamed = true;
    }

    processChatModelEnd = async (data, event) => {
        this.streamNewThoughts();
        if (event?.tags?.includes('justification')) return;
        const output = data.output;
        if (output && (!output.tool_calls || output.tool_calls.length === 0)) {
            // a turn with no tool calls ends the agent loop, so this is the reply
            this.reply = extractReplyText(output.content);
        }
    }

    processToolStart = async (data, event) => {
        this.streamNewThoughts();
        if (event.name === 'write_todos') return;  // the plan chunk follows from the state update
        this.chunk(`\n\n🔧 *Calling \`${event.name}\`...*`);
    }

    processToolEnd = async (data, event) => {
        if (event.name !== 'write_todos') this.chunk(' ✔️');
    }

    processPlan = async (data) => {
        const c = data.chunk;
        if (!c) return;
        for (const update of Object.values(c)) {
            if (update && update.todos) {
                this.todos = update.todos;
                // stream the plan only when its text actually changes; write_todos
                // is called again each time an item's status updates, and
                // re-streaming the same plan would flood the preview
                const currentPlanText = extractPlan(update.todos);
                if (currentPlanText !== this.lastPlanText) {
                    this.lastPlanText = currentPlanText;
                    this.chunk('\n\n' + currentPlanText);
                }

            }
        }
    }


    async processEvent(event) {
        const handler = this.handlers[event.event];
        // dispatch the event
        if (handler) handler(event.data, event);
    }

    async processStream(stream) {
        console.log("Processing stream");
        for await (const event of stream) {
            await this.processEvent(event);
        }

    }

    async run() {
        const stream = this.activeAgent.streamEvents(this.streamInput, this.runConfig);

        // prevent the plan from a previous run of the agent from being sent again
        try {
            const initialState = await this.activeAgent.getState(this.runConfig);
            if (initialState?.values?.todos) {
                this.lastPlanText = extractPlan(initialState.values.todos) || '';
            }

            // If there's a pending interrupt for write_todos, we've already shown it as a "Proposed plan".
            // Set lastPlanText so processPlan doesn't stream it again when the tool finally runs.
            const interrupts = (initialState.tasks || []).flatMap(t => t.interrupts || []);
            for (const interrupt of interrupts) {
                for (const action of (interrupt.value?.actionRequests || [])) {
                    if (action.args?.todos) {
                        this.lastPlanText = extractPlan(action.args.todos) || '';
                    }
                }
            }
        } catch (_) {

        }


        try {
            await this.processStream(stream)
        } catch (error) {
            if (isRecursionLimitError(error)) {
                console.error('Agent hit the recursion limit for input:', this.userInput);
                const apology = 'I was not able to finish that request — it needed more steps than I am allowed to take. Could you break it into smaller requests?';
                await this.history.addUserMessage(this.userInput);
                await this.history.addAIChatMessage(apology);
                return { reply: apology, chart: null, replyStreamed: false };
            }
            throw error;  // unexpected error — let the route send an `error` event
        }

        // NEW: if the run was paused for approval, do NOT finalize —
        // nothing is saved to history until the run actually completes
        const interruptResult = await this.checkInterrupts();
        if (interruptResult) return interruptResult;

        return await this.finalizeRun();
    }

    async finalizeRun() {
        this.streamNewThoughts();
        const chart = takeChartConfig(this.sessionId);
        const plan = this.todos ? extractPlan(this.todos) : null;
        const thoughts = takeThoughts(this.sessionId);  // drain display-only thoughts; not saved to history

        await this.history.addUserMessage(this.userInput);
        await this.history.addAIChatMessage(this.reply || '(no reply)', chart);

        return { reply: this.reply || '(no reply)', chart, plan, thoughts, replyStreamed: this.replyStreamed };

    }

    // After the stream ends, ask the checkpointer whether the run was
    // paused for approval. Returns an approval-request result if so,
    // or null if the run completed normally.
    async checkInterrupts() {
        const threadId =
            this.runConfig.configurable.thread_id;

        const state = await this.activeAgent.getState({
            configurable: {
                thread_id: threadId
            }
        });

        const interrupts = (state.tasks || []).flatMap(
            function (task) {
                return task.interrupts || [];
            }
        );

        if (interrupts.length === 0) {
            return null;
        }

        const hitlRequest = interrupts[0].value;

        // Save everything required to resume the streaming run.
        setPendingApproval(this.sessionId, {
            threadId,
            thinking: this.thinking,
            input: this.userInput,

            // LangChain requires one decision for every interrupted action.
            actionCount: hitlRequest.actionRequests.length
        });

        // Return the complete approval request to the chat interface.
        return {
            reply: approvalReply(hitlRequest),
            chart: null,
            plan: null,
            replyStreamed: false
        };
    }




}

module.exports = { StreamingAgent }