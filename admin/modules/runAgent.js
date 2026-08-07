const { HumanMessage } = require('@langchain/core/messages');
const { agent } = require('../../gemini');
const { MariaDBChatHistory } = require('./MariaDBHistory');
const { extractText } = require('./agentHelpers');
const { takeChartConfig } = require('../tools/chartTools');

async function runAgent(input, config) {
  const { sessionId } = config.configurable;
  const history = new MariaDBChatHistory(sessionId);
  const pastMessages = await history.getMessages();

  // The agent runs the full tool-calling loop internally
  const response = await agent.invoke(
    {
      messages: [...pastMessages, new HumanMessage(input.input)],
    },
    config
  );

  // Retrieve the chart generated during this run, if any
  const chart = takeChartConfig(sessionId);

  const lastMessage = response.messages[response.messages.length - 1];
  const reply = extractText(lastMessage.content) || '(no reply)';

  await history.addUserMessage(input.input);
  await history.addAIChatMessage(reply, chart);

  return { reply, chart };
}

module.exports = { runAgent };
