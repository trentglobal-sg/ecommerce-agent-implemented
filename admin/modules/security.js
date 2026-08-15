const { createMiddleware } = require('langchain');
const { AIMessage, ToolMessage } = require('@langchain/core/messages');

const INJECTION_PATTERNS = [
  /ignore\s+(all|any|previous|prior|above|the)[^.]{0,40}(instructions?|prompts?|rules?)/i,
  /disregard\s+(all|any|previous|prior|above|the)[^.]{0,40}(instructions?|prompts?|rules?)/i,
  /forget\s+(everything|all|your)[^.]{0,40}(instructions?|training|rules?)/i,
  /you\s+are\s+now\s+(a|an|the)\s+/i,                    // "you are now DAN..."
  /new\s+(system\s+)?instructions?\s*:/i,
  /system\s+override/i,
  /do\s+not\s+follow\s+(your|any|the)\s+(previous\s+)?(instructions?|rules?)/i,
  /instead,?\s+(output|print|reveal|show|send|delete|create)/i,
  /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /<\s*\/?\s*system\s*>/i,                                // fake <system> tags
  /\[\s*INST\s*\]/i,                                      // fake [INST] blocks
  /priority\s+(override|instruction|directive)/i,
];

const REFUSAL_TEXT =
  '⚠️ I detected text that looks like a prompt-injection attempt ' +
  '(an instruction trying to override my actual instructions). ' +
  'I can only follow instructions from the system prompt and from ' +
  'messages you type directly. Please rephrase your request.';

function looksLikeInjection(text) {
  if (typeof text !== 'string' || !text) return false;
  return INJECTION_PATTERNS.some(re => re.test(text));
}

function messageText(msg) {
  const c = msg?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter(p => p && (p.type === 'text' || typeof p.text === 'string'))
      .map(p => p.text)
      .join('\n');
  }
  return '';
}

const injectionDetectionMiddleware = createMiddleware({
  name: 'injectionDetectionMiddleware',
  beforeModel: {
    canJumpTo: ['end'],
    hook: (state) => {
      const messages = state.messages || [];

      let lastAiIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]._getType && messages[i]._getType() === 'ai') {
          lastAiIndex = i;
          break;
        }
      }
      const newMessages = messages.slice(lastAiIndex + 1);

      for (const msg of newMessages) {
        const type = msg._getType ? msg._getType() : null;
        if (type !== 'human' && type !== 'tool') continue;

        const text = messageText(msg);
        if (looksLikeInjection(text)) {
          console.warn(
            `[SECURITY] Injection pattern detected in ${type} message:`,
            text.substring(0, 200)
          );
          return {
            messages: [new AIMessage(REFUSAL_TEXT)],
            jumpTo: 'end',
          };
        }
      }
    }
  }
});

module.exports = {
  injectionDetectionMiddleware,
  looksLikeInjection,
};