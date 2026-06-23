import { query } from '../config/db';

export const logRequest = async (apiKeyId: number, endpoint: string, statusCode: number) => {
  await query(
    `INSERT INTO audit_logs (api_key_id, endpoint, status_code) VALUES ($1, $2, $3)`,
    [apiKeyId, endpoint, statusCode]
  );
};

export const getLogs = async () => {
    const res = await query(`
        SELECT a.id, k.key_prefix, k.last_four, a.endpoint, a.status_code, a.timestamp
        FROM audit_logs a
        JOIN api_keys k ON a.api_key_id = k.id
        ORDER BY a.timestamp DESC
        LIMIT 100
    `);

    return res.rows.map(row => ({
        id: row.id,
        maskedKey: `${row.key_prefix}...${row.last_four}`,
        endpoint: row.endpoint,
        statusCode: row.status_code,
        timestamp: row.timestamp
    }));
}
