const { tool } = require('@langchain/core/tools');
const { z } = require('zod');

// Keeps partially completed student tools safe to register while their real
// schema and implementation are being written.
function stubTool(name, description = `TODO: implement ${name}`) {
  return tool(
    async () => ({ error: `Tool ${name} has not been implemented yet.` }),
    { name, description, schema: z.object({}) }
  );
}

module.exports = { stubTool };
