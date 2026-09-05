// STUDENT FILE: implement the product and review queries needed by tools.
async function getLowStock(threshold) { void threshold; return []; }
async function getProductById(productId) { void productId; return null; }
async function getReviewsByProductId(productId) { void productId; return []; }
async function searchReviewEmbeddings(productId, embedding, limit) {
  void productId; void embedding; void limit;
  return [];
}

module.exports = {
  getLowStock,
  getProductById,
  getReviewsByProductId,
  searchReviewEmbeddings
};
