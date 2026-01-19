import { Resend } from 'resend';

// Initialize Resend with API key from environment variable
const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailParams {
  to: string;
  icsData: Buffer;
  metadata?: {
    semester?: string;
    courseCount?: number;
  };
}

export interface SendEmailResult {
  messageId: string;
}

/**
 * Send email with ICS calendar attachment using Resend API
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { to, icsData, metadata } = params;

  try {
    const { data, error } = await resend.emails.send({
      from: 'NBT Calendar <calendar@nbtcal.com>',
      to: to,
      subject: 'Your Course Schedule',
      html: `
        <h2>Your Course Schedule</h2>
        <p>Your course schedule${metadata?.semester ? ` for semester ${metadata.semester}` : ''} is attached.</p>
        ${metadata?.courseCount ? `<p>Total courses: ${metadata.courseCount}</p>` : ''}
        <p>To import:</p>
        <ol>
          <li>Download the attached <code>schedule.ics</code> file</li>
          <li>Open your calendar app (Google Calendar, Apple Calendar, Outlook, etc.)</li>
          <li>Import the ICS file</li>
        </ol>
        <p><small>Generated on ${new Date().toLocaleString()}</small></p>
      `,
      attachments: [
        {
          filename: 'schedule.ics',
          content: icsData
        }
      ]
    });

    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }

    if (!data || !data.id) {
      throw new Error('Resend API did not return a message ID');
    }

    return { messageId: data.id };
  } catch (error: any) {
    // Re-throw with better error message
    if (error.message.includes('API key')) {
      throw new Error('Email service not configured. Please contact administrator.');
    }
    throw error;
  }
}
