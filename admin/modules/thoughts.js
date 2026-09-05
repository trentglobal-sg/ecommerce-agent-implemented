const { createMiddleware } = require('langchain');

// STUDENT FILE: support Gemini thinking blocks and publish displayable
// thoughts with output.addThought() or output.addThoughts().
function extractThoughtBlocks(content) {
  void content;
  return [];
}

function createThoughtMiddleware({ model, output }) {
  void model;
  void output;
  return createMiddleware({ name: 'thoughtMiddleware' });
}

module.exports = { extractThoughtBlocks, createThoughtMiddleware };
