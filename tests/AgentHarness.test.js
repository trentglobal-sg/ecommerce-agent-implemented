const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentRunner } = require('../admin/modules/AgentRunner');
const { StreamedAgentRunner } = require('../admin/modules/StreamedAgentRunner');
const { EcommerceStreamStrategy } = require('../admin/modules/EcommerceStreamStrategy');
const { EcommerceAgent } = require('../admin/modules/EcommerceAgent');
const { AgentSessionContext } = require('../admin/modules/AgentSessionContext');
const { AgentRegistry } = require('../admin/modules/agentRegistry');
const { PLACEHOLDER_REPLY } = require('../admin/modules/StarterAgentRunnable');
const { parseDecision, buildResumeDecisions } = require('../admin/modules/approvalRuntime');
const {
  createHarness,
  replyFinal,
  planUpdate,
  finalState
} = require('./helpers/fakeHarness');

const TODOS = [{ content: 'Check stock', status: 'pending' }];

test('the instructor-owned runner still builds the frontend response', async () => {
  const harness = createHarness({
    events: [planUpdate(TODOS), replyFinal('Done.'), finalState(TODOS)]
  });
  const result = await new AgentRunner(harness.agent, harness.session)
    .run({ message: 'Check inventory' });

  assert.equal(result.reply, 'Done.');
  assert.equal(result.plan, '**Plan:**\n1. Check stock');
  assert.deepEqual(harness.history.saved.map(item => item.role), ['human', 'ai']);
});

test('starter EcommerceAgent runs without calling an external model', async () => {
  const history = {
    saved: [],
    async getMessages() { return []; },
    async addUserMessage(content) { this.saved.push(content); },
    async addAIChatMessage(content) { this.saved.push(content); }
  };
  const runtime = new AgentSessionContext({ sessionId: 10, history });
  const agent = new EcommerceAgent({}, runtime);
  const result = await new AgentRunner(agent, runtime).run({ message: 'Hello' });

  assert.equal(result.reply, PLACEHOLDER_REPLY);
  assert.equal(result.replyStreamed, false);
  assert.equal(agent.tools.length, 0);
  assert.equal(agent.middleware.length, 0);
});

test('stub streaming strategy emits only the authoritative done frame', async () => {
  const harness = createHarness({ events: [replyFinal('Ready.'), finalState(null)] });
  const frames = [];
  const strategy = new EcommerceStreamStrategy({ write: frame => frames.push(frame) });
  const result = await new StreamedAgentRunner(
    new AgentRunner(harness.agent, harness.session),
    strategy
  ).run({ message: 'Go' });

  assert.deepEqual(frames, [{ event: 'done', data: result }]);
  assert.equal(result.replyStreamed, false);
});

test('approval runtime remains available to the sealed runner', () => {
  assert.deepEqual(parseDecision('yes'), { type: 'approve' });
  assert.equal(buildResumeDecisions({ type: 'approve' }, 3).length, 3);
});

test('registry keeps session instances isolated', () => {
  const registry = new AgentRegistry(sessionId => ({ sessionId }));
  assert.equal(registry.get(1), registry.get(1));
  assert.notEqual(registry.get(1), registry.get(2));
});
