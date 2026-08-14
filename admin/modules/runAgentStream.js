// admin/modules/runAgentStream.js
const { HumanMessage } = require('@langchain/core/messages');
const { agent, thinkingAgent } = require('../../gemini');
const { MariaDBChatHistory } = require('./MariaDBHistory');
const { extractText, extractPlan, isRecursionLimitError } = require('./agentHelpers');
const { takeChartConfig } = require('../tools/chartTools');
const { takeThoughts, peekThoughts } = require('./thoughts');
const { StreamingAgent } = require('./StreamingAgent');


// For HITL
const { Command } = require("@langchain/langgraph");
const { randomUUID} = require("crypto");
const {takePendingApproval} = require("./approval")

// start a new run of the agent
async function runAgentStream(input, config, thinking = false, onEvent) {
    const { sessionId } = config.configurable;
    const history = new MariaDBChatHistory(sessionId);
    const pastMessages = await history.getMessages();

    const threadId = randomUUID();
    const activeAgent = thinking ? thinkingAgent : agent;
    const runConfig = { ...config, 
        configurable: {
            ...config.configurable, thread_id: threadId
        },
        recursionLimit: 50, 
        version: 'v2' };
    const streamInput = { messages: [...pastMessages, new HumanMessage(input.input)] };

    const streamingAgent = new StreamingAgent({
        activeAgent, streamInput, runConfig, sessionId,
        userInput: input.input, thinking, history
    }, onEvent);
    
    return streamingAgent.run();
}

async function resumeAgentStream(sessionId, decisions, onEvent) {
    const pending = takePendingApproval(sessionId);
    if (!pending) {
        return { reply:"Nothing is waiting for approval", chart: null, plan: null, replyStreamed:false}
    }
    const history = new MariaDBChatHistory(sessionId);
    const activeAgent = pending.thinking ? thinkingAgent : agent;
    const runConfig = {
        configurable: { sessionId, thread_id:pending.threadId},
        recursionLimit: 50,
        version: 'v2'
    }
    const streamInput = new Command({
        resume: {
            decisions: Array.isArray(decisions) ? decisions : [decisions]
        }
    })

    const streamingAgent = new StreamingAgent({
        activeAgent, streamInput, runConfig, sessionId, userInput: pending.input,
        thinking: pending.thinking, history
    }, onEvent);
    return streamingAgent.run();
    
}


module.exports = {
    runAgentStream, resumeAgentStream
};
