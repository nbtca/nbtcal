import { nbtcal } from './dist/index.js';
import { writeFileSync } from 'fs';

// Check if test credentials are provided
if (!process.env.TEST_STUDENT_ID || !process.env.TEST_PASSWORD) {
  console.error('\n❌ Error: Test credentials not configured.');
  console.error('\nPlease set environment variables:');
  console.error('  export TEST_STUDENT_ID="your-student-id"');
  console.error('  export TEST_PASSWORD="your-password"\n');
  process.exit(1);
}

// Override email service to save to file instead
import { MailService } from './dist/mailer/index.js';

MailService.prototype.send = async function(config: any) {
  writeFileSync('test-schedule.ics', config.attachment);
  console.log('      ✓ Saved to test-schedule.ics (email sending skipped for test)\n');
  return Promise.resolve();
};

async function test() {
  try {
    await nbtcal({
      credentials: {
        username: process.env.TEST_STUDENT_ID!,
        password: process.env.TEST_PASSWORD!
      },
      semesterStartDate: new Date('2025-02-24'),  // Spring 2025 semester start
      email: 'test@example.com'
    });

    console.log('\n✓ Test completed successfully!');
    console.log('  Check test-schedule.ics file');

  } catch (error: any) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
