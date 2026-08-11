const { HumanMessage } = require('@langchain/core/messages');
const { agent } = require('../../gemini');
const { MariaDBChatHistory } = require('./MariaDBHistory');
const { extractText, extractPlan, isRecursionLimitError } = require('./agentHelpers');
const { takeChartConfig } = require('../tools/chartTools');



async function runAgent(input, config) {
  const { sessionId } = config.configurable;
  const history = new MariaDBChatHistory(sessionId);
  const pastMessages = await history.getMessages();

  let response;
  try {
    // The agent runs the full tool-calling loop internally.
    // 25 steps (the default) is not enough once planning is involved.
    // Note the ...config: the second argument REPLACES the run's config,
    // so without it we would lose configurable.sessionId — and the chart
    // tool would have no key to store its chart under.
    response = await agent.invoke(
      { messages: [...pastMessages, new HumanMessage(input.input)] },
      { ...config, recursionLimit: 50 }
    );
  } catch (error) {
    if (isRecursionLimitError(error)) {
      // The agent looped too many times. Instead of crashing, apologise in
      // character, save the exchange to history, and let the chat carry on.
      console.error('Agent hit the recursion limit for input:', input.input);
      const reply = 'I was not able to finish that request — it needed more steps than I am allowed to take. Could you break it into smaller requests? For example, ask me to find the low-stock products first, then create the restock orders one product at a time.';
      await history.addUserMessage(input.input);
      await history.addAIChatMessage(reply);
      return { reply, chart: null, plan: null };
    }
    throw error;  // Some other error — let the route's error handler deal with it
  }

  // The chart tool stored its config server-side during the run (step 6).
  // takeChartConfig also removes it, so a stale chart never leaks into the next run.
  const chart = takeChartConfig(sessionId);

  const lastMessage = response.messages[response.messages.length - 1];
  const reply = extractText(lastMessage.content) || '(no reply)';

  // The plan lives in the agent state, not in the message list
  const plan = extractPlan(response.todos);

  await history.addUserMessage(input.input);
  await history.addAIChatMessage(reply, chart);

  return { reply, chart, plan };
}

module.exports = { runAgent };
