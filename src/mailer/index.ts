import nodemailer from 'nodemailer';
import type { EmailConfig, SMTPConfig } from '../types.js';

export class MailService {
  async send(config: EmailConfig): Promise<void> {
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
      console.log(`Email sent successfully to ${config.to}`);
    } catch (error) {
      throw new Error(`Failed to send email: ${error}`);
    }
  }
}
