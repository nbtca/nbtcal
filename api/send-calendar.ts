import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateRequest } from './utils/validation';
import { checkRateLimit } from './utils/rate-limit';
import { sendEmail } from './utils/email';

/**
 * Serverless function to send calendar email
 * POST /api/send-calendar
 *
 * Request body:
 * {
 *   email: string,
 *   icsData: string (Base64 encoded),
 *   metadata?: { semester?: string, courseCount?: number }
 * }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only POST method is allowed'
      }
    });
  }

  try {
    // Optional API key authentication
    const apiKey = process.env.API_KEY;
    if (apiKey && req.headers['x-api-key'] !== apiKey) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key'
        }
      });
    }

    // Extract request body
    const { email, icsData, metadata } = req.body;

    // 1. Validate input
    const validation = validateRequest({ email, icsData });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: validation.error || 'Invalid request'
        }
      });
    }

    // 2. Check rate limits
    const clientIp = (req.headers['x-forwarded-for'] as string) ||
                      (req.socket.remoteAddress as string) ||
                      'unknown';

    const rateLimitCheck = await checkRateLimit(clientIp, email);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT',
          message: 'Too many requests. Please try again later.',
          retryAfter: rateLimitCheck.retryAfter
        }
      });
    }

    // 3. Send email
    const result = await sendEmail({
      to: email,
      icsData: Buffer.from(icsData, 'base64'),
      metadata
    });

    // 4. Return success response
    return res.status(200).json({
      success: true,
      messageId: result.messageId,
      sentAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Send calendar error:', error);

    // Return error response
    return res.status(500).json({
      success: false,
      error: {
        code: 'SEND_FAILED',
        message: 'Failed to send email. Please try again later.'
      }
    });
  }
}

// Vercel function configuration
export const config = {
  maxDuration: 30,  // Maximum execution time: 30 seconds
};
