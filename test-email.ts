import { MailService } from './dist/mailer/index.js';
import { readFileSync } from 'fs';

// Check if SMTP is configured
if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.error('\n❌ Error: SMTP not configured.');
  console.error('\nPlease set environment variables:');
  console.error('  export SMTP_HOST="smtp.example.com"');
  console.error('  export SMTP_PORT="587"');
  console.error('  export SMTP_SECURE="false"');
  console.error('  export SMTP_USER="sender@example.com"');
  console.error('  export SMTP_PASS="your-smtp-password"\n');
  console.error('Or configure via GitHub Secrets for CI/CD.\n');
  process.exit(1);
}

async function testEmail() {
  console.log('Email Delivery Test');
  console.log('===================\n');

  try {
    // Check if test-schedule.ics exists
    let icsBuffer: Buffer;
    try {
      icsBuffer = readFileSync('test-schedule.ics');
      console.log(`✓ Found test-schedule.ics (${icsBuffer.length} bytes)\n`);
    } catch (error) {
      console.error('✗ test-schedule.ics not found. Run "npx tsx test-full-flow.ts" first.\n');
      process.exit(1);
    }

    // Get recipient email
    const recipientEmail = process.argv[2] || 'test@example.com';
    console.log(`Sending to: ${recipientEmail}`);
    console.log(`From: ${process.env.SMTP_USER}`);
    console.log(`SMTP Server: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}\n`);

    console.log('Sending email...');

    const mailer = new MailService();
    await mailer.send({
      to: recipientEmail,
      subject: 'NBT Course Schedule - Test Email',
      body: `This is a test email from @nbtca/nbtcal.

Your course schedule is attached as an ICS file.

To import:
1. Download the attached schedule.ics file
2. Open your calendar app (Google Calendar, Apple Calendar, Outlook, etc.)
3. Import the ICS file

Total courses: 27
Generated: ${new Date().toLocaleString()}

---
This is an automated test email.`,
      attachment: icsBuffer,
      filename: 'schedule.ics'
    });

    console.log('\n✓ Email sent successfully!');
    console.log(`  Check ${recipientEmail} for the email.\n`);

  } catch (error: any) {
    console.error('\n✗ Failed to send email:', error.message);
    console.error('\nTroubleshooting:');
    console.error('- Check SMTP credentials');
    console.error('- Verify SMTP server is accessible');
    console.error('- Check firewall/network settings');
    console.error('- Try different ports: 587 (STARTTLS) or 465 (SSL)\n');
    process.exit(1);
  }
}

testEmail();
