const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentRunner } = require('../admin/modules/AgentRunner');
const { StreamedAgentRunner } = require('../admin/modules/StreamedAgentRunner');
const { EcommerceStreamStrategy } = require('../admin/modules/EcommerceStreamStrategy');
const { AgentRegistry } = require('../admin/modules/agentRegistry');
const { Command } = require('@langchain/langgraph');
const { shouldApprovePlan } = require('../admin/modules/approval');
const {
  createHarness,
  replyDelta,
  replyFinal,
  planUpdate,
  finalState
} = require('./helpers/fakeHarness');

const TODOS = [{ content: 'Check stock', status: 'pending' }];

test('AgentRunner builds the complete response and saves history', async () => {
  const harness = createHarness({
    events: [planUpdate(TODOS), replyFinal('Done.'), finalState(TODOS)],
    duringStream: async session => {
      session.output.setChart({ chart: { type: 'bar' } });
      session.output.addThought('Stock should be checked');
    }
  });

  const result = await new AgentRunner(harness.agent, harness.session)
    .run({ message: 'Check inventory' });

  assert.deepEqual(result, {
    reply: 'Done.',
    chart: { chart: { type: 'bar' } },
    plan: '**Plan:**\n1. Check stock',
    thoughts: ['Stock should be checked'],
    replyStreamed: false
  });
  assert.deepEqual(harness.history.saved.map(item => item.role), ['human', 'ai']);
  assert.deepEqual(harness.session.output.drain(), { chart: null, thoughts: [] });
});

test('the streaming strategy receives semantic events and returns frontend frames', async () => {
  const harness = createHarness({
    events: [
      planUpdate(TODOS),
      { event: 'on_tool_start', name: 'get_low_stock', data: {} },
      replyDelta('Ready.'),
      replyFinal('Ready.'),
      finalState(TODOS)
    ]
  });
  const frames = [];
  const writer = { write(frame) { frames.push(frame); } };
  const strategy = new EcommerceStreamStrategy(writer);
  const streamed = new StreamedAgentRunner(
    new AgentRunner(harness.agent, harness.session),
    strategy
  );

  const result = await streamed.run({ message: 'Go' });

  assert.equal(result.replyStreamed, true);
  assert.deepEqual(frames.map(frame => frame.event), ['chunk', 'chunk', 'chunk', 'done']);
  assert.match(frames[0].data.text, /Plan/);
  assert.match(frames[1].data.text, /get_low_stock/);
  assert.equal(frames.at(-1).data, result);
});

test('approval is stored and an invalid answer does not consume it', async () => {
  const interrupt = {
    tasks: [{
      interrupts: [{
        value: { actionRequests: [{ description: 'Approve restock' }] }
      }]
    }]
  };
  const harness = createHarness({ events: [], state: interrupt });
  const runner = new AgentRunner(harness.agent, harness.session);

  const paused = await runner.run({ message: 'Restock' });
  assert.match(paused.reply, /Approve restock/);
  assert.equal(harness.history.saved.length, 0);

  const invalid = await runner.run({ message: 'maybe' });
  assert.match(invalid.reply, /yes/);
  assert.ok(harness.session.peekPendingApproval());
});

test('approval resumes the original thread and expands one decision', async () => {
  const harness = createHarness({
    events: [replyFinal('Approved.'), finalState(null)],
    state: { tasks: [] }
  });
  harness.session.setPendingApproval({
    threadId: 'original-thread',
    thinking: false,
    input: 'Create both orders',
    actionCount: 2
  });

  const result = await new AgentRunner(harness.agent, harness.session)
    .run({ message: 'yes' });

  assert.equal(result.reply, 'Approved.');
  assert.equal(harness.runnable.calls[0].config.configurable.thread_id, 'original-thread');
  assert.ok(harness.runnable.calls[0].input instanceof Command);
  assert.equal(harness.runnable.calls[0].input.resume.decisions.length, 2);
  assert.equal(harness.history.saved[0].content, 'Create both orders');
});

test('a plan already shown for approval is not streamed again on resume', async () => {
  const pendingState = {
    tasks: [{
      interrupts: [{
        value: {
          actionRequests: [{ description: 'Plan', args: { todos: TODOS } }]
        }
      }]
    }]
  };
  let stateRead = 0;
  const harness = createHarness({
    events: [planUpdate(TODOS), replyFinal('Done.'), finalState(TODOS)],
    state: () => (++stateRead === 1 ? pendingState : { tasks: [] })
  });
  harness.session.setPendingApproval({
    threadId: 'plan-thread', thinking: false, input: 'Do plan', actionCount: 1
  });
  const frames = [];
  const strategy = new EcommerceStreamStrategy({ write: frame => frames.push(frame) });

  await new StreamedAgentRunner(
    new AgentRunner(harness.agent, harness.session),
    strategy
  ).run({ message: 'yes' });

  assert.equal(
    frames.filter(frame => frame.event === 'chunk' && frame.data.text.includes('**Plan:**')).length,
    0
  );
});

test('registry creates one isolated session facade per session', () => {
  const registry = new AgentRegistry(sessionId => ({ sessionId }));
  assert.equal(registry.get(1), registry.get(1));
  assert.notEqual(registry.get(1), registry.get(2));
  registry.remove(1);
  assert.notEqual(registry.get(1), registry.get(2));
});

test('only the first successfully approved plan requires approval', () => {
  const human = { _getType: () => 'human' };
  const rejectedPlan = { name: 'write_todos', status: 'error' };
  const approvedPlan = { name: 'write_todos', status: 'success' };

  assert.equal(shouldApprovePlan({ state: { messages: [human] } }), true);
  assert.equal(
    shouldApprovePlan({ state: { messages: [human, rejectedPlan] } }),
    true,
    'a rejected initial plan still needs approval when revised'
  );
  assert.equal(
    shouldApprovePlan({ state: { messages: [human, approvedPlan] } }),
    false,
    'changes after the first approved plan do not interrupt again'
  );
  assert.equal(
    shouldApprovePlan({ state: { messages: [human, approvedPlan, rejectedPlan] } }),
    false,
    'once approved, later plan rewrites remain part of that workflow'
  );
});
