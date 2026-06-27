import { query } from '../config/db';

export const logRequest = async (
  apiKeyId: number,
  endpoint: string,
  statusCode: number
): Promise<void> => {
  await query(
    `INSERT INTO audit_logs (api_key_id, endpoint, status_code) VALUES ($1, $2, $3)`,
    [apiKeyId, endpoint, statusCode]
  );
};

export const getLogs = async (limit = 100, offset = 0) => {
  const res = await query(
    `SELECT
       a.id,
       a.api_key_id,
       k.key_prefix,
       k.last_four,
       a.endpoint,
       a.status_code,
       a.timestamp
     FROM audit_logs a
     JOIN api_keys k ON a.api_key_id = k.id
     ORDER BY a.timestamp DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return res.rows.map((row) => ({
    id: row.id as number,
    apiKeyId: row.api_key_id as number,
    maskedKey: `${row.key_prefix}...${row.last_four}`,
    endpoint: row.endpoint as string,
    statusCode: row.status_code as number,
    timestamp: row.timestamp as string,
  }));
};

export const getLogsCount = async (): Promise<number> => {
  const res = await query(`SELECT COUNT(*) FROM audit_logs`);
  return parseInt(res.rows[0].count as string, 10);
};

export const getHourlyActivity = async () => {
  // Return per-minute request counts for the last 60 minutes (for the chart)
  const res = await query(`
    SELECT
      date_trunc('minute', timestamp) AS minute,
      COUNT(*) FILTER (WHERE status_code = 200) AS success_count,
      COUNT(*) FILTER (WHERE status_code = 429) AS limited_count
    FROM audit_logs
    WHERE timestamp > NOW() - INTERVAL '1 hour'
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  return res.rows;
};
