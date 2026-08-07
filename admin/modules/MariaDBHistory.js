const { BaseChatMessageHistory } = require('@langchain/core/chat_history');
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const pool = require('../../database');

function parseChartConfig(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  return typeof value === 'string' ? JSON.parse(value) : value;
}

class MariaDBChatHistory extends BaseChatMessageHistory {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
  }

  async getMessages() {
    const [rows] = await pool.execute(
      `SELECT role, content, chart_config FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC`,
      [this.sessionId]
    );
    return rows.map(row => {
      const msg = row.role === 'human'
        ? new HumanMessage(row.content)
        : new AIMessage(row.content);
      msg.chartConfig = parseChartConfig(row.chart_config);
      return msg;
    });
  }

  async addMessage(message, chartConfig = null) {
    const role = message._getType() === 'human' ? 'human' : 'ai';
    await pool.execute(
      `INSERT INTO chat_messages (session_id, role, content, chart_config) VALUES (?, ?, ?, ?)`,
      [this.sessionId, role, message.content, chartConfig ? JSON.stringify(chartConfig) : null]
    );
  }

  async addUserMessage(content) {
    await this.addMessage(new HumanMessage(content));
  }

  async addAIChatMessage(content, chartConfig = null) {
    await this.addMessage(new AIMessage(content), chartConfig);
  }

  async clear() {
    await pool.execute(`DELETE FROM chat_messages WHERE session_id = ?`, [this.sessionId]);
  }
}

module.exports = { MariaDBChatHistory };