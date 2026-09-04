const { HumanMessage } = require('@langchain/core/messages');
const { agent, thinkingAgent } = require('../../gemini');
const { MariaDBChatHistory } = require('./MariaDBHistory');
const { extractText, extractPlan, isRecursionLimitError } = require('./agentHelpers');
const { takeChartConfig } = require('../tools/chartTools');
const { takeThoughts } = require('./thoughts');


const { Command } = require('@langchain/langgraph');
const { setPendingApproval, takePendingApproval, approvalReply, buildResumeDecisions } = require('./approval');
const { randomUUID } = require('crypto');



/**
 * 
 * @param {*} input 
 * @param {*} config 
 * @param {*} thinking 
 * @returns 
 */
async function runAgent(input, config, thinking = false) {
  const { sessionId } = config.configurable;
  const history = new MariaDBChatHistory(sessionId);
  const pastMessages = await history.getMessages();

  let response;
  const activeAgent = thinking ? thinkingAgent : agent;

  const threadId = randomUUID();
  const runConfig = {
    ...config,
    configurable: {
      ...config.configurable,
      thread_id: threadId,
    },
    recursionLimit: 50,
  };

  try {
    // The agent runs the full tool-calling loop internally.
    // 25 steps (the default) is not enough once planning is involved.
    // Note the ...config: the second argument REPLACES the run's config,
    // so without it we would lose configurable.sessionId — and the chart
    // tool would have no key to store its chart under.
    response = await activeAgent.invoke(
      { messages: [...pastMessages, new HumanMessage(input.input)] },
      runConfig
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

 if (response.__interrupt__) {
    const hitlRequest = response.__interrupt__[0].value;

    // Save everything required to resume this run.
    setPendingApproval(sessionId, {
      threadId,
      thinking,
      input: input.input,

      // LangChain requires one decision for every interrupted action.
      actionCount: hitlRequest.actionRequests.length
    });

    // Return the complete approval request to the chat interface.
    return {
      reply: approvalReply(hitlRequest),
      chart: null,
      plan: null,
      thoughts: null
    };
  }

  return await finalizeRun(history, response, sessionId, input.input);
}

/**
 * Finalize the agent run by extracting the chart, plan, and thoughts from the response
 * and saving the user and AI messages to the history.
 * @param {MariaDBChatHistory} history - The chat history object
 * @param {Object} response - The response from the agent
 * @param {string} sessionId - The session ID
 * @param {string} input - The user input
 * @returns {Object} - The reply, chart, plan, and thoughts
 */
async function finalizeRun(history, response, sessionId, input) {


  // The chart tool stored its config server-side during the run (step 6).
  // takeChartConfig also removes it, so a stale chart never leaks into the next run.
  const chart = takeChartConfig(sessionId);

  const lastMessage = response.messages[response.messages.length - 1];
  const reply = extractText(lastMessage.content) || '(no reply)';

  // The plan lives in the agent state, not in the message list
  const plan = extractPlan(response.todos);

  const thoughts = takeThoughts(sessionId);

  await history.addUserMessage(input);
  await history.addAIChatMessage(reply, chart);

  return { reply, chart, plan, thoughts };

}

async function resumeAgent(sessionId, decisions) {
  const history = new MariaDBChatHistory(sessionId);
  const pending = takePendingApproval(sessionId);

  if (!pending) {
    throw new Error(
      'No pending approval found for this session'
    );
  }

  const activeAgent = pending.thinking
    ? thinkingAgent
    : agent;

  // Convert the user's one yes/no answer into one decision
  // for every interrupted action.
  const resumeDecisions = buildResumeDecisions(
    decisions,
    pending.actionCount
  );

  const resumeCommand = new Command({
    resume: {
      decisions: resumeDecisions
    }
  });

  const runConfig = {
    configurable: {
      sessionId,
      thread_id: pending.threadId
    },
    recursionLimit: 50
  };

  const response = await activeAgent.invoke(
    resumeCommand,
    runConfig
  );

  // The resumed agent may produce another approval request.
  if (response.__interrupt__) {
    const hitlRequest = response.__interrupt__[0].value;

    // The new interrupt may contain a different number of actions.
    pending.actionCount = hitlRequest.actionRequests.length;

    // Save the pending run again so it can be resumed another time.
    setPendingApproval(sessionId, pending);

    return {
      reply: approvalReply(hitlRequest),
      chart: null,
      plan: null,
      thoughts: null
    };
  }

  return await finalizeRun(
    history,
    response,
    sessionId,
    pending.input
  );
}

module.exports = { runAgent, resumeAgent };
