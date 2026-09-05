const { BaseChatMessageHistory } = require('@langchain/core/chat_history');

// STUDENT FILE: implement persistent LangChain history using chat_messages.
// These safe defaults keep the chat page and placeholder agent runnable.
class MariaDBChatHistory extends BaseChatMessageHistory {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
  }

  async getMessages() {
    // TODO(student): read ordered rows and convert them to LangChain messages.
    return [];
  }

  async addMessage(message, chartConfig = null) {
    // TODO(student): store the role, content, and optional chart JSON.
    void message;
    void chartConfig;
  }

  async addUserMessage(content) {
    return this.addMessage({ _getType: () => 'human', content });
  }

  async addAIChatMessage(content, chartConfig = null) {
    return this.addMessage({ _getType: () => 'ai', content }, chartConfig);
  }

  async clear() {
    // TODO(student): delete messages for only this session.
  }
}

module.exports = { MariaDBChatHistory };
