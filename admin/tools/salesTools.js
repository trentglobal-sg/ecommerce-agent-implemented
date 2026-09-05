const { stubTool } = require('./stubTool');

// STUDENT FILE: replace each stub with a LangChain tool, its Zod input schema,
// and calls to ../agent-services/orderServices.
const getToday = stubTool('get_today');
const getCompletedOrdersTool = stubTool('get_completed_orders');
const getCompletedOrdersForProductTool = stubTool('get_completed_orders_for_product');
const tabulateSalesTool = stubTool('tabulate_sales');
const getLowStockTool = stubTool('get_low_stock');

module.exports = {
  getToday,
  getCompletedOrdersTool,
  getCompletedOrdersForProductTool,
  tabulateSalesTool,
  getLowStockTool
};
