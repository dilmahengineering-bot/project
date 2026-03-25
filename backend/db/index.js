const { Pool, types } = require('pg');
require('dotenv').config();

// Return TIMESTAMP (without timezone) as raw strings — prevents JS Date UTC conversion
types.setTypeParser(1114, str => str);

// Support both individual DB env vars (local) and DATABASE_URL (Render/production)
let poolConfig;

if (process.env.DATABASE_URL) {
  // Render production: uses single DATABASE_URL
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: {
      rejectUnauthorized: false // Required for Render's SSL connections
    }
  };
  console.log('✓ Using DATABASE_URL for connection (Render production)');
} else {
  // Local development: uses individual DB env vars
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'taskflow_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
  console.log('✓ Using individual DB vars for connection (local development)');
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
