const { extractPlan } = require('./agentHelpers');
function extractThoughtBlocks(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter(part => part && (part.thought === true || part.type === 'thinking') && (part.thinking || part.text))
    .map(part => part.thinking || part.text);
}

// Converts version/provider-specific LangChain events into the small semantic
// event vocabulary consumed by the result collector and streaming strategy.
class AgentEventNormalizer {
  normalize(rawEvent, run, output) {
    const events = [];

    if (rawEvent?.tags?.includes('justification')) return events;

    if (rawEvent.event === 'on_chat_model_stream') {
      const chunk = rawEvent.data?.chunk;
      if (!chunk?.content) return events;

      for (const thought of extractThoughtBlocks(chunk.content)) {
        this._addThought(events, run, thought);
      }

      if (
        typeof chunk.content === 'string' &&
        !(chunk.tool_call_chunks || []).length
      ) {
        events.push({ type: 'reply-delta', text: chunk.content });
      }
    }

    if (rawEvent.event === 'on_chat_model_end') {
      this._addPublishedThoughts(events, run, output);
      const modelOutput = rawEvent.data?.output;
      if (modelOutput && !(modelOutput.tool_calls || []).length) {
        events.push({ type: 'reply-final', content: modelOutput.content });
      }
    }

    if (rawEvent.event === 'on_tool_start') {
      this._addPublishedThoughts(events, run, output);
      events.push({ type: 'tool-start', name: rawEvent.name });
    }

    if (rawEvent.event === 'on_tool_end') {
      events.push({ type: 'tool-end', name: rawEvent.name });
    }

    if (rawEvent.event === 'on_chain_stream') {
      const chunk = rawEvent.data?.chunk;
      if (chunk && typeof chunk === 'object') {
        for (const update of [chunk, ...Object.values(chunk)]) {
          if (!update?.todos) continue;
          const planText = extractPlan(update.todos) || '';
          if (planText !== run.lastPlanText) {
            run.lastPlanText = planText;
            events.push({ type: 'plan-change', todos: update.todos, text: planText });
          }
        }
      }
    }

    if (rawEvent.event === 'on_chain_end') {
      const state = rawEvent.data?.output;
      if (state && Array.isArray(state.messages)) {
        events.push({ type: 'final-state', state });
      }
    }

    return events;
  }

  flushThoughts(run, output) {
    const events = [];
    this._addPublishedThoughts(events, run, output);
    return events;
  }

  _addPublishedThoughts(events, run, output) {
    for (const thought of output.peekThoughts()) {
      this._addThought(events, run, thought);
    }
  }

  _addThought(events, run, thought) {
    if (!thought || run.seenThoughts.has(thought)) return;
    run.seenThoughts.add(thought);
    events.push({ type: 'thought', text: thought });
  }
}

module.exports = { AgentEventNormalizer };
