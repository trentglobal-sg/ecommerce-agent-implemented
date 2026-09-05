# Agent teaching surface

The HTTP routes and runner lifecycle are completed infrastructure. Students
work on the parts that describe what the ecommerce agent is and can do.

## Student-editable hooks

`admin/modules/EcommerceAgent.js` exposes four intentional hooks:

- `getSystemPrompt()` defines the agent's role and rules.
- `createTools({ services, output })` registers tools. `output.setChart()` is
  the supported way for a tool to attach an ApexCharts configuration.
- `createMiddleware({ model, output })` registers middleware in execution
  order. Thought middleware uses `output.addThought()`/`addThoughts()`.
- `createRunnable(configuration)` performs the LangChain `createAgent()` call.

The optional streaming exercise lives in
`admin/modules/EcommerceStreamStrategy.js`. Its handlers receive normalized
events and return complete frontend frames. Students never edit the event
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
