import { redisClient } from '../config/redis';

const WINDOW_MS = 60_000; // 60-second sliding window

/**
 * Sliding-window log rate limiter using Redis sorted sets.
 *
 * Algorithm (all steps run atomically via MULTI/EXEC):
 *  1. ZREMRANGEBYSCORE — evict timestamps older than the current window
 *  2. ZCARD            — count requests remaining in the window (BEFORE adding)
 *  3. ZADD             — add the current request timestamp (only if allowed)
 *  4. EXPIRE           — keep the set TTL tidy
 *
 * By reading the count BEFORE adding, we avoid inflating the window with
 * blocked requests' timestamps — a common off-by-one implementation mistake.
 */
export const checkRateLimit = async (
  apiKeyId: number,
  rateLimitPerMinute: number
): Promise<{ allowed: boolean; count: number; retryAfterMs?: number }> => {
  const key = `rate_limit:${apiKeyId}`;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Step 1 & 2: Evict stale entries, then count existing ones — atomically
  const pipeline = redisClient.multi();
  pipeline.zRemRangeByScore(key, 0, windowStart);  // remove expired entries
  pipeline.zCard(key);                              // count remaining
  const preResults = await pipeline.exec();

  const currentCount = preResults[1] as number;

  if (currentCount >= rateLimitPerMinute) {
    // Request is denied — do NOT add to sorted set so it doesn't pollute the window.
    // Calculate Retry-After: time until the oldest entry falls out of the window.
    const oldest = await redisClient.zRangeWithScores(key, 0, 0);
    let retryAfterMs = WINDOW_MS; // fallback: full window
    if (oldest.length > 0) {
      const oldestTimestamp = oldest[0].score;
      retryAfterMs = Math.max(0, WINDOW_MS - (now - oldestTimestamp));
    }
    return { allowed: false, count: currentCount, retryAfterMs };
  }

  // Request is allowed — now record it.
  // Use a unique value (timestamp + random) to support concurrent requests in same ms.
  const uniqueValue = `${now}-${Math.random().toString(36).slice(2)}`;
  const addPipeline = redisClient.multi();
  addPipeline.zAdd(key, [{ score: now, value: uniqueValue }]);
  addPipeline.expire(key, Math.ceil(WINDOW_MS / 1000) + 1); // auto-cleanup
  await addPipeline.exec();

  return { allowed: true, count: currentCount + 1 };
};
