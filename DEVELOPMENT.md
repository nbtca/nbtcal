# Development Guide

## Current Status

### Completed Components

1. **Authentication Module** (`src/auth/index.ts`)
   - WebVPN login functionality
   - Navigation to educational system
   - Handles "已阅读" acknowledgment
   - Navigate to schedule page

2. **Schedule Scraper** (`src/scraper/index.ts`)
   - Semester selection (academic year + semester)
   - Extract main schedule table
   - Extract additional courses (electives, online courses)
   - Parse course information (name, teacher, location, time, weeks)

3. **ICS Converter** (`src/converter/index.ts`)
   - Convert course schedule to standard ICS format
   - Calculate dates based on semester start date and week numbers
   - Generate calendar events with proper time slots

4. **Email Service** (`src/mailer/index.ts`)
   - Send ICS file as attachment
   - SMTP configuration support

5. **CLI Interface** (`src/cli.ts`)
   - Interactive prompts for all required information
   - Credential input (student ID, password)
   - Semester selection
   - Email configuration

### Testing Status

✅ **Successfully tested with actual NBT credentials**

1. **Authentication Flow**
   - ✅ WebVPN login working with AES password encryption
   - ✅ Session management across redirects
   - ✅ Navigation to schedule system

2. **Schedule API**
   - ✅ Semester auto-detection working
   - ✅ API endpoint: `/jwglxt/kbcx/xskbcx_cxXsgrkb.html`
   - ✅ Handles both regular courses (kbList) and practice courses (sjkList)

3. **Data Extraction**
   - ✅ Course name, teacher, location parsing
   - ✅ Week number parsing (handles ranges like "1-16周")
   - ✅ Time slot conversion to actual times
   - ✅ 27 courses successfully extracted in test

## Testing Workflow

### Full Flow Test

Run the end-to-end test:

```bash
npm run build
npx tsx test-full-flow.ts
```

This will:
1. Authenticate with test credentials
2. Navigate to schedule system
3. Auto-detect current semester
4. Extract course data
5. Generate ICS file (saved as `test-schedule.ics`)

Expected output:
- ✓ Login successful
- ✓ Found 27 courses
- ✓ Generated ~52KB ICS file

### Interactive CLI Test

Test the CLI interface:

```bash
npm run build
npm start
```

Follow the interactive prompts to test with your own credentials.

## Implementation Details

### HTTP-Based Architecture

The implementation uses pure HTTP requests (no browser automation):

- **axios** + **axios-cookiejar-support**: HTTP client with cookie management
- **cheerio**: HTML parsing for extracting encryption keys
- **crypto-js**: AES-CBC password encryption

### API Endpoints

1. **Login**: `POST /cas/login?service=...`
   - Requires AES-encrypted password
   - Encryption key extracted from page HTML

2. **Schedule Data**: `POST /jwglxt/kbcx/xskbcx_cxXsgrkb.html`
   - Returns JSON with course data
   - Parameters: `xnm` (academic year), `xqm` (semester code)

### Data Format

API returns JSON structure:
```typescript
{
  kbList: [    // Regular courses
    {
      kcmc: string,   // Course name
      xm: string,     // Teacher name
      cdmc: string,   // Location
      xqj: string,    // Weekday (1-7)
      jcs: string,    // Time slots
      zcd: string     // Week range
    }
  ],
  sjkList: [   // Practice courses
    // Same structure
  ]
}
```

### Time Slot Mapping

Verified time slots for NBT:

```typescript
1: '08:00', 2: '08:50', 3: '09:50', 4: '10:40',
5: '11:30', 6: '13:30', 7: '14:20', 8: '15:20',
9: '16:10', 10: '17:00', 11: '18:30', 12: '19:20',
13: '20:10', 14: '21:00'
```

## Next Steps

### Completed ✅

- ✅ HTTP-based authentication working
- ✅ Schedule API successfully queried
- ✅ Course data parsing complete
- ✅ ICS generation validated
- ✅ End-to-end test passing

### Pending

1. **Email Delivery Testing**
   - Currently mocked in tests
   - Need to test with actual SMTP server
   - Verify ICS attachment delivery

2. **Calendar Import Testing**
   - Import generated ICS into Google Calendar
   - Test with Apple Calendar
   - Test with Outlook

3. **Error Handling**
   - Network failure handling
   - Invalid credentials handling
   - API changes detection

4. **Configuration**
   - Support for config file (~/.nbtcalrc)
   - Flexible SMTP provider selection
   - Semester date presets

## Architecture Notes

### Unix Philosophy Compliance

- Each module has a single responsibility
- Modules are composable and independent
- CLI interface is separate from core logic
- Can be imported as library or used as CLI tool

### Integration with @nbtca/prompt

Export main function for easy integration:

```typescript
import { nbtcal } from '@nbtca/nbtcal';

await nbtcal({
  credentials: { username: '...', password: '...' },
  semester: { academicYear: '2024-2025', semester: '3' },
  semesterStartDate: new Date('2024-09-02'),
  email: 'user@example.com'
});
```

## Debugging Tips

1. **Enable Debug Output**
   - Check console logs for each step
   - Authentication: "Login successful"
   - Navigation: "Ready"
   - Data extraction: "Found X courses"

2. **Generated Files**
   - `test-schedule.ics`: Test output file
   - Can be imported into calendar apps for validation

3. **Common Issues**
   - Login fails: Check credentials, verify WebVPN access
   - No courses extracted: Verify semester selection, check API response
   - Wrong dates: Confirm semester start date
   - Email fails: Check SMTP configuration and credentials

4. **Network Issues**
   - Ensure access to NBT servers
   - Check if WebVPN is accessible
   - Verify no proxy/firewall blocking

## Production Checklist

Current status:

- ✅ Successful login with real credentials
- ✅ Schedule data successfully extracted
- ✅ All course types captured (regular + practice)
- ✅ ICS file generates correctly
- [ ] Calendar import tested in multiple apps
- [ ] Email delivery tested with real SMTP
- [ ] Comprehensive error handling
- [ ] Input validation
- ✅ Security: AES encryption for passwords
- ✅ Documentation complete
- ✅ README with usage examples
- [ ] Package published to npm

## Security Notes

- Credentials are never stored or logged
- SMTP password handled securely
- Use environment variables where possible
- Consider using OAuth for email instead of SMTP passwords
- Add option to save ICS locally instead of email
