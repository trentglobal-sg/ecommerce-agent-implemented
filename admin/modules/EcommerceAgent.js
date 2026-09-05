const { createAgent } = require('langchain');
const { StarterAgentRunnable } = require('./StarterAgentRunnable');

// STUDENT FILE
// Complete the four hooks below. The fallback runnable keeps the application
// and chat UI operational until the LangChain agent is implemented.
class EcommerceAgent {
  constructor({ model, runtime }) {
    this.model = model;
    this.runtime = runtime;

    this.tools = this.createTools({ services: runtime.services, output: runtime.output });
    this.middleware = this.createMiddleware({ model, output: runtime.output });

    const configuration = {
      model,
      tools: this.tools,
      middleware: this.middleware,
      systemPrompt: this.getSystemPrompt(),
      checkpointer: runtime.checkpointer
    };

    this.standardAgent = this.createRunnable(configuration);
    this.thinkingAgent = this.standardAgent;
  }

  getSystemPrompt() {
    // TODO(student): Define the role, scope, safety rules, planning behavior,
    // and instructions for tool output such as charts.
    return 'You are an ecommerce agent that has not been implemented yet.';
  }

  createTools({ services, output }) {
    // TODO(student): Import, construct, and return the LangChain tools.
    // Pass `output` to tools that publish UI artifacts.
    void services;
    void output;
    return [];
  }

  createMiddleware({ model, output }) {
    // TODO(student): Construct and return middleware in execution order.
    void model;
    void output;
    return [];
  }

  createRunnable(configuration) {
    // TODO(student): Replace the fallback with:
    // return createAgent(configuration);
    void createAgent;
    void configuration;
    return new StarterAgentRunnable();
  }

  getRunnable(thinking = false) {
    return thinking ? this.thinkingAgent : this.standardAgent;
  }
}

module.exports = { EcommerceAgent };
