const { stubTool } = require('./stubTool');

// STUDENT FILE: implement review retrieval, semantic search, and pole analysis
// with ../agent-services/productServices.
const getProductReviewsTool = stubTool('get_product_reviews');
const searchProductReviewsTool = stubTool('search_product_reviews');
const getReviewSentimentPolesTool = stubTool('get_review_sentiment_poles');

module.exports = {
  getProductReviewsTool,
  searchProductReviewsTool,
  getReviewSentimentPolesTool
};
