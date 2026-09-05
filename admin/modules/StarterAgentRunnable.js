const PLACEHOLDER_REPLY = [
  'The application is running, but the ecommerce agent has not been implemented yet.',
  '',
  'Start with the hooks in `admin/modules/EcommerceAgent.js`.'
].join('\n');

class StarterAgentRunnable {
  async *streamEvents() {
    yield { event: 'on_chat_model_stream', data: { chunk: { content: PLACEHOLDER_REPLY } } };
    yield { event: 'on_chat_model_end', data: { output: { content: PLACEHOLDER_REPLY, tool_calls: [] } } };
    yield { event: 'on_chain_end', data: { output: { messages: [], todos: null } } };
  }

  async getState() {
    return { values: {}, tasks: [] };
  }
}

module.exports = { StarterAgentRunnable, PLACEHOLDER_REPLY };
