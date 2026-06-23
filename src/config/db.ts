import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DB_URL || 'postgres://user:pass@localhost:5432/apikeys';

export const pool = new Pool({
  connectionString: dbUrl,
});

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};
