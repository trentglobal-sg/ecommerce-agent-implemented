const { HumanMessage } = require('@langchain/core/messages');
const { agent, thinkingAgent } = require('../../gemini');
const { MariaDBChatHistory } = require('./MariaDBHistory');
const { extractText, extractPlan, isRecursionLimitError } = require('./agentHelpers');
const { takeChartConfig } = require('../tools/chartTools');
const { takeThoughts, peekThoughts } = require('./thoughts');

function extractReplyText(content) {
    if (Array.isArray(content)) {
        return content
            .map(part => (typeof part === 'string' ? part : (part && part.thought === true ? '' : part.text || '')))
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

    processTokens = async (data, event) => {
        const c = data.chunk;
        // if there's no content, return
        if (!c || !c.content) return;
        // if content is not a string, return immediately, as arrays hold thoughts or tool calls
        if (typeof c.content !== 'string') return;
        // if there are tool call chunks, return (a tool-call turn, not reply text)
        if ((c.tool_call_chunks || []).length > 0) return;

        const prefix = (this.replyStreamed === false) ? '\n\n---\n\n' : '';
        this.chunk(prefix + c.content);
        this.replyStreamed = true;
    }

    processChatModelEnd = async (data) => {
        const output = data.output;
        if (output && (!output.tool_calls || output.tool_calls.length === 0)) {
            // a turn with no tool calls ends the agent loop, so this is the reply
            this.reply = extractReplyText(output.content);
        }
    }

    processToolStart = async (data, event) => {
        if (event.name === 'write_todos') return;  // the plan chunk follows from the state update
        this.chunk(`\n\n🔧 *Calling \`${event.name}\`...*`);
    }

    processToolEnd = async (data, event) => {
        function processToolEnd(data, event) {
            if (event.name !== 'write_todos') chunk(' ✔️');
        }
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

        return await this.finalizeRun();
    }

    async finalizeRun() {
        const chart = takeChartConfig(this.sessionId);
        const plan = this.todos ? extractPlan(this.todos) : null;
        takeThoughts(this.sessionId);  // drain display-only thoughts; not saved to history

        await this.history.addUserMessage(this.userInput);
        await this.history.addAIChatMessage(this.reply || '(no reply)', chart);

        return { reply: this.reply || '(no reply)', chart, plan, replyStreamed: this.replyStreamed };

    }


}

module.exports = { StreamingAgent }