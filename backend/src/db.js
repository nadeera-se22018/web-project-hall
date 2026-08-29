import 'dotenv/config';
import pg from 'pg';
import knex from 'knex';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const db = knex({
  client: 'pg',
  connection: {
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
  },
});

// We still need a raw query function for the DDL scripts in initializeDatabase
const { Pool } = pg;
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
});

export const initializeDatabase = async () => {
  try {
    // Check if the 'users' table already exists to avoid resetting the database on every restart
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    const schemaExists = tableCheck.rows[0].exists;

    if (!schemaExists) {
      console.log('Database schema not found. Initializing database with init.sql...');
      const sqlPath = path.join(__dirname, '../init.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');
      
      await pool.query(sql);
      console.log('Database initialized successfully with seeded roles, permissions, and test users.');
    } else {
      console.log('Database schema already exists. Skipping initialization.');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

export default pool;
export const getProjectsQuery = (knexDb) => {
  return knexDb('projects as p')
    .join('users as u', 'p.created_by', 'u.id')
    .leftJoin('project_likes as pl', 'pl.project_id', 'p.id')
    .select(
      'p.id', 'p.title', 'p.description', 'p.thumbnail_url', 'p.visibility', 'p.created_at', 'p.updated_at',
      'u.id as author_id', 'u.name as author_name', 'u.email as author_email', 'u.avatar_url as author_avatar',
      knexDb.raw('COUNT(pl.id)::INT as like_count')
    )
    .groupBy('p.id', 'u.id');
};
