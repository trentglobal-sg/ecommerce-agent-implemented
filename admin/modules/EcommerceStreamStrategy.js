// STUDENT FILE (optional streaming lesson)
//
// AgentRunner supplies normalized events. Implement the handler methods to
// return arrays of complete frames. Returning [] is always safe, so the final
// `done` frame keeps the application working before this exercise is complete.
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
    // TODO(student): return a chunk frame containing event.text, and set
    // replyStarted so the final reply is not rendered twice.
    void event;
    return [];
  }

  handleThought(event) {
    // TODO(student): return a chunk frame for a visible thought.
    void event;
    return [];
  }

  handleToolStart(event) {
    // TODO(student): return a progress frame. write_todos is usually hidden.
    void event;
    return [];
  }

  handleToolEnd(event) {
    // TODO(student): return a completion frame.
    void event;
    return [];
  }

  handlePlanChange(event) {
    // TODO(student): return a frame containing the formatted plan.
    void event;
    return [];
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
