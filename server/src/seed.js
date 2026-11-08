const bcrypt = require('bcryptjs');
const pool = require('./db');

async function seed() {
  const name = process.env.SEED_NAME || 'Demo Patient';
  const email = (process.env.SEED_EMAIL || 'demo@sweety.local').toLowerCase();
  const password = process.env.SEED_PASSWORD || 'SweetDemo123!';
  const passwordHash = await bcrypt.hash(password, 12);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Upsert user
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  let userId;
  if (existing.rows.length > 0) {
    userId = existing.rows[0].id;
    await pool.query(
      'UPDATE users SET name = $1, password_hash = $2 WHERE id = $3',
      [name, passwordHash, userId],
    );
  } else {
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [name, email, passwordHash],
    );
    userId = result.rows[0].id;
  }

  // Reset readings for demo user
  await pool.query('DELETE FROM readings WHERE user_id = $1', [userId]);

  const samples = [
    ['Morning (fasting)', 104],
    ['After breakfast', 138],
    ['After lunch', 126],
  ];
  for (const [slot, value] of samples) {
    await pool.query(
      'INSERT INTO readings (user_id, reading_date, slot, value) VALUES ($1, $2, $3, $4)',
      [userId, today, slot, value],
    );
  }

  console.log(`Seeded ${email} / ${password} with three readings for ${today}`);
  await pool.end();
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
