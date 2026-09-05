const { createMiddleware } = require('langchain');

// STUDENT FILE: implement prompt-injection detection and a beforeModel hook.
function looksLikeInjection(text) {
  return false;
}

const injectionDetectionMiddleware = createMiddleware({
  name: 'injectionDetectionMiddleware'
});

module.exports = { looksLikeInjection, injectionDetectionMiddleware };
