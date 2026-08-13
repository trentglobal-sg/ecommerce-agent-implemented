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

    }

    // TODO: event processors here

   
    chunk(text) {

    }

    async processEvent(event) {


    }

    async processStream(stream) {



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