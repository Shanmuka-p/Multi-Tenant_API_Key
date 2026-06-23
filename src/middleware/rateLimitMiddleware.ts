import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authMiddleware';
import { checkRateLimit } from '../services/rateLimiterService';
import { logRequest } from '../services/auditLogService';

export const rateLimitMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  if (!req.apiKeyData) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  const { id: apiKeyId, rate_limit_per_minute } = req.apiKeyData;
  const endpoint = req.originalUrl;
  
  try {
    const { allowed, count } = await checkRateLimit(apiKeyId, rate_limit_per_minute);
    
    if (!allowed) {
      // Log the rate-limited request
      await logRequest(apiKeyId, endpoint, 429);
      
      res.set('Retry-After', '60'); // Assuming sliding window is 60 seconds
      res.status(429).json({ error: 'Too Many Requests' });
      return;
    }
    
    // Save info for later logging
    res.on('finish', async () => {
        // Log the successful request after it finishes
        // We log after finish to record the actual status code
        if (res.statusCode !== 429) { // we already logged 429
            await logRequest(apiKeyId, endpoint, res.statusCode);
        }
    });

    next();
  } catch (error) {
    console.error('Rate Limit Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
