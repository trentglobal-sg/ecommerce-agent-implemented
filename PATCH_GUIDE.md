# Implementation Guide: Agent Thought Streaming & HITL Sync

Follow these instructions to implement real-time thought streaming, fix the duplicate plan bug, and correct middleware configuration issues.

## 1. Thoughts Module Enhancements
**File:** `admin/modules/thoughts.js`

1. Update `extractThoughtBlocks` to support both `@langchain/google-genai` (`type: 'thinking', thinking: '...'`) and legacy `@langchain/google/node` (`thought: true, text: '...'`).
2. Update the fallback justification parser to handle array content.
3. Add a `peekThoughts` function to allow reading reasoning without clearing the store, and export it.

```javascript
// When includeThoughts is on, reasoning arrives as content blocks with type: 'thinking' (or thought: true)
function extractThoughtBlocks(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter(part => part && (part.thought === true || part.type === 'thinking') && (part.thinking || part.text))
    .map(part => part.thinking || part.text);
}

// In thoughtMiddleware afterModel fallback:
      const justification = await model.invoke([
        ['system', 'You explain AI agent decisions in one short sentence.'],
        ['human', `The user asked: "${lastHuman?.content}". The agent decided to call: ${toolCallText}. In one short sentence, explain why.`]
      ], {tags: ["justification"]});
      const text = typeof justification.content === 'string'
        ? justification.content
        : (Array.isArray(justification.content)
            ? justification.content.filter(p => p.type === 'text' || (!p.thought && p.type !== 'thinking')).map(p => p.text || (typeof p === 'string' ? p : '')).join('')
            : '');
      if (text) thoughts = [text];

// Add this function
function peekThoughts(sessionId) {
  return thoughtStore.get(String(sessionId)) || [];
}

module.exports = {
  extractThoughtBlocks, 
  thoughtMiddleware, 
  takeThoughts, 
  peekThoughts
};
```

## 2. Core Agent Configuration Fix
**File:** `gemini.js`

1. Configure `ChatGoogleGenerativeAI` with `thinkingConfig: { includeThoughts: true, thinkingLevel: "high" }`.
2. Ensure the system prompt encourages reasoning before tool selection (otherwise Gemini jumps straight to tool calls without generating thought tokens).
3. Ensure that `createAgent` uses the singular `middleware` key.

```javascript
const model = new ChatGoogleGenerativeAI({
  model: "gemini-3.1-flash-lite",
  apiKey: process.env.GEMINI_API_KEY,
  thinkingConfig: {
      includeThoughts: true,
      thinkingLevel: "high"
  }
});

const prompt = `You are a helpful admin assistant for an ecommerce store. Format your responses using markdown.

Before choosing tools or planning actions, reason through the admin's request, assess the necessary parameters and data thresholds, and evaluate your business logic.

You ONLY help with ecommerce administration tasks such as:
...`;

const middlewares = [
  injectionDetectionMiddleware,
  todoListMiddleware(),
  approvalMiddleware
];

const agent = createAgent({
  model,
  tools,
  systemPrompt: prompt,
  middleware: middlewares, // CRITICAL: Must be singular 'middleware'
  checkpointer
});

const thinkingAgent = createAgent({
  model,
  tools,
  systemPrompt: prompt,
  middleware: [...middlewares, thoughtMiddleware], // CRITICAL: Must be singular 'middleware'
  checkpointer
});
```

## 3. StreamingAgent Logic Updates
**File:** `admin/modules/StreamingAgent.js`

### A. Syncing Plans on Resumption
Update the `run()` method to check for pending interrupts. This prevents the agent from showing a "new" plan after the admin has already approved a "Proposed plan."

```javascript
async run() {
    const stream = this.activeAgent.streamEvents(this.streamInput, this.runConfig);

    try {
        const initialState = await this.activeAgent.getState(this.runConfig);
        if (initialState?.values?.todos) {
            this.lastPlanText = extractPlan(initialState.values.todos) || '';
        }

        // Add this block to check for pending interrupts
        const interrupts = (initialState.tasks || []).flatMap(t => t.interrupts || []);
        for (const interrupt of interrupts) {
            for (const action of (interrupt.value?.actionRequests || [])) {
                if (action.args?.todos) {
                    this.lastPlanText = extractPlan(action.args.todos) || '';
                }
            }
        }
    } catch (_) {}
    
    // ... rest of run() ...
}
```

