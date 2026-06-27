import crypto from 'crypto';
import { query } from '../config/db';

export const generateKey = async (tenantId: number, rateLimitPerMinute: number = 100) => {
  // 1. Generate cryptographically secure random bytes
  const buffer = crypto.randomBytes(32);

  // 2. Base64 URL-safe encode (RFC 4648 §5 — no +, /, or padding)
  const base64UrlKey = buffer.toString('base64url');

  // 3. Prepend prefix
  const prefix = 'sk_live_';
  const apiKey = `${prefix}${base64UrlKey}`;

  // 4. Last four characters for display/masking
  const lastFour = apiKey.slice(-4);

  // 5. SHA-256 hash — never store the plaintext key
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // 6. Persist the hash (not the plaintext key)
  const res = await query(
    `INSERT INTO api_keys (tenant_id, key_hash, key_prefix, last_four, rate_limit_per_minute, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [tenantId, keyHash, prefix, lastFour, rateLimitPerMinute, true]
  );

  return {
    apiKey, // returned ONCE — never retrievable again
    keyRecord: {
      id: res.rows[0].id as number,
      lastFour,
      rateLimitPerMinute,
      createdAt: res.rows[0].created_at as string,
    },
  };
};

export const listKeys = async (tenantId: number) => {
  const res = await query(
    `SELECT id, key_prefix, last_four, created_at, is_active, rate_limit_per_minute, expires_at
     FROM api_keys
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId]
  );

  return res.rows.map((row) => ({
    id: row.id as number,
    maskedKey: `${row.key_prefix}...${row.last_four}`,
    createdAt: row.created_at as string,
    isActive: row.is_active as boolean,
    rateLimitPerMinute: row.rate_limit_per_minute as number,
    expiresAt: row.expires_at as string | null,
  }));
};

export const revokeKey = async (keyId: number): Promise<void> => {
  const res = await query(
    `UPDATE api_keys SET is_active = FALSE WHERE id = $1 RETURNING id`,
    [keyId]
  );
  if (res.rowCount === 0) {
    const err = new Error('Key not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
};

export const rotateKey = async (keyId: number) => {
  // Fetch existing key to get tenantId and rateLimit
  const existingKeyRes = await query(
    `SELECT tenant_id, rate_limit_per_minute FROM api_keys WHERE id = $1 AND is_active = TRUE`,
    [keyId]
  );

  if (existingKeyRes.rows.length === 0) {
    const err = new Error('Key not found or already inactive') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const { tenant_id, rate_limit_per_minute } = existingKeyRes.rows[0];

  // Mark old key with a 1-minute grace period expiration (per spec)
  const expiresAt = new Date(Date.now() + 60_000); // exactly 1 minute
  await query(`UPDATE api_keys SET expires_at = $1 WHERE id = $2`, [expiresAt, keyId]);

  // Generate the new key for the same tenant with same rate limit
  const newKeyData = await generateKey(tenant_id as number, rate_limit_per_minute as number);

  return {
    newApiKey: newKeyData.apiKey,
    keyRecord: newKeyData.keyRecord,
  };
};

export const validateKey = async (apiKey: string) => {
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const res = await query(
    `SELECT id, tenant_id, rate_limit_per_minute
     FROM api_keys
     WHERE key_hash = $1
       AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [keyHash]
  );

  if (res.rows.length === 0) {
    return null;
  }

  return res.rows[0] as { id: number; tenant_id: number; rate_limit_per_minute: number };
};

export const getStats = async (tenantId: number) => {
  const res = await query(
    `SELECT
       COUNT(DISTINCT k.id) AS total_keys,
       COUNT(DISTINCT k.id) FILTER (WHERE k.is_active = TRUE AND (k.expires_at IS NULL OR k.expires_at > NOW())) AS active_keys,
       COUNT(l.id) AS total_requests,
       COUNT(l.id) FILTER (WHERE l.status_code = 200) AS successful_requests,
       COUNT(l.id) FILTER (WHERE l.status_code = 429) AS rate_limited_requests,
       COUNT(l.id) FILTER (WHERE l.timestamp > NOW() - INTERVAL '1 hour') AS requests_last_hour
     FROM api_keys k
     LEFT JOIN audit_logs l ON l.api_key_id = k.id
     WHERE k.tenant_id = $1`,
    [tenantId]
  );
  return res.rows[0];
};
