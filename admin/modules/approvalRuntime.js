function formatApproval(hitlRequest) {
  return hitlRequest.actionRequests.map(action => action.description).join('\n\n');
}

function approvalReply(hitlRequest) {
  return formatApproval(hitlRequest)
    + '\n\n**Approve?** Reply *yes* to go ahead, or *no* to refuse '
    + '(you can also reply *no <feedback>* to give specific instructions).';
}

function parseDecision(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  if (/^(yes|y)[!.?]*$/i.test(trimmed)) return { type: 'approve' };

  const noMatch = trimmed.match(/^(no|n)\b[!.?\s,-]*(.*)$/i);
  if (!noMatch) return null;
  const feedback = noMatch[2].trim();
  return {
    type: 'reject',
    message: feedback
      ? `The admin rejected this action with the following feedback: "${feedback}". Revise the plan or action to incorporate it.`
      : 'The admin rejected this action without feedback. Ask what they would like changed before executing more tools.'
  };
}

function buildResumeDecisions(decision, actionCount) {
  const supplied = Array.isArray(decision) ? decision : [decision];
  if (supplied.length !== 1) return supplied;
  return Array.from({ length: actionCount }, () => ({ ...supplied[0] }));
}

module.exports = { formatApproval, approvalReply, parseDecision, buildResumeDecisions };
