const { extractPlan } = require('./agentHelpers');

// The one student-customizable streaming surface. It receives semantic agent
// events, and its handlers return complete frontend frames.
class EcommerceStreamStrategy {
  constructor(frameWriter) {
    this.frameWriter = frameWriter;
    this.replyStarted = false;
    this.handlers = {
      'reply-delta': event => this.handleReplyDelta(event),
      thought: event => this.handleThought(event),
      'tool-start': event => this.handleToolStart(event),
      'tool-end': event => this.handleToolEnd(event),
      'plan-change': event => this.handlePlanChange(event)
    };
  }

  async handle(event) {
    const frames = this.handlers[event.type]?.(event) || [];
    for (const frame of frames) this.frameWriter.write(frame);
  }

  handleReplyDelta(event) {
    const prefix = this.replyStarted ? '' : '\n\n---\n\n';
    this.replyStarted = true;
    return [this.chunk(prefix + event.text)];
  }

  handleThought(event) {
    return [this.chunk(`\n\n> 💭 *${event.text}*`)];
  }

  handleToolStart(event) {
    if (event.name === 'write_todos') return [];
    return [this.chunk(`\n\n🔧 *Calling \`${event.name}\`...*`)];
  }

  handleToolEnd(event) {
    if (event.name === 'write_todos') return [];
    return [this.chunk(' ✔️')];
  }

  handlePlanChange(event) {
    const plan = event.text || extractPlan(event.todos);
    return plan ? [this.chunk(`\n\n${plan}`)] : [];
  }

  complete(result) {
    return { event: 'done', data: result };
  }

  error() {
    return { event: 'error', data: { reply: 'Sorry, something went wrong.' } };
  }

  didStreamReply() {
    return this.replyStarted;
  }

  chunk(text) {
    return { event: 'chunk', data: { text } };
  }
}

module.exports = { EcommerceStreamStrategy };
