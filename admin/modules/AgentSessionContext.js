const { MemorySaver } = require('@langchain/langgraph');
const { MariaDBChatHistory } = require('./MariaDBHistory');
const { AgentOutput } = require('./AgentOutput');

// Instructor-owned runtime state. EcommerceAgent receives this object, but
// students do not need to implement checkpoint, locking, or approval storage.
class AgentSessionContext {
  constructor({ sessionId, history, checkpointer, services = {} }) {
    this.sessionId = sessionId;
    this.history = history || new MariaDBChatHistory(sessionId);
    this.checkpointer = checkpointer || new MemorySaver();
    this.services = services;
    this.output = new AgentOutput();
    this.pendingApproval = null;
    this.queue = Promise.resolve();
  }

  peekPendingApproval() {
    return this.pendingApproval;
  }

  setPendingApproval(approval) {
    this.pendingApproval = approval;
  }

  takePendingApproval() {
    const pending = this.pendingApproval;
    this.pendingApproval = null;
    return pending;
  }

  withLock(task) {
    const result = this.queue.then(task, task);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

module.exports = { AgentSessionContext };
