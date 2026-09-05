class AgentOutput {
  constructor() {
    this.chart = null;
    this.thoughts = [];
  }

  setChart(chart) {
    this.chart = chart;
  }

  addThought(thought) {
    if (thought) this.thoughts.push(thought);
  }

  addThoughts(thoughts) {
    for (const thought of thoughts || []) this.addThought(thought);
  }

  peekThoughts() {
    return [...this.thoughts];
  }

  drain() {
    const result = {
      chart: this.chart,
      thoughts: [...this.thoughts]
    };
    this.chart = null;
    this.thoughts = [];
    return result;
  }
}

module.exports = { AgentOutput };
