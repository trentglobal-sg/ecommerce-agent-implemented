// admin/modules/thoughts.js
const { createMiddleware } = require('langchain');

// Thoughts captured during a run, keyed by chat session.
// Same pattern as the chart store: drain it after the run completes.
const thoughtStore = new Map();

// When includeThoughts is on, reasoning arrives as content blocks with type: 'thinking' (or thought: true)
function extractThoughtBlocks(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter(part => part && (part.thought === true || part.type === 'thinking') && (part.thinking || part.text))
    .map(part => part.thinking || part.text);
}

const thoughtMiddleware = createMiddleware({
  name: 'thoughtMiddleware',
  afterModel: async (state, runtime) => {

    console.log("Inside thoughtMiddleware")
    // dynamic require here to avoid circular references
    const { model } = require("../../gemini");

    const last = state.messages[state.messages.length - 1];
    if (!last || last._getType() !== 'ai') return;

	    // We only care about tool-calling turns — the final answer is the reply, not a thought
    if (!last.tool_calls || last.tool_calls.length === 0) return;

    const sessionId = runtime?.configurable?.sessionId;
    if (sessionId == null) return;

    // 1. Real reasoning, if includeThoughts produced any
    let thoughts = extractThoughtBlocks(last.content);
    console.log("Thoughts from extractThoughtBlocks =", thoughts)
    // 2. Nothing there? Force it: ask the model to justify its own tool calls
    if (thoughts.length === 0) {
      const toolCallText = last.tool_calls
        .map(tc => `${tc.name}(${JSON.stringify(tc.args)})`)
        .join(', ');
      const lastHuman = [...state.messages].reverse().find(m => m._getType() === 'human');
      const justification = await model.invoke([
        ['system', 'You explain AI agent decisions in one short sentence.'],
        ['human', `The user asked: "${lastHuman?.content}". The agent decided to call: ${toolCallText}. In one short sentence, explain why.`]
      ], {tags: ["justification"]});
      const text = typeof justification.content === 'string'
        ? justification.content
        : (Array.isArray(justification.content)
            ? justification.content.filter(p => p.type === 'text' || (!p.thought && p.type !== 'thinking')).map(p => p.text || (typeof p === 'string' ? p : '')).join('')
            : '');
      console.log("Custom created justification =", text);
      if (text) thoughts = [text];
    }

    if (thoughts.length > 0) {
      const key = String(sessionId);
      thoughtStore.set(key, [...(thoughtStore.get(key) || []), ...thoughts]);
    }
  }
});

// Read and remove the thoughts for a session, so they never leak into the next run
function takeThoughts(sessionId) {
  const t = thoughtStore.get(String(sessionId));
  thoughtStore.delete(String(sessionId));
  return t || [];
}

// Read without removing the thoughts for a session
function peekThoughts(sessionId) {
  return thoughtStore.get(String(sessionId)) || [];
}

module.exports = {
  extractThoughtBlocks, thoughtMiddleware, takeThoughts, peekThoughts
};
