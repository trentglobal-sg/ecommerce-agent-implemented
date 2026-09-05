const { humanInTheLoopMiddleware } = require("langchain");

// A plan needs approval until one write_todos call has completed successfully.
// Once the admin has approved that first plan, later edits and status updates
// are part of the same approved workflow and do not interrupt again.
function shouldApprovePlan({ state }) {
    if (!state.messages || state.messages.length === 0) {
        return false;
    }

    const previousPlanResults = state.messages.filter(
        message => (message.name || message.tool_name) === 'write_todos'
    );

    const hasApprovedPlan = previousPlanResults.some(
        message => message.status !== 'error'
    );

    return !hasApprovedPlan;
}

const approvalMiddleware = humanInTheLoopMiddleware({
    interruptOn: {
        write_todos: {
            allowedDecisions: ["approve", "reject"],
            when: shouldApprovePlan,
            description: (toolCall) => {
                const lines = toolCall.args.todos.map((todo, index) => `${index + 1}. ${todo.content}`);
                return '📋 **Proposed plan:**\n' + lines.join('\n');
            }
        },
        create_restock_order: {
            allowedDecisions: ['approve', 'reject'],
            description: (toolCall) => {
                const lines = (toolCall.args.orders || []).map(
                    order => `- Product #${order.productId}: restock ${order.stockAmount} units`
                );
                return '📦 **Restock order requested:**\n' + lines.join('\n');
            }
        }
    }
});

// Turn the raw interrupt payload into a markdown description of what the
// agent wants to do (the middleware built one per action; join them)
function formatApproval(hitlRequest) {
    return hitlRequest.actionRequests
        .map(action => action.description)
        .join('\n\n');
}

// The approval question is shown as a normal chat reply: what the agent
// wants to do, plus how to answer
function approvalReply(hitlRequest) {
    return formatApproval(hitlRequest)
        + '\n\n**Approve?** Reply *yes* to go ahead, or *no* to refuse (you can also reply *no <feedback>* to give specific instructions).';
}

// Turns the admin's typed answer into a HITL decision.
// Returns null if the message is not a clear yes or no.
function parseDecision(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    // Match YES / Y variations (e.g. "yes", "YES!", "y.")
    if (/^(yes|y)[!.?]*$/i.test(trimmed)) {
        return { type: 'approve' };
    }

    // Match NO / N variations (e.g. "no", "No.", "NO!", "no, use Acme instead")
    const noMatch = trimmed.match(/^(no|n)\b[!.?\s,-]*(.*)$/i);
    if (noMatch) {
        const feedback = noMatch[2].trim();

        if (feedback.length === 0) {
            return {
                type: 'reject',
                message: 'The admin rejected this proposed plan without providing specific feedback. Acknowledge the rejection politely and ask the admin what changes they would like to make or how they would prefer to proceed. Do NOT execute any tools until they clarify.'
            };
        } else {
            return {
                type: 'reject',
                message: `The admin rejected this proposed plan with the following feedback: "${feedback}". Create a revised plan using write_todos that incorporates this feedback, or ask for clarification if anything is ambiguous.`
            };
        }
    }

    return null;
}


function buildResumeDecisions(decisions, actionCount) {
    let suppliedDecisions;

    if (Array.isArray(decisions)) {
        suppliedDecisions = decisions;
    } else {
        suppliedDecisions = [decisions];
    }

    // The caller already supplied multiple decisions.
    if (suppliedDecisions.length !== 1) {
        return suppliedDecisions;
    }

    const resumeDecisions = [];

    // Apply the single yes/no answer to every interrupted action.
    for (let index = 0; index < actionCount; index++) {
        const decisionCopy = Object.assign(
            {},
            suppliedDecisions[0]
        );

        resumeDecisions.push(decisionCopy);
    }

    return resumeDecisions;
}

module.exports = {
    approvalMiddleware,
    shouldApprovePlan,
    formatApproval,
    approvalReply,
    parseDecision,
    buildResumeDecisions
};
