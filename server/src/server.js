const app = require('./app');
const pool = require('./db');
const { port } = require('./config');

const server = app.listen(port, () => {
  console.log(`Sweety API listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
