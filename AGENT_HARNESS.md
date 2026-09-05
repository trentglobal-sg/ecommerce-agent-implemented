# Student starter: agent teaching surface

The HTTP routes and runner lifecycle are completed infrastructure. Students
work on the parts that describe what the ecommerce agent is and can do.

## Student-editable hooks

The application initially uses `StarterAgentRunnable`, so the server and chat
UI work before any model calls are enabled. Replace that fallback only when
the LangChain configuration is ready.

`admin/modules/EcommerceAgent.js` exposes four intentional TODO hooks:

- `getSystemPrompt()` defines the agent's role and rules.
- `createTools(services, output)` registers tools. `output.setChart()` is
  the supported way for a tool to attach an ApexCharts configuration.
- `createMiddleware(model, output)` registers middleware in execution
  order. Thought middleware uses `output.addThought()`/`addThoughts()`.
- `createRunnable(configuration)` performs the LangChain `createAgent()` call.

The optional streaming exercise lives in
`admin/modules/EcommerceStreamStrategy.js`. Its handlers receive normalized
events and currently return no frames; the final `done` frame still displays
the placeholder response. Students never edit the event
loop, approval resumption, checkpoints, history finalization, or routes.

## Normalized streaming events

The strategy receives only:

- `{ type: 'reply-delta', text }`
- `{ type: 'thought', text }`
- `{ type: 'tool-start', name }`
- `{ type: 'tool-end', name }`
- `{ type: 'plan-change', todos, text }`

Provider-specific LangChain event shapes are handled once by
`AgentEventNormalizer`.

## Instructor-owned harness

Do not make student exercises in these files:

- `AgentSessionContext.js` owns session state and locking.
- `AgentOutput.js` owns transient charts and thoughts.
- `AgentRunner.js` owns new runs, approval resumption, interrupts, history,
  and the final `{ reply, chart, plan, thoughts, replyStreamed }` shape.
- `StreamedAgentRunner.js` applies the streaming strategy.
- `AgentSession.js` is the facade used by fixed routes.
- `agentRegistry.js` keeps one agent session per chat session.

The routes call only `session.respond()` or `session.stream()` and forward the
agent layer's output unchanged.

## Suggested implementation order

1. Write one tool and register it in `createTools()`.
2. Define the system prompt.
3. Add middleware through `createMiddleware()`.
4. Replace `StarterAgentRunnable` with `createAgent(configuration)`.
5. Implement MariaDB history.
6. Implement overlapping PDF chunking.
7. Implement the MySQL operations in `admin/agent-services/`. The existing
   `admin/services/` directory remains completed because the non-agent admin
   pages depend on it.
8. Complete the remaining tools and middleware.
9. Optionally implement the normalized streaming strategy handlers.
