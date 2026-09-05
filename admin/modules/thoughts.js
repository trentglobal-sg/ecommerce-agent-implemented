const { createMiddleware } = require('langchain');

// STUDENT FILE: support Gemini thinking blocks and publish displayable
// thoughts with output.addThought() or output.addThoughts().
function extractThoughtBlocks(content) {
  return [];
}

function createThoughtMiddleware(model, output) {
  return createMiddleware({ name: 'thoughtMiddleware' });
}

module.exports = { extractThoughtBlocks, createThoughtMiddleware };
