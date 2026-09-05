// Instructor-owned decorator. All event-specific choices live in the injected
// strategy, while all lifecycle behavior remains in AgentRunner.
class StreamedAgentRunner {
  constructor(runner, strategy) {
    this.runner = runner;
    this.strategy = strategy;
  }

  async run(input) {
    let result;
    try {
      result = await this.runner.run(input, this.strategy);
      this.strategy.frameWriter.write(this.strategy.complete(result));
    } catch (error) {
      this.strategy.frameWriter.write(this.strategy.error(error));
      throw error;
    }
    return result;
  }
}

module.exports = { StreamedAgentRunner };
