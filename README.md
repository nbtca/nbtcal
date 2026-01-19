# @nbtca/nbtcal

Extract course schedule from NBT campus educational system and export to ICS calendar format.

## Features

- Authenticate with NBT WebVPN system
- Navigate educational system (jwxt.nbt.edu.cn)
- Extract course schedules (including electives and online courses)
- Convert to standard ICS calendar format
- Email delivery with calendar attachment
- Interactive CLI with user prompts
- Can be used as library or standalone tool

## Installation

```bash
npm install -g @nbtca/nbtcal
```

## Usage

### Quick Start (Recommended)

Run directly with npx - no configuration needed:

```bash
npx @nbtca/nbtcal
```

Your course schedule will be emailed to you via our cloud service. Your student credentials are processed **locally** and never sent to our servers - only the generated ICS calendar file is transmitted.

### Three Usage Modes

#### Mode 1: Cloud Email Service (Default - Easiest)

No SMTP configuration required. Just run the tool and provide your information when prompted:

```bash
npx @nbtca/nbtcal
```

The tool will:
1. Process your credentials **locally** on your machine
2. Fetch course data from NBT's system
3. Generate ICS calendar file **locally**
4. Send the ICS file to our cloud service for email delivery
5. You receive the calendar via email

**Privacy:** Your student ID and password never leave your computer.

#### Mode 2: Self-Hosted SMTP

If you prefer to use your own email server:

```bash
export EMAIL_MODE=smtp
export SMTP_HOST="smtp.gmail.com"
export SMTP_PORT="587"
export SMTP_SECURE="false"
export SMTP_USER="your-email@gmail.com"
export SMTP_PASS="your-app-password"

npx @nbtca/nbtcal
```

#### Mode 3: Self-Deployed API

Fork this repository and deploy your own Serverless function:

```bash
# Deploy to Vercel
vercel --prod

# Use your deployment
export API_URL="https://your-app.vercel.app/api/send-calendar"
npx @nbtca/nbtcal
```

### CLI Interactive Prompts

All modes use the same interactive prompts:
1. Enter student ID and password
2. Provide semester start date (e.g., 2025-02-24)
3. Enter recipient email address

If email sending fails, the ICS file will be saved locally for manual import.

### As Library

```typescript
import { nbtcal } from '@nbtca/nbtcal';

// Option 1: Use environment variables for SMTP (recommended)
await nbtcal({
  credentials: {
    username: 'your-student-id',
    password: 'your-password'
  },
  semesterStartDate: new Date('2024-09-02'),
  email: 'recipient@example.com'  // Recipient email only
});

// Option 2: Provide SMTP config programmatically
await nbtcal({
  credentials: {
    username: 'your-student-id',
    password: 'your-password'
  },
  semesterStartDate: new Date('2024-09-02'),
  email: 'recipient@example.com',
  smtp: {  // Optional - overrides environment variables
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: 'sender@gmail.com',
    pass: 'app-password'
  }
});
```

### SMTP Configuration

**For Administrators:** Configure the SMTP email service using environment variables or GitHub Secrets:

**Option 1: Environment Variables**

```bash
export SMTP_HOST="smtp.example.com"       # SMTP server hostname
export SMTP_PORT="587"                     # SMTP port (587 for STARTTLS, 465 for SSL)
export SMTP_SECURE="false"                 # Set to "true" for SSL/TLS
export SMTP_USER="sender@example.com"      # Sender email address
export SMTP_PASS="your-smtp-password"      # Sender email password
```

**Option 2: .env File**

```bash
cp .env.example .env
# Edit .env with your SMTP settings
```

**Option 3: GitHub Secrets (Recommended for CI/CD)**

Configure in your repository:
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP port (default: 587)
- `SMTP_SECURE` - Use SSL/TLS (default: false)
- `SMTP_USER` - Sender email address
- `SMTP_PASS` - Sender email password

**For Users:** Simply provide the recipient email address when prompted. No SMTP configuration needed.

