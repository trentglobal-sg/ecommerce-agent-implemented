require('dotenv').config();
const pool = require('./database');

async function dumpChunks(productId) {
  try {
    const [docs] = await pool.execute('SELECT id FROM documents WHERE product_id = ?', [productId]);
    if (docs.length === 0) {
      console.log('No document found for product', productId);
      return;
    }
    const docId = docs[0].id;
    const [chunks] = await pool.execute('SELECT chunk_text FROM document_chunks WHERE document_id = ? ORDER BY chunk_index', [docId]);
    console.log(`Found ${chunks.length} chunks for product ${productId}:`);
    chunks.forEach((c, i) => {
      console.log(`--- Chunk ${i} ---`);
      console.log(c.chunk_text);
    });
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

dumpChunks(1);
