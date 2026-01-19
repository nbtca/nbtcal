#!/usr/bin/env node

import inquirer from 'inquirer';
import { nbtcal } from './index.js';
import { t, getMessages } from './i18n.js';

async function main() {
  const msg = getMessages();

  console.log(msg.cliTitle);
  console.log(msg.cliDivider);

  try {
    // Prompt for credentials
    const credentials = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: msg.promptStudentId,
        validate: (input) => input.length > 0 || msg.validationStudentIdRequired
      },
      {
        type: 'password',
        name: 'password',
        message: msg.promptPassword,
        mask: '*',
        validate: (input) => input.length > 0 || msg.validationPasswordRequired
      }
    ]);

    // Prompt for semester start date
    const semesterInfo = await inquirer.prompt([
      {
        type: 'input',
        name: 'startDate',
        message: msg.promptStartDate,
        default: '2025-02-24',  // Example: Spring 2025 semester
        validate: (input) => {
          const date = new Date(input);
          return !isNaN(date.getTime()) || msg.validationInvalidDate;
        }
      }
    ]);

    // Prompt for recipient email only
    const emailInfo = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: msg.promptEmail,
        validate: (input) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input) || msg.validationInvalidEmail
      }
    ]);

    // Check email mode and configuration
    const emailMode = (process.env.EMAIL_MODE || 'api') as 'api' | 'smtp';

    if (emailMode === 'smtp') {
      // SMTP mode requires credentials
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error(msg.smtpModeError);
        msg.smtpConfigInstructions.forEach(line => console.error(line));
        console.error(msg.smtpModeErrorHelp);
        process.exit(1);
      }
    } else {
      // API mode - no configuration needed
      console.log(msg.usingCloudEmail);
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
    console.error(msg.errorPrefix + error.message);
    process.exit(1);
  }
}

main();
