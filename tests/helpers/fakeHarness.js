const { AgentOutput } = require('../../admin/modules/AgentOutput');

function createHistory() {
  return {
    saved: [],
    async getMessages() { return []; },
    async addUserMessage(content) { this.saved.push({ role: 'human', content }); },
    async addAIChatMessage(content, chart = null) { this.saved.push({ role: 'ai', content, chart }); }
  };
}

function createHarness({ events = [], state = { tasks: [] }, duringStream } = {}) {
  const history = createHistory();
  const session = {
    sessionId: 1,
    history,
    output: new AgentOutput(),
    pendingApproval: null,
    peekPendingApproval() { return this.pendingApproval; },
    setPendingApproval(value) { this.pendingApproval = value; },
    takePendingApproval() {
      const value = this.pendingApproval;
      this.pendingApproval = null;
      return value;
    },
    async withLock(task) { return task(); }
  };

  const runnable = {
    calls: [],
    async *streamEvents(input, config) {
      this.calls.push({ input, config });
      if (duringStream) await duringStream(session);
      for (const event of events) yield event;
    },
    async getState(config) {
      return typeof state === 'function' ? state(config) : state;
    }
  };

  const agent = {
    getRunnable() { return runnable; }
  };

  return { agent, session, runnable, history };
}

const replyDelta = text => ({
  event: 'on_chat_model_stream',
  data: { chunk: { content: text } }
});

const replyFinal = text => ({
  event: 'on_chat_model_end',
  data: { output: { content: text, tool_calls: [] } }
});

const planUpdate = todos => ({
  event: 'on_chain_stream',
  data: { chunk: { agent: { todos } } }
});

const finalState = todos => ({
  event: 'on_chain_end',
  data: { output: { messages: [], todos } }
});

module.exports = { createHarness, replyDelta, replyFinal, planUpdate, finalState };
