function summarize(rows) {
  if (!rows.length) return { count: 0, high: null, low: null, average: null };
  const values = rows.map((row) => Number(row.value));
  return {
    count: values.length,
    high: Math.max(...values),
    low: Math.min(...values),
    average: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
  };
}

module.exports = { summarize };
