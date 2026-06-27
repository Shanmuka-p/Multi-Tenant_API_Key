import { Router, Request, Response } from 'express';
import { generateKey, listKeys, revokeKey, rotateKey, getStats } from '../services/apiKeyService';
import { authMiddleware } from '../middleware/authMiddleware';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { getLogs, getLogsCount, getHourlyActivity } from '../services/auditLogService';

const router = Router();

// ── Tenant Routes ─────────────────────────────────────────────────────────────

/**
 * POST /api/tenants/:tenantId/keys
 * Issue a new API key for a tenant.
 */
router.post('/tenants/:tenantId/keys', async (req: Request, res: Response) => {
  try {
    const tenantId = parseInt(req.params.tenantId, 10);
    if (isNaN(tenantId)) {
      res.status(400).json({ error: 'Invalid tenantId' });
      return;
    }
    const rateLimitPerMinute = parseInt(req.body.rateLimitPerMinute ?? '100', 10);
    const result = await generateKey(tenantId, rateLimitPerMinute);
    res.status(201).json(result);
  } catch (error: unknown) {
    console.error('[Route] POST /tenants/:tenantId/keys error:', error);
    res.status(500).json({ error: 'Failed to generate key' });
  }
});

/**
 * GET /api/tenants/:tenantId/keys
 * List all API keys for a tenant (masked).
 */
router.get('/tenants/:tenantId/keys', async (req: Request, res: Response) => {
  try {
    const tenantId = parseInt(req.params.tenantId, 10);
    if (isNaN(tenantId)) {
      res.status(400).json({ error: 'Invalid tenantId' });
      return;
    }
    const keys = await listKeys(tenantId);
    res.status(200).json(keys);
  } catch (error) {
    console.error('[Route] GET /tenants/:tenantId/keys error:', error);
    res.status(500).json({ error: 'Failed to list keys' });
  }
});

/**
 * GET /api/tenants/:tenantId/stats
 * Summary statistics for the dashboard.
 */
router.get('/tenants/:tenantId/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = parseInt(req.params.tenantId, 10);
    if (isNaN(tenantId)) {
      res.status(400).json({ error: 'Invalid tenantId' });
      return;
    }
    const stats = await getStats(tenantId);
    res.status(200).json(stats);
  } catch (error) {
    console.error('[Route] GET /tenants/:tenantId/stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── Key Routes ────────────────────────────────────────────────────────────────

/**
 * DELETE /api/keys/:keyId
 * Immediately revoke an API key.
 */
router.delete('/keys/:keyId', async (req: Request, res: Response) => {
  try {
    const keyId = parseInt(req.params.keyId, 10);
    if (isNaN(keyId)) {
      res.status(400).json({ error: 'Invalid keyId' });
      return;
    }
    await revokeKey(keyId);
    res.status(204).send();
  } catch (error: unknown) {
    const appErr = error as Error & { statusCode?: number };
    if (appErr.statusCode === 404) {
      res.status(404).json({ error: 'Key not found' });
      return;
    }
    console.error('[Route] DELETE /keys/:keyId error:', error);
    res.status(500).json({ error: 'Failed to revoke key' });
  }
});

/**
 * POST /api/keys/:keyId/rotate
 * Rotate an API key with a 1-minute grace period.
 */
router.post('/keys/:keyId/rotate', async (req: Request, res: Response) => {
  try {
    const keyId = parseInt(req.params.keyId, 10);
    if (isNaN(keyId)) {
      res.status(400).json({ error: 'Invalid keyId' });
      return;
    }
    const result = await rotateKey(keyId);
    res.status(200).json(result);
  } catch (error: unknown) {
    const appErr = error as Error & { statusCode?: number };
    if (appErr.statusCode === 404) {
      res.status(404).json({ error: 'Key not found or already inactive' });
      return;
    }
    console.error('[Route] POST /keys/:keyId/rotate error:', error);
    res.status(500).json({ error: 'Failed to rotate key' });
  }
});

// ── Protected Endpoint ────────────────────────────────────────────────────────

/**
 * GET /api/protected
 * A rate-limited, authenticated endpoint for testing.
 */
router.get('/protected', authMiddleware, rateLimitMiddleware, (_req, res) => {
  res.status(200).json({
    message: 'Success! You accessed the protected route.',
    timestamp: new Date().toISOString(),
  });
});

// ── Audit Log Routes ──────────────────────────────────────────────────────────

/**
 * GET /api/logs
 * Paginated audit logs (most recent first).
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt((req.query.limit  as string) ?? '50',  10), 200);
    const offset = Math.max(parseInt((req.query.offset as string) ?? '0',   10), 0);
    const [logs, total] = await Promise.all([getLogs(limit, offset), getLogsCount()]);
    res.status(200).json({ logs, total, limit, offset });
  } catch (error) {
    console.error('[Route] GET /logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * GET /api/logs/activity
 * Per-minute request counts for the last hour (chart data).
 */
router.get('/logs/activity', async (_req, res: Response) => {
  try {
    const activity = await getHourlyActivity();
    res.status(200).json(activity);
  } catch (error) {
    console.error('[Route] GET /logs/activity error:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

export default router;
