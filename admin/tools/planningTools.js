const { stubTool } = require('./stubTool');

// STUDENT FILE: implement the tools used for planning and restock workflows
// with ../agent-services/productServices.
const getProductDetailsTool = stubTool('get_product_details');
const createRestockOrderTool = stubTool('create_restock_order');
const getCurrentDateTimeTool = stubTool('get_current_date_time');

module.exports = {
  getProductDetailsTool,
  createRestockOrderTool,
  getCurrentDateTimeTool
};
