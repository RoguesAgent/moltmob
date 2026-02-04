#!/usr/bin/env node
/**
 * Setup the Moltbook database schema in Supabase.
 * 
 * Run: DB_PASSWORD=your_password node scripts/setup-db.js
 * Or:  node scripts/setup-db.js --password your_password
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const pwIdx = process.argv.indexOf('--password');
const password = process.env.DB_PASSWORD || (pwIdx >= 0 ? process.argv[pwIdx + 1] : null);

if (!password) {
  console.error('Usage: DB_PASSWORD=xxx node scripts/setup-db.js');
  console.error('   or: node scripts/setup-db.js --password xxx');
  process.exit(1);
}

async function run() {
  const client = new Client({
    host: 'aws-1-us-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.izwbrcsljuidwhxyupzq',
    password,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✓ Connected to database');
    
    const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    await client.query(sql);
    console.log('✓ Schema applied successfully');
    
    // Verify tables
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log('✓ Tables:', rows.map(r => r.table_name).join(', '));
  } catch(e) {
    console.error('✗ Error:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
run();
