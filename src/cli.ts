#!/usr/bin/env node

import inquirer from 'inquirer';
import { nbtcal } from './index.js';

async function main() {
  console.log('\n@nbtca/nbtcal - Course Schedule Exporter');
  console.log('========================================\n');

  try {
    // Prompt for credentials
    const credentials = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Student ID:',
        validate: (input) => input.length > 0 || 'Student ID is required'
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*',
        validate: (input) => input.length > 0 || 'Password is required'
      }
    ]);

    // Prompt for semester start date
    const semesterInfo = await inquirer.prompt([
      {
        type: 'input',
        name: 'startDate',
        message: 'Semester start date (YYYY-MM-DD):',
        default: '2025-02-24',  // Example: Spring 2025 semester
        validate: (input) => {
          const date = new Date(input);
          return !isNaN(date.getTime()) || 'Invalid date format (use YYYY-MM-DD)';
        }
      }
    ]);

    // Prompt for recipient email only
    const emailInfo = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'Recipient email address (where to send the schedule):',
        validate: (input) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input) || 'Invalid email'
      }
    ]);

    // Check if SMTP is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('\n❌ Error: SMTP email service not configured.');
      console.error('\nPlease set the following environment variables:');
      console.error('  SMTP_HOST="smtp.gmail.com"          # SMTP server (optional, defaults to Gmail)');
      console.error('  SMTP_PORT="587"                     # SMTP port (optional, defaults to 587)');
      console.error('  SMTP_SECURE="false"                 # Use SSL/TLS (optional, defaults to false)');
      console.error('  SMTP_USER="your-email@example.com"  # Required');
      console.error('  SMTP_PASS="your-app-password"       # Required\n');
      console.error('For Gmail, use an app-specific password: https://support.google.com/accounts/answer/185833');
      process.exit(1);
    }

    console.log('\n');

    // Run the main process
    await nbtcal({
      credentials: {
        username: credentials.username,
        password: credentials.password
      },
      semesterStartDate: new Date(semesterInfo.startDate),
      email: emailInfo.email
    });

  } catch (error: any) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

main();
