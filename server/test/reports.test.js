const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize } = require('../src/reports');

test('summarizes count, high, low, and an average rounded to one decimal place', () => {
  assert.deepEqual(summarize([{ value: 101 }, { value: 120 }, { value: 137 }]), {
    count: 3,
    high: 137,
    low: 101,
    average: 119.3,
  });
});

test('returns null metrics for an empty report', () => {
  assert.deepEqual(summarize([]), { count: 0, high: null, low: null, average: null });
});
