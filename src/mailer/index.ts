import nodemailer from 'nodemailer';
import { getMessages } from '../i18n.js';
import type { EmailConfig, SMTPConfig, EmailMode, SendCalendarResponse } from '../types.js';

export class MailService {
  /**
   * Send email via API (Serverless function)
   */
  private async sendViaAPI(config: EmailConfig): Promise<void> {
    const apiConfig = config.api || {
      url: process.env.API_URL || 'https://nbtcal.vercel.app/api/send-calendar',
      apiKey: process.env.API_KEY,
      timeout: 30000
    };

    const response = await fetch(apiConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiConfig.apiKey && { 'X-API-Key': apiConfig.apiKey })
      },
      body: JSON.stringify({
        email: config.to,
        icsData: config.attachment.toString('base64')
      }),
      signal: AbortSignal.timeout(apiConfig.timeout || 30000)
    });

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      try {
        const errorData = await response.json() as SendCalendarResponse;
        if (errorData.error) {
          errorMessage = `${errorData.error.code}: ${errorData.error.message}`;
          if (errorData.error.retryAfter) {
            errorMessage += ` (retry after ${errorData.error.retryAfter}s)`;
          }
        }
      } catch {
        // Fallback to status text if JSON parsing fails
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json() as SendCalendarResponse;
    if (result.success) {
      const msg = getMessages();
      console.log(msg.emailSentSuccess + config.to);
      if (result.messageId) {
        console.log(msg.emailMessageId + result.messageId);
      }
    } else {
      throw new Error(result.error?.message || 'Unknown API error');
    }
  }

  /**
   * Send email via SMTP (traditional method)
   */
  private async sendViaSMTP(config: EmailConfig): Promise<void> {
    // Use provided SMTP config or fall back to environment variables with Gmail defaults
    const smtpConfig: SMTPConfig = config.smtp || {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    };

    if (!smtpConfig.user || !smtpConfig.pass) {
      throw new Error('SMTP credentials not provided. Set SMTP_USER and SMTP_PASS environment variables or provide smtp config.');
    }

    // Create a transporter using SMTP
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass
      }
    });

    const mailOptions = {
      from: smtpConfig.user,
      to: config.to,
      subject: config.subject,
      text: config.body,
      attachments: [
        {
          filename: config.filename,
          content: config.attachment
        }
      ]
    };

    try {
      await transporter.sendMail(mailOptions);
      const msg = getMessages();
      console.log(msg.emailSentSuccess + config.to);
    } catch (error) {
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  /**
   * Main send method with fallback mechanism
   */
  async send(config: EmailConfig): Promise<void> {
    const mode: EmailMode = config.mode || (process.env.EMAIL_MODE as EmailMode) || 'api';
    const msg = getMessages();

    try {
      if (mode === 'api') {
        await this.sendViaAPI(config);
      } else {
        await this.sendViaSMTP(config);
      }
    } catch (error: any) {
      console.error(msg.emailFailedWarning + error.message + '\n');

      // Fallback: Save ICS file locally
      try {
        const fs = await import('fs');
        const filename = `schedule-${Date.now()}.ics`;
        fs.writeFileSync(filename, config.attachment);
        console.log(msg.emailSavedLocally + filename);
        console.log(msg.emailImportManually);
      } catch (saveError) {
        console.error(`Failed to save ICS file: ${saveError}`);
        throw error; // Re-throw original error if save also fails
      }
    }
  }
}
