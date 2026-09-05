const {
  getCompletedOrdersTool,
  getCompletedOrdersForProductTool,
  tabulateSalesTool,
  getLowStockTool,
  getToday
} = require('./salesTools');
const { searchProductBySemanticTool, answerProductQuestionTool } = require('./ragTools');
const {
  getProductReviewsTool,
  searchProductReviewsTool,
  getReviewSentimentPolesTool
} = require('./reviewTools');
const {
  getProductDetailsTool,
  createRestockOrderTool,
  getCurrentDateTimeTool
} = require('./planningTools');
const { createApexChartTool } = require('./chartTools');

const sharedTools = [
  getCompletedOrdersTool,
  getCompletedOrdersForProductTool,
  tabulateSalesTool,
  getLowStockTool,
  getToday,
  searchProductBySemanticTool,
  answerProductQuestionTool,
  getProductReviewsTool,
  searchProductReviewsTool,
  getReviewSentimentPolesTool,
  getProductDetailsTool,
  createRestockOrderTool,
  getCurrentDateTimeTool
];

function buildTools({ output }) {
  return [...sharedTools, createApexChartTool(output)];
}

module.exports = { sharedTools, buildTools };
