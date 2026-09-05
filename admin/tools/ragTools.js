const { stubTool } = require('./stubTool');

// STUDENT FILE: implement semantic product discovery and document retrieval
// with ../agent-services/documentServices and the provided embedding client.
const searchProductBySemanticTool = stubTool('search_product_by_semantic');
const answerProductQuestionTool = stubTool('answer_product_question');

module.exports = { searchProductBySemanticTool, answerProductQuestionTool };