**Supported Email Providers:**
- **Gmail** (smtp.gmail.com:587) - [Use app-specific password](https://support.google.com/accounts/answer/185833)
- **Outlook/Hotmail** (smtp-mail.outlook.com:587)
- **QQ Mail** (smtp.qq.com:587)
- **163 Mail** (smtp.163.com:465)
- **Custom SMTP** - Any standard SMTP server

**Testing Email Delivery:**

```bash
# First, run the full flow test to generate schedule.ics
npx tsx test-full-flow.ts

# Then test email sending
npx tsx test-email.ts recipient@example.com
```

## Architecture

Following Unix philosophy: modular, composable, single-purpose components.

```
src/
├── auth/          # WebVPN authentication
├── scraper/       # Schedule data extraction
├── converter/     # ICS format conversion
├── mailer/        # Email delivery
├── cli.ts         # Interactive CLI
├── index.ts       # Library exports
└── types.ts       # TypeScript definitions
```

### Components

- **AuthService**: Handles WebVPN login and navigation
- **ScheduleScraper**: Extracts course data from web pages
- **ICSConverter**: Converts course data to ICS format
- **MailService**: Sends ICS file via email

## Deployment (For Maintainers)

### Deploying the Email Service to Vercel

The cloud email service runs on Vercel as a Serverless function.

#### Prerequisites

1. Register for [Resend](https://resend.com) and get an API key (free tier: 3000 emails/month)
2. Install Vercel CLI: `npm install -g vercel`

#### Steps

```bash
# 1. Login to Vercel
vercel login

# 2. Initialize project
vercel

# 3. Add environment variable
vercel env add RESEND_API_KEY
# Paste your Resend API key when prompted

# 4. Deploy to production
vercel --prod
```

#### Environment Variables (Vercel)

Configure these in your Vercel project settings:

- `RESEND_API_KEY` (required) - Your Resend API key
- `API_KEY` (optional) - Add authentication to your API endpoint

#### Update npm Package

After deploying, update the default API URL in `src/mailer/index.ts`:

```typescript
url: process.env.API_URL || 'https://your-app.vercel.app/api/send-calendar'
```

Then publish the updated package:

```bash
npm version minor
npm publish
```

## Development

### Setup

```bash
npm install
npm run build
```

### Testing

Run manual test with real credentials:

```bash
npx tsx test-manual.ts
```

This will walk through the entire workflow with pauses for verification.

### Project Status

✅ **Fully tested and working**

- ✅ Successfully authenticates via WebVPN
- ✅ Extracts course schedules using HTTP API (27 courses tested)
- ✅ Generates valid ICS calendar files (52KB output)
- ✅ Email delivery tested and working
- ✅ Tested with actual NBT credentials

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed development guide.
See [TODO.md](./TODO.md) for roadmap and pending tasks.

## Integration with @nbtca/prompt

This package is designed to integrate with the `@nbtca/prompt` tool collection:

```typescript
import { nbtcal } from '@nbtca/nbtcal';
// Use in prompt tool workflows
```

## Security

- Credentials are never stored or logged
- Uses HTTP-only implementation (no browser automation)
- Password encrypted with AES-CBC before transmission
- SMTP passwords should use app-specific passwords
- Consider using environment variables for sensitive data

## License

MIT

## Contributing

Contributions are welcome!

**Areas for improvement:**
1. Support for more SMTP providers
2. Better error handling and user feedback
3. Calendar app compatibility testing
4. Configuration file support

## Troubleshooting

### Login fails
- Verify credentials are correct
- Check if WebVPN is accessible
- Ensure network connectivity to NBT servers

### No courses extracted
- Verify semester selection is correct
- Check if you have courses in the selected semester
- Review API response in debug output

### Wrong dates in calendar
- Verify semester start date is correct
- Check week number parsing
- Confirm time slot mappings match NBT's schedule

### Email fails
- Verify SMTP credentials
- Use app-specific password for Gmail
- Check firewall/network restrictions

For more help, see [DEVELOPMENT.md](./DEVELOPMENT.md) debugging section.
