const { createAgent } = require("langchain");
const { ChatGoogle } = require("@langchain/google/node");

const {
  getCompletedOrdersTool,
  getCompletedOrdersForProductTool,
  tabulateSalesTool,
  getLowStockTool,
  getToday,
} = require("./admin/tools/salesTools.js");

const {
  generateApexChartTool,
} = require("./admin/tools/chartTools");

const model = new ChatGoogle({
  model: "gemini-3.1-flash-lite",
  apiKey: process.env.GEMINI_API_KEY,
  includeThoughts: true,
});

const modelWithSearch = new ChatGoogle({
  model: "gemini-2.5-flash",
  apiKey: process.env.GEMINI_API_KEY,
}).bindTools([
  { googleSearchRetrieval: {} },
]);

const tools = [
  getCompletedOrdersTool,
  getCompletedOrdersForProductTool,
  tabulateSalesTool,
  getLowStockTool,
  getToday,
  generateApexChartTool,
];

const modelWithTools = new ChatGoogle({
  model: "gemini-3.1-flash-lite",
  apiKey: process.env.GEMINI_API_KEY,
}).bindTools(tools);

const prompt = `
You are a helpful admin assistant for an ecommerce store.
Format your responses using markdown.

When you generate a chart using the generate_apex_chart tool, do NOT
include any chart URLs, image links, or raw chart configuration JSON
in your text response.

The chart will be rendered automatically by the frontend.
Do not describe the chart config JSON in your reply.

`.trim();

const agent = createAgent({
  model,
  tools,
  systemPrompt: prompt,
});

module.exports = {
  model,
  modelWithSearch,
  modelWithTools,
  agent,
};