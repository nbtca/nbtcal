export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

// Simple in-memory storage for rate limiting (suitable for small scale)
// For production at scale, consider using Redis (Upstash/Vercel KV)
const ipRequestMap = new Map<string, number[]>();
const emailRequestMap = new Map<string, number[]>();

/**
 * Check rate limits based on IP and email
 * - IP: 5 requests/minute
 * - Email: 3 requests/hour
 */
export async function checkRateLimit(ip: string, email: string): Promise<RateLimitResult> {
  const now = Date.now();
  const oneMinute = 60 * 1000;
  const oneHour = 60 * 60 * 1000;

  // Clean up old entries to prevent memory leak
  if (ipRequestMap.size > 1000) {
    const oldestIps = Array.from(ipRequestMap.entries())
      .sort((a, b) => Math.max(...b[1]) - Math.max(...a[1]))
      .slice(500)
      .map(([ip]) => ip);
    oldestIps.forEach(ip => ipRequestMap.delete(ip));
  }

  if (emailRequestMap.size > 1000) {
    const oldestEmails = Array.from(emailRequestMap.entries())
      .sort((a, b) => Math.max(...b[1]) - Math.max(...a[1]))
      .slice(500)
      .map(([email]) => email);
    oldestEmails.forEach(email => emailRequestMap.delete(email));
  }

  // IP rate limit: 5 requests per minute
  const ipRequests = ipRequestMap.get(ip) || [];
  const recentIpRequests = ipRequests.filter(t => now - t < oneMinute);

  if (recentIpRequests.length >= 5) {
    return {
      allowed: false,
      retryAfter: Math.ceil((recentIpRequests[0] + oneMinute - now) / 1000)
    };
  }

  // Email rate limit: 3 requests per hour
  const emailRequests = emailRequestMap.get(email) || [];
  const recentEmailRequests = emailRequests.filter(t => now - t < oneHour);

  if (recentEmailRequests.length >= 3) {
    return {
      allowed: false,
      retryAfter: Math.ceil((recentEmailRequests[0] + oneHour - now) / 1000)
    };
  }

  // Record this request
  recentIpRequests.push(now);
  ipRequestMap.set(ip, recentIpRequests);

  recentEmailRequests.push(now);
  emailRequestMap.set(email, recentEmailRequests);

  return { allowed: true };
}
