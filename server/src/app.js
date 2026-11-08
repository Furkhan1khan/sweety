const express = require('express');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { jwtSecret } = require('./config');
const { requireAuth } = require('./auth');
const { SLOTS, isCalendarDate, todayInTimezone, validateReadingInput } = require('./readingValidation');
const { summarize } = require('./reports');

const app = express();
app.use(cors());
app.use(express.json());

function handleError(res, error) {
  if (error.code === '23505') {
    return res.status(409).json({ error: 'A reading already exists for this slot and date.' });
  }
  // Database connection errors (ECONNREFUSED, EPERM, etc.)
  if (error.code === 'ECONNREFUSED' || error.code === 'EPERM' || error.errors) {
    console.error('Database connection failed:', error.code || error.message);
    return res.status(503).json({ error: 'Database is not available. Please ensure PostgreSQL is running.' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function requestToday(req) {
  return todayInTimezone(req.get('x-timezone') || 'UTC');
}

// SQLite returns dates as strings; pg returns Date objects. Normalise both.
function toDateStr(val) {
  if (!val) return String(val);
  if (typeof val === 'string') return val.slice(0, 10);
  if (typeof val.toISOString === 'function') return val.toISOString().slice(0, 10);
  return String(val);
}

function duplicateSlotMessage(slot) {
  const article = slot.startsWith('After ') ? 'an' : 'a';
  return `You already have ${article} ${slot} reading for this date.`;
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/register', async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, passwordHash],
    );
    const user = rows[0];
    const token = jwt.sign({ id: user.id, name: user.name }, jwtSecret, { expiresIn: '7d' });
    return res.status(201).json({ token, user });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    return handleError(res, error);
  }
});

app.post('/api/auth/login', async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    const token = jwt.sign({ id: user.id, name: user.name }, jwtSecret, { expiresIn: '7d' });
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    return handleError(res, error);
  }
});

app.get('/api/readings', requireAuth, async (req, res) => {
  const params = [req.user.id];
  let query = 'SELECT id, reading_date AS date, slot, value FROM readings WHERE user_id = $1';
  if (req.query.date) {
    if (!isCalendarDate(req.query.date)) return res.status(400).json({ error: 'Please choose a valid date.' });
    params.push(req.query.date);
    query += ' AND reading_date = $2';
  }
  query += " ORDER BY reading_date DESC, CASE slot WHEN 'Morning (fasting)' THEN 1 WHEN 'After breakfast' THEN 2 WHEN 'After lunch' THEN 3 ELSE 4 END";
  try {
    const { rows } = await pool.query(query, params);
    return res.json(rows.map((row) => ({ ...row, date: toDateStr(row.date) })));
  } catch (error) {
    return handleError(res, error);
  }
});

app.post('/api/readings', requireAuth, async (req, res) => {
  const { date, slot, value } = req.body || {};
  const validationError = validateReadingInput({ date, slot, value }, requestToday(req));
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const existing = await pool.query(
      'SELECT slot FROM readings WHERE user_id = $1 AND reading_date = $2 AND slot = $3',
      [req.user.id, date, slot],
    );
    if (existing.rowCount) return res.status(409).json({ error: duplicateSlotMessage(slot) });
    const count = await pool.query(
      'SELECT COUNT(*) AS count FROM readings WHERE user_id = $1 AND reading_date = $2',
      [req.user.id, date],
    );
    if (count.rows[0].count >= 4) return res.status(409).json({ error: 'You can add only 4 readings per day.' });
    const { rows } = await pool.query(
      'INSERT INTO readings (user_id, reading_date, slot, value) VALUES ($1, $2, $3, $4) RETURNING id, reading_date AS date, slot, value',
      [req.user.id, date, slot, Number(value)],
    );
    return res.status(201).json({ ...rows[0], date: date });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: duplicateSlotMessage(slot) });
    return handleError(res, error);
  }
});

app.put('/api/readings/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Reading not found.' });
  const { date, slot, value } = req.body || {};
  const validationError = validateReadingInput({ date, slot, value }, requestToday(req));
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const current = await pool.query('SELECT id FROM readings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!current.rowCount) return res.status(404).json({ error: 'Reading not found.' });
    const duplicate = await pool.query(
      'SELECT id FROM readings WHERE user_id = $1 AND reading_date = $2 AND slot = $3 AND id <> $4',
      [req.user.id, date, slot, id],
    );
    if (duplicate.rowCount) return res.status(409).json({ error: duplicateSlotMessage(slot) });
    const dailyCount = await pool.query(
      'SELECT COUNT(*) AS count FROM readings WHERE user_id = $1 AND reading_date = $2 AND id <> $3',
      [req.user.id, date, id],
    );
    if (dailyCount.rows[0].count >= 4) return res.status(409).json({ error: 'You can add only 4 readings per day.' });
    const { rows } = await pool.query(
      'UPDATE readings SET reading_date = $1, slot = $2, value = $3, updated_at = datetime(\'now\') WHERE id = $4 AND user_id = $5 RETURNING id, reading_date AS date, slot, value',
      [date, slot, Number(value), id, req.user.id],
    );
    return res.json({ ...rows[0], date: toDateStr(rows[0].date) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: duplicateSlotMessage(slot) });
    return handleError(res, error);
  }
});

app.delete('/api/readings/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Reading not found.' });
  try {
    const result = await pool.query('DELETE FROM readings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Reading not found.' });
    return res.status(204).end();
  } catch (error) {
    return handleError(res, error);
  }
});

app.get('/api/reports', requireAuth, async (req, res) => {
  const date = req.query.date;
  if (!isCalendarDate(date)) return res.status(400).json({ error: 'Please choose a valid date.' });
  if (date > requestToday(req)) return res.status(400).json({ error: 'Date cannot be in the future.' });
  const [year, month] = date.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const prevLast = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  const prevStart = `${prevLast.slice(0, 7)}-01`;
  try {
    const { rows } = await pool.query(
      `SELECT id, reading_date AS date, slot, value
       FROM readings
       WHERE user_id = $1 AND reading_date BETWEEN $2 AND $3
       ORDER BY reading_date, CASE slot WHEN 'Morning (fasting)' THEN 1 WHEN 'After breakfast' THEN 2 WHEN 'After lunch' THEN 3 ELSE 4 END`,
      [req.user.id, prevStart, date],
    );
    const normalized = rows.map((row) => ({ ...row, date: toDateStr(row.date), value: Number(row.value) }));
    const dailyRows = normalized.filter((row) => row.date === date);
    const monthToDateRows = normalized.filter((row) => row.date >= monthStart && row.date <= date);
    const previousMonthRows = normalized.filter((row) => row.date >= prevStart && row.date <= prevLast);
    return res.json({
      date,
      daily: { ...summarize(dailyRows), readings: dailyRows },
      monthToDate: { startDate: monthStart, endDate: date, ...summarize(monthToDateRows) },
      previousMonth: { startDate: prevStart, endDate: prevLast, ...summarize(previousMonthRows) },
    });
  } catch (error) {
    return handleError(res, error);
  }
});

const clientBuild = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

module.exports = app;
