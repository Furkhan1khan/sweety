const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../../sweety.db');

// Open DB once
const db = new sqlite3.Database(dbPath);

// Enable WAL + foreign keys
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reading_date TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('Morning (fasting)', 'After breakfast', 'After lunch', 'After dinner')),
    value INTEGER NOT NULL CHECK (value BETWEEN 40 AND 600),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT one_reading_per_slot_per_day UNIQUE (user_id, reading_date, slot)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS readings_user_date_idx ON readings (user_id, reading_date DESC)');
});

// Convert PostgreSQL $1,$2 placeholders to ? and strip PG-only syntax
function pgToSqlite(sql) {
  return sql
    .replace(/\$\d+/g, '?')
    .replace(/::int/g, '')
    .replace(/::text/g, '')
    .replace(/datetime\('now'\)/gi, "datetime('now')")
    .replace(/NOW\(\)/gi, "datetime('now')");
}

function mapError(err) {
  if (err && err.message && /UNIQUE constraint failed/i.test(err.message)) {
    err.code = '23505';
  }
  return err;
}

// pg-compatible pool shim
const pool = {
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      const upper = sql.trim().toUpperCase();

      // INSERT ... RETURNING
      if (/RETURNING/i.test(sql) && upper.startsWith('INSERT')) {
        const table = sql.match(/INTO\s+(\w+)/i)?.[1];
        const cols = sql.match(/RETURNING\s+(.+)$/i)?.[1] || '*';
        const withoutReturning = pgToSqlite(sql).replace(/\s+RETURNING\s+.+$/i, '');
        db.run(withoutReturning, params, function (err) {
          if (err) return reject(mapError(err));
          const rowid = this.lastID;
          db.get(`SELECT ${cols} FROM ${table} WHERE rowid = ?`, [rowid], (err2, row) => {
            if (err2) return reject(mapError(err2));
            resolve({ rows: row ? [row] : [], rowCount: this.changes || 1 });
          });
        });
        return;
      }

      // UPDATE ... RETURNING
      if (/RETURNING/i.test(sql) && upper.startsWith('UPDATE')) {
        const table = sql.match(/UPDATE\s+(\w+)/i)?.[1];
        const cols = sql.match(/RETURNING\s+(.+)$/i)?.[1] || '*';
        const withoutReturning = pgToSqlite(sql).replace(/\s+RETURNING\s+.+$/i, '');
        // Determine WHERE params to re-fetch the updated row
        const beforeWhere = sql.match(/^(.+?)\s+WHERE\s+/i)?.[1] || '';
        const countBefore = (beforeWhere.match(/\$\d+/g) || []).length;
        const whereClause = sql.match(/WHERE\s+(.+?)(?:\s+RETURNING|$)/i)?.[1] || '';
        const countWhere = (whereClause.match(/\$\d+/g) || []).length;
        const whereParams = params.slice(countBefore, countBefore + countWhere);
        const whereTranslated = pgToSqlite(whereClause);
        db.run(withoutReturning, params, function (err) {
          if (err) return reject(mapError(err));
          const changes = this.changes;
          if (!changes) return resolve({ rows: [], rowCount: 0 });
          db.all(`SELECT ${cols} FROM ${table} WHERE ${whereTranslated}`, whereParams, (err2, rows) => {
            if (err2) return reject(mapError(err2));
            resolve({ rows: rows || [], rowCount: changes });
          });
        });
        return;
      }

      // SELECT
      if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
        db.all(pgToSqlite(sql), params, (err, rows) => {
          if (err) return reject(mapError(err));
          resolve({ rows: rows || [], rowCount: (rows || []).length });
        });
        return;
      }

      // INSERT / UPDATE / DELETE without RETURNING
      db.run(pgToSqlite(sql), params, function (err) {
        if (err) return reject(mapError(err));
        resolve({ rows: [], rowCount: this.changes });
      });
    });
  },

  end() {
    return new Promise((resolve) => db.close(resolve));
  },
};

module.exports = pool;
