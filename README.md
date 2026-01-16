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

### As CLI Tool

First, configure SMTP settings via environment variables or GitHub Secrets:

```bash
export SMTP_HOST="smtp.example.com"       # Optional, defaults to Gmail
export SMTP_PORT="587"                     # Optional, defaults to 587
export SMTP_SECURE="false"                 # Optional, defaults to false
export SMTP_USER="sender@example.com"      # Required
export SMTP_PASS="your-smtp-password"      # Required
```

Then run:

```bash
nbtcal
```

Follow the interactive prompts to:
1. Enter student ID and password
2. Provide semester start date
3. Enter recipient email address

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
