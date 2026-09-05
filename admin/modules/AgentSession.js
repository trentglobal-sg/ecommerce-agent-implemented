const { AgentRunner } = require('./AgentRunner');
const { StreamedAgentRunner } = require('./StreamedAgentRunner');
const { EcommerceStreamStrategy } = require('./EcommerceStreamStrategy');

// Public agent-layer facade used by routes. It hides both runner classes.
class AgentSession {
  constructor({ agent, runtime }) {
    this.agent = agent;
    this.runtime = runtime;
  }

  respond(input) {
    return new AgentRunner(this.agent, this.runtime).run(input);
  }

  stream(input, frameWriter) {
    const runner = new AgentRunner(this.agent, this.runtime);
    const strategy = new EcommerceStreamStrategy(frameWriter);
    return new StreamedAgentRunner(runner, strategy).run(input);
  }
}

module.exports = { AgentSession };
