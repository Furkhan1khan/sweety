const SLOTS = [
  'Morning (fasting)',
  'After breakfast',
  'After lunch',
  'After dinner',
];

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function todayInTimezone(timezone = 'UTC') {
  let safeTimezone = timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    safeTimezone = 'UTC';
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validateReadingInput({ date, slot, value }, today = todayInTimezone()) {
  if (value === undefined || value === null || value === '') {
    return 'Please enter a glucose value.';
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 40 || parsedValue > 600) {
    return 'Value must be between 40 and 600 mg/dl.';
  }

  if (!isCalendarDate(date)) return 'Please choose a valid date.';
  if (date > today) return 'Date cannot be in the future.';
  if (!SLOTS.includes(slot)) return 'Please choose a valid time slot.';

  return null;
}

module.exports = { SLOTS, isCalendarDate, todayInTimezone, validateReadingInput };
