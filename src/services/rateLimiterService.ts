import { redisClient } from '../config/redis';

export const checkRateLimit = async (apiKeyId: number, rateLimitPerMinute: number) => {
  const key = `rate_limit:${apiKeyId}`;
  const now = Date.now();
  const windowStart = now - 60000; // 60 seconds ago

  // Execute transactionally
  const multi = redisClient.multi();
  
  // 1. Remove old entries outside the window
  multi.zRemRangeByScore(key, 0, windowStart);
  
  // 2. Add current request
  // Add a random component to value to make it unique within the same millisecond
  const uniqueValue = `${now}-${Math.random()}`;
  multi.zAdd(key, [{ score: now, value: uniqueValue }]);
  
  // 3. Count requests in the window
  multi.zCard(key);
  
  // Optional: Set expiration on the sorted set so it cleans up if unused
  multi.expire(key, 60);

  const results = await multi.exec();
  
  // results[2] corresponds to the zCard result
  const count = results[2] as number;
  
  if (count > rateLimitPerMinute) {
    return { allowed: false, count };
  }
  
  return { allowed: true, count };
};
