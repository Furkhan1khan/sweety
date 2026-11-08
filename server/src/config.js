const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'local-development-secret-change-me',
  databaseUrl: process.env.DATABASE_URL,
};
