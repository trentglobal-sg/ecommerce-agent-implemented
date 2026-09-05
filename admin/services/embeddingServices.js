const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');


const embeddings = new GoogleGenerativeAIEmbeddings({
  model: 'gemini-embedding-2',
  apiKey: process.env.GEMINI_API_KEY,
});

async function extractTextFromPDF(filePath) {
    const absolutePath = path.join(process.cwd(), filePath);
    const dataBuffer = fs.readFileSync(absolutePath);
    const parser = new PDFParse({ data: dataBuffer });
    try {
      const data = await parser.getText();
      return data.text;
    } finally {
      await parser.destroy();
    }
}

function chunkText(text, chunkSize = 500, overlap = 50) {
  // TODO(student): split the extracted text into overlapping chunks.
  // This one-chunk fallback keeps PDF processing safe while the exercise is
  // incomplete; PDF upload and extraction remain instructor-provided.
  void chunkSize;
  void overlap;
  const normalized = (text || '').trim();
  return normalized ? [normalized] : [];
}

async function generateEmbedding(text) {
  const result = await embeddings.embedQuery(text);
  return result;
}

module.exports = { extractTextFromPDF, chunkText, generateEmbedding };
