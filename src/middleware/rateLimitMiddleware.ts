import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authMiddleware';
import { checkRateLimit } from '../services/rateLimiterService';
import { logRequest } from '../services/auditLogService';

export const rateLimitMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.apiKeyData) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { id: apiKeyId, rate_limit_per_minute } = req.apiKeyData;
  // Use only the pathname, not the full URL with query string
  const endpoint = req.path;

  try {
    const { allowed, count, retryAfterMs } = await checkRateLimit(apiKeyId, rate_limit_per_minute);

    if (!allowed) {
      const retryAfterSeconds = Math.ceil((retryAfterMs ?? 60_000) / 1000);

      // Log the rate-limited request — fire and handle errors gracefully
      logRequest(apiKeyId, endpoint, 429).catch((err) =>
        console.error('[AuditLog] Failed to log 429 request:', err)
      );

      res.set('Retry-After', String(retryAfterSeconds));
      res.set('X-RateLimit-Limit', String(rate_limit_per_minute));
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + (retryAfterMs ?? 60_000)) / 1000)));
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit of ${rate_limit_per_minute} requests/minute exceeded. Retry after ${retryAfterSeconds}s.`,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    // Set rate limit headers on successful requests too
    res.set('X-RateLimit-Limit', String(rate_limit_per_minute));
    res.set('X-RateLimit-Remaining', String(Math.max(0, rate_limit_per_minute - count)));

    // Log after the response is sent (so we capture the real status code)
    res.on('finish', () => {
      logRequest(apiKeyId, endpoint, res.statusCode).catch((err) =>
        console.error('[AuditLog] Failed to log request:', err)
      );
    });

    next();
  } catch (error) {
    console.error('[RateLimit] Middleware error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
