const test = require('node:test');
const assert = require('node:assert/strict');
const { SLOTS, isCalendarDate, validateReadingInput } = require('../src/readingValidation');

const yesterday = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

test('requires a glucose value and accepts only whole numbers from 40 through 600', () => {
  assert.equal(validateReadingInput({ date: yesterday(), slot: SLOTS[0], value: '' }), 'Please enter a glucose value.');
  assert.equal(validateReadingInput({ date: yesterday(), slot: SLOTS[0], value: 39 }), 'Value must be between 40 and 600 mg/dl.');
  assert.equal(validateReadingInput({ date: yesterday(), slot: SLOTS[0], value: 600.5 }), 'Value must be between 40 and 600 mg/dl.');
  assert.equal(validateReadingInput({ date: yesterday(), slot: SLOTS[0], value: 600 }), null);
});

test('rejects impossible calendar dates and future readings', () => {
  assert.equal(isCalendarDate('2026-02-30'), false);
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  assert.equal(validateReadingInput({ date: tomorrow.toISOString().slice(0, 10), slot: SLOTS[0], value: 100 }), 'Date cannot be in the future.');
});

test('accepts only the four supported time slots', () => {
  assert.equal(validateReadingInput({ date: yesterday(), slot: 'Midnight snack', value: 100 }), 'Please choose a valid time slot.');
  assert.equal(validateReadingInput({ date: yesterday(), slot: SLOTS[3], value: 100 }), null);
});
