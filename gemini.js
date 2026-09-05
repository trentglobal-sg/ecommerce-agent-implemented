const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { AgentRegistry } = require('./admin/modules/agentRegistry');
const { AgentSessionContext } = require('./admin/modules/AgentSessionContext');
const { AgentSession } = require('./admin/modules/AgentSession');
const { EcommerceAgent } = require('./admin/modules/EcommerceAgent');

const model = new ChatGoogleGenerativeAI({
  model: 'gemini-3.1-flash-lite',
  apiKey: process.env.GEMINI_API_KEY,
  thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' }
});

const modelWithSearch = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  apiKey: process.env.GEMINI_API_KEY
}).bindTools([{ googleSearchRetrieval: {} }]);

const modelWithTools = new ChatGoogleGenerativeAI({
  model: 'gemini-3.1-flash-lite',
  apiKey: process.env.GEMINI_API_KEY,
  thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' }
}).bindTools([]);

const agentRegistry = new AgentRegistry((sessionId) => {
  const runtime = new AgentSessionContext({ sessionId });
  const agent = new EcommerceAgent({ model, runtime });
  return new AgentSession({ agent, runtime });
});

module.exports = {
  model,
  modelWithSearch,
  modelWithTools,
  agentRegistry,
  getAgent: sessionId => agentRegistry.get(sessionId),
  removeAgent: sessionId => agentRegistry.remove(sessionId)
};
