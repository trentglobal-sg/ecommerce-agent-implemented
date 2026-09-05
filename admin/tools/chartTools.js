const { stubTool } = require('./stubTool');

// STUDENT FILE: create an ApexCharts configuration and publish it with
// output.setChart(chartConfig). The route and frontend already know how to
// transport and render the resulting chart.
function createApexChartTool(output) {
  return stubTool('generate_apex_chart');
}

module.exports = { createApexChartTool };