### B. Real-time Thought Streaming & Event Tag Filtering
Add a helper to poll for thoughts, update `processTokens` to support models with native reasoning, and filter out inner `justification` stream tokens so they do not print twice.

```javascript
// Add this helper method to the class
streamNewThoughts() {
    const thoughts = peekThoughts(this.sessionId);
    if (thoughts.length > this.streamedThoughts) {
        const newThoughts = thoughts.slice(this.streamedThoughts);
        for (const t of newThoughts) {
            this.chunk(`\n\n> 💭 *${t}*`);
        }
        this.streamedThoughts = thoughts.length;
    }
}

// Update processTokens to ignore 'justification' tags and handle array-based content (native thoughts)
processTokens = async (data, event) => {
    if (event?.tags?.includes('justification')) return;
    const c = data.chunk;
    if (!c || !c.content) return;

    if (Array.isArray(c.content)) {
        for (const part of c.content) {
            const thoughtText = (part && (part.thought === true || part.type === 'thinking')) ? (part.thinking || part.text) : null;
            if (thoughtText) {
                this.chunk(`\n\n> 💭 *${thoughtText}*`);
            }
        }
    }

    if (typeof c.content !== 'string') return;
    if ((c.tool_call_chunks || []).length > 0) return;

    const prefix = (this.replyStreamed === false) ? '\n\n---\n\n' : '';
    this.chunk(prefix + c.content);
    this.replyStreamed = true;
}
```

### C. Hooking Into Events
Call `streamNewThoughts()` inside `processChatModelEnd` and `processToolStart`, and ignore `justification` tags when setting `this.reply`.

```javascript
processChatModelEnd = async (data, event) => {
    this.streamNewThoughts(); // Stream before finishing
    if (event?.tags?.includes('justification')) return;
    const output = data.output;
    if (output && (!output.tool_calls || output.tool_calls.length === 0)) {
        this.reply = extractReplyText(output.content);
    }
}

processToolStart = async (data, event) => {
    this.streamNewThoughts(); // Stream before tool execution
    if (event.name === 'write_todos') return;
    this.chunk(`\n\n🔧 *Calling \`${event.name}\`...*`);
}
```

## 4. Multiple Action Resume Decisions & State Propagation

When an agent pauses on multiple simultaneous tool calls (e.g. batch operations or multiple tools in `interruptOn`), LangGraph expects an array of decisions matching the number of actions in `actionRequests`.

### A. Add `buildResumeDecisions` Helper
**File:** `admin/modules/approval.js`

```javascript
function buildResumeDecisions(decisions, actionCount) {
    let suppliedDecisions;

    if (Array.isArray(decisions)) {
        suppliedDecisions = decisions;
    } else {
        suppliedDecisions = [decisions];
    }

    if (suppliedDecisions.length !== 1) {
        return suppliedDecisions;
    }

    const resumeDecisions = [];
    for (let index = 0; index < actionCount; index++) {
        resumeDecisions.push(Object.assign({}, suppliedDecisions[0]));
    }

    return resumeDecisions;
}

module.exports = { 
  approvalMiddleware, 
  setPendingApproval, 
  takePendingApproval, 
  hasPendingApproval, 
  formatApproval, 
  approvalReply, 
  parseDecision, 
  buildResumeDecisions 
};
```

### B. Track `actionCount` in Interrupts and Build Decisions on Resume
* In `admin/modules/runAgent.js` and `admin/modules/StreamingAgent.js`: Store `actionCount: hitlRequest.actionRequests.length` in `setPendingApproval`.
* In `resumeAgent` (`admin/modules/runAgent.js`) and `resumeAgentStream` (`admin/modules/runAgentStream.js`):
```javascript
const resumeDecisions = buildResumeDecisions(decisions, pending.actionCount);
const resumeCommand = new Command({
    resume: { decisions: resumeDecisions }
});
```

## 5. Verification
1. Run the agent with `thinking: true`.
2. Trigger a multi-step task (e.g., "Find low stock and restock").
3. **Expected:** You should see `> 💭` blocks appearing in real-time with genuine reasoning.
4. **Expected:** After clicking "Yes" on a plan, the plan should NOT be printed a second time.
5. **Expected:** Multi-action approvals (e.g., batch restocks) resume cleanly with a single "yes" reply.
