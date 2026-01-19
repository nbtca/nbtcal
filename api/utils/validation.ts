export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate email and ICS data from API request
 */
export function validateRequest(data: any): ValidationResult {
  // Email validation
  if (!data.email || typeof data.email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  if (data.email.length > 254) {
    return { valid: false, error: 'Email address too long (max 254 characters)' };
  }

  // ICS data validation
  if (!data.icsData || typeof data.icsData !== 'string') {
    return { valid: false, error: 'ICS data is required' };
  }

  try {
    // Decode Base64
    const decoded = Buffer.from(data.icsData, 'base64');

    // Check size limit (5MB)
    if (decoded.length > 5 * 1024 * 1024) {
      return { valid: false, error: 'ICS file too large (max 5MB)' };
    }

    // Basic ICS format check
    const icsContent = decoded.toString('utf-8');
    if (!icsContent.includes('BEGIN:VCALENDAR')) {
      return { valid: false, error: 'Invalid ICS format - missing VCALENDAR header' };
    }

    if (!icsContent.includes('END:VCALENDAR')) {
      return { valid: false, error: 'Invalid ICS format - missing VCALENDAR footer' };
    }
  } catch (error) {
    return { valid: false, error: 'Invalid Base64 encoding' };
  }

  return { valid: true };
}
