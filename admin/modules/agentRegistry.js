class AgentRegistry {
  constructor(createSession) {
    this.createSession = createSession;
    this.sessions = new Map();
  }

  get(sessionId) {
    const key = String(sessionId);
    if (!this.sessions.has(key)) {
      this.sessions.set(key, this.createSession(sessionId));
    }
    return this.sessions.get(key);
  }

  remove(sessionId) {
    return this.sessions.delete(String(sessionId));
  }
}

module.exports = { AgentRegistry };
