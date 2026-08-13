// admin/modules/runAgentStream.js
const { HumanMessage } = require('@langchain/core/messages');
const { agent, thinkingAgent } = require('../../gemini');
const { MariaDBChatHistory } = require('./MariaDBHistory');
const { extractText, extractPlan, isRecursionLimitError } = require('./agentHelpers');
const { takeChartConfig } = require('../tools/chartTools');
const { takeThoughts, peekThoughts } = require('./thoughts');
const { StreamingAgent } = require('./StreamingAgent');


// start a new run of the agent
async function runAgentStream(input, config, thinking = false, onEvent) {
    const { sessionId } = config.configurable;
    const history = new MariaDBChatHistory(sessionId);
    const pastMessages = await history.getMessages();

    const activeAgent = thinking ? thinkingAgent : agent;
    const runConfig = { ...config, recursionLimit: 50, version: 'v2' };
    const streamInput = { messages: [...pastMessages, new HumanMessage(input.input)] };

    const streamingAgent = new StreamingAgent({
        activeAgent, streamInput, runConfig, sessionId,
        userInput: input.input, thinking, history
    }, onEvent);
    
    return streamingAgent.run();
}


module.exports = {
    runAgentStream
};
