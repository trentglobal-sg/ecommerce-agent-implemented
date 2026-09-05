const { createMiddleware } = require('langchain');

// STUDENT FILE: replace this no-op middleware with humanInTheLoopMiddleware.
// Configure the first plan and risky actions such as create_restock_order.
const approvalMiddleware = createMiddleware({
  name: 'approvalMiddleware'
});

module.exports = { approvalMiddleware };
