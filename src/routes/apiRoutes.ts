import { Router } from 'express';
import { generateKey, listKeys, revokeKey, rotateKey } from '../services/apiKeyService';
import { authMiddleware } from '../middleware/authMiddleware';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware';
import { getLogs } from '../services/auditLogService';

const router = Router();

// Create a new API key for a tenant
router.post('/tenants/:tenantId/keys', async (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId, 10);
    const rateLimitPerMinute = req.body.rateLimitPerMinute || 100;
    
    const result = await generateKey(tenantId, rateLimitPerMinute);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error generating key:', error);
    res.status(500).json({ error: 'Failed to generate key' });
  }
});

// List all keys for a tenant
router.get('/tenants/:tenantId/keys', async (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId, 10);
    const keys = await listKeys(tenantId);
    res.status(200).json(keys);
  } catch (error) {
    console.error('Error listing keys:', error);
    res.status(500).json({ error: 'Failed to list keys' });
  }
});

// Revoke a key
router.delete('/keys/:keyId', async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId, 10);
    await revokeKey(keyId);
    res.status(204).send();
  } catch (error) {
    console.error('Error revoking key:', error);
    res.status(500).json({ error: 'Failed to revoke key' });
  }
});

// Rotate a key
router.post('/keys/:keyId/rotate', async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId, 10);
    const result = await rotateKey(keyId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error rotating key:', error);
    res.status(500).json({ error: 'Failed to rotate key' });
  }
});

// Protected Endpoint
router.get('/protected', authMiddleware, rateLimitMiddleware, (req, res) => {
  res.status(200).json({ message: 'Success! You accessed the protected route.' });
});

// Get Audit Logs (for the dashboard)
router.get('/logs', async (req, res) => {
  try {
    const logs = await getLogs();
    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

export default router;
