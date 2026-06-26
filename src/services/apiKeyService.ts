import crypto from 'crypto';
import { query } from '../config/db';

export const generateKey = async (tenantId: number, rateLimitPerMinute: number = 10) => {
  // Generate random bytes
  const buffer = crypto.randomBytes(32);
  // Base64 URL-safe encode
  const base64UrlKey = buffer.toString('base64url');
  const prefix = 'sk_live_';
  const apiKey = `${prefix}${base64UrlKey}`;
  
  const lastFour = apiKey.slice(-4);
  
  // Hash the key
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  // Store in DB
  const res = await query(
    `INSERT INTO api_keys (tenant_id, key_hash, key_prefix, last_four, rate_limit_per_minute, is_active) 
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [tenantId, keyHash, prefix, lastFour, rateLimitPerMinute, true]
  );
  
  return {
    apiKey,
    keyRecord: {
      id: res.rows[0].id,
      lastFour,
      rateLimitPerMinute
    }
  };
};

export const listKeys = async (tenantId: number) => {
  const res = await query(
    `SELECT id, key_prefix, last_four, created_at, is_active FROM api_keys WHERE tenant_id = $1`,
    [tenantId]
  );
  
  return res.rows.map(row => ({
    id: row.id,
    maskedKey: `${row.key_prefix}...${row.last_four}`,
    createdAt: row.created_at,
    isActive: row.is_active
  }));
};

export const revokeKey = async (keyId: number) => {
  await query(`UPDATE api_keys SET is_active = FALSE WHERE id = $1`, [keyId]);
};

export const rotateKey = async (keyId: number) => {
  // Fetch existing key to get tenantId and rateLimit
  const existingKeyRes = await query(`SELECT tenant_id, rate_limit_per_minute FROM api_keys WHERE id = $1`, [keyId]);
  if (existingKeyRes.rows.length === 0) {
    throw new Error('Key not found');
  }
  
  const { tenant_id, rate_limit_per_minute } = existingKeyRes.rows[0];
  
  // Set expiration on old key (1 minute from now)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 1);
  
  await query(`UPDATE api_keys SET expires_at = $1 WHERE id = $2`, [expiresAt, keyId]);
  
  // Generate new key
  const newKeyData = await generateKey(tenant_id, rate_limit_per_minute);
  
  return {
    newApiKey: newKeyData.apiKey
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
  
  return res.rows[0];
};
