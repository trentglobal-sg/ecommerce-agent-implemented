const { HumanMessage } = require('@langchain/core/messages');
const { Command } = require('@langchain/langgraph');
const { randomUUID } = require('crypto');
const { extractReplyText, extractPlan, isRecursionLimitError } = require('./agentHelpers');
const { parseDecision, approvalReply, buildResumeDecisions } = require('./approval');
const { AgentEventNormalizer } = require('./AgentEventNormalizer');

const RECURSION_LIMIT_REPLY = 'I was not able to finish that request — it needed more steps than I am allowed to take. Could you break it into smaller requests?';
const INVALID_DECISION_REPLY = 'Please reply *yes* to approve or *no* to reject.';
const NOTHING_PENDING_REPLY = 'Nothing is waiting for approval';

// Instructor-owned template. Students customize EcommerceAgent and, for the
// streaming lesson, one event strategy; they do not edit this lifecycle.
class AgentRunner {
  constructor(agent, session, normalizer = new AgentEventNormalizer()) {
    this.agent = agent;
    this.session = session;
    this.normalizer = normalizer;
  }

  async run(input, eventStrategy = null) {
    let result;
    let unexpectedError = null;

    await this.session.withLock(async () => {
      const run = this._createRunContext(input);

      try {
        await this._prepare(run);

        if (run.immediateResult) {
          result = run.immediateResult;
        } else {
          await this._seedInitialPlan(run);
          await this._execute(run, eventStrategy);
          const interrupt = await this._findInterrupt(run);
          result = interrupt
            ? this._pause(run, interrupt)
            : await this._finalize(run, eventStrategy);
        }
      } catch (error) {
        if (isRecursionLimitError(error)) {
          result = await this._handleRecursionLimit(run);
        } else {
          if (run.consumedApproval) {
            this.session.setPendingApproval(run.consumedApproval);
          }
          unexpectedError = error;
        }
      }
    });

    if (unexpectedError) throw unexpectedError;
    return result;
  }

  _createRunContext(input) {
    return {
      input,
      originalInput: null,
      thinking: Boolean(input.thinking),
      runnable: null,
      streamInput: null,
      config: null,
      threadId: null,
      reply: '',
      todos: null,
      finalState: null,
      lastPlanText: '',
      seenThoughts: new Set(),
      consumedApproval: null,
      immediateResult: null
    };
  }

  async _prepare(run) {
    if (this.session.peekPendingApproval()) {
      this._prepareResume(run);
    } else {
      await this._prepareNewRun(run);
    }
  }

  async _prepareNewRun(run) {
    run.originalInput = run.input.message;
    run.threadId = randomUUID();
    run.runnable = this.agent.getRunnable(run.thinking);
    const pastMessages = await this.session.history.getMessages();
    run.streamInput = {
      messages: [...pastMessages, new HumanMessage(run.input.message)]
    };
    run.config = this._buildConfig(run.threadId);
  }

  _prepareResume(run) {
    const decision = parseDecision(run.input.message);
    if (!decision) {
      run.immediateResult = this._result(INVALID_DECISION_REPLY);
      return;
    }

    const pending = this.session.takePendingApproval();
    if (!pending) {
      run.immediateResult = this._result(NOTHING_PENDING_REPLY);
      return;
    }

    run.consumedApproval = pending;
    run.originalInput = pending.input;
    run.thinking = pending.thinking;
    run.threadId = pending.threadId;
    run.runnable = this.agent.getRunnable(run.thinking);
    run.streamInput = new Command({
      resume: {
        decisions: buildResumeDecisions(decision, pending.actionCount)
      }
    });
    run.config = this._buildConfig(run.threadId);
  }

  _buildConfig(threadId) {
    return {
      configurable: {
        sessionId: this.session.sessionId,
        thread_id: threadId
      },
      recursionLimit: 50,
      version: 'v2'
    };
  }

  async _seedInitialPlan(run) {
    try {
      const state = await run.runnable.getState(run.config);
      if (state?.values?.todos) {
        run.lastPlanText = extractPlan(state.values.todos) || '';
      }
      for (const interrupt of (state?.tasks || []).flatMap(task => task.interrupts || [])) {
        for (const action of interrupt.value?.actionRequests || []) {
          if (action.args?.todos) {
            run.lastPlanText = extractPlan(action.args.todos) || '';
          }
        }
      }
    } catch (_) {
      // A new thread has no state yet.
    }
  }

  async _execute(run, eventStrategy) {
    const stream = run.runnable.streamEvents(run.streamInput, run.config);
    for await (const rawEvent of stream) {
      const events = this.normalizer.normalize(rawEvent, run, this.session.output);
      for (const event of events) {
        this._collect(event, run);
        if (eventStrategy) await eventStrategy.handle(event);
      }
    }

    for (const event of this.normalizer.flushThoughts(run, this.session.output)) {
      this._collect(event, run);
      if (eventStrategy) await eventStrategy.handle(event);
    }
  }

  _collect(event, run) {
    if (event.type === 'reply-final') run.reply = extractReplyText(event.content);
    if (event.type === 'plan-change') run.todos = event.todos;
    if (event.type === 'final-state') run.finalState = event.state;
  }

  async _findInterrupt(run) {
    const state = await run.runnable.getState(run.config);
    return (state?.tasks || [])
      .flatMap(task => task.interrupts || [])[0]?.value || null;
  }

  _pause(run, hitlRequest) {
    this.session.setPendingApproval({
      threadId: run.threadId,
      thinking: run.thinking,
      input: run.originalInput,
      actionCount: hitlRequest.actionRequests.length
    });
    return this._result(approvalReply(hitlRequest));
  }

  async _finalize(run, eventStrategy) {
    const output = this.session.output.drain();
    const todos = run.todos || run.finalState?.todos;
    let reply = run.reply;
    if (!reply && run.finalState?.messages?.length) {
      reply = extractReplyText(run.finalState.messages.at(-1)?.content);
    }
    reply = reply || '(no reply)';

    await this.session.history.addUserMessage(run.originalInput);
    await this.session.history.addAIChatMessage(reply, output.chart);

    return this._result(reply, {
      chart: output.chart,
      plan: extractPlan(todos),
      thoughts: output.thoughts,
      replyStreamed: Boolean(eventStrategy?.didStreamReply?.())
    });
  }

  async _handleRecursionLimit(run) {
    this.session.output.drain();
    await this.session.history.addUserMessage(run.originalInput);
    await this.session.history.addAIChatMessage(RECURSION_LIMIT_REPLY);
    return this._result(RECURSION_LIMIT_REPLY);
  }

  _result(reply, { chart = null, plan = null, thoughts = null, replyStreamed = false } = {}) {
    return { reply, chart, plan, thoughts, replyStreamed };
  }
}

module.exports = { AgentRunner };
