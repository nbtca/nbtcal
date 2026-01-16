# Deployment Guide

## SMTP Email Configuration

### SMTP Configuration

Configure SMTP credentials for sending course schedules via email.

### For Production Deployment

Update the SMTP configuration with your email service:

#### Option 1: GitHub Secrets (Recommended)

In your GitHub repository, go to Settings → Secrets and variables → Actions, add:

- `SMTP_HOST` = `smtp.example.com`
- `SMTP_PORT` = `587`
- `SMTP_SECURE` = `false`
- `SMTP_USER` = `sender@example.com`
- `SMTP_PASS` = `your-smtp-password`

#### Option 2: Environment Variables

```bash
export SMTP_HOST="smtp.example.com"
export SMTP_PORT="587"
export SMTP_SECURE="false"
export SMTP_USER="sender@example.com"
export SMTP_PASS="your-smtp-password"
```

#### Option 2: .env File

```bash
cp .env.example .env
nano .env  # Edit with production settings
```

**Important:** Never commit `.env` files with real credentials to git!

### Email Server Requirements

Your SMTP server should support:
- SMTP authentication
- Either STARTTLS (port 587) or SSL/TLS (port 465)
- Sending to external email addresses

### Testing Email Delivery

1. Set up SMTP configuration
2. Build the project: `npm run build`
3. Generate test schedule: `npx tsx test-full-flow.ts`
4. Test email: `npx tsx test-email.ts your-email@example.com`

Expected output:
```
Email Delivery Test
===================

✓ Found test-schedule.ics (52544 bytes)

Sending to: your-email@example.com
From: sender@example.com
SMTP Server: smtp.example.com:587

Sending email...
Email sent successfully to your-email@example.com

✓ Email sent successfully!
```

## Security Considerations

### Environment Variables

For production, use:
- System environment variables
- Docker secrets
- Kubernetes secrets
- CI/CD secret management

Never hardcode credentials in source code!

### Email Security

1. **Use app-specific passwords** for Gmail/Outlook
2. **Enable 2FA** on email accounts
3. **Restrict SMTP access** to specific IPs if possible
4. **Use strong passwords** for SMTP authentication
5. **Monitor email sending** for abuse

### Firewall Configuration

Ensure outbound access to SMTP server:
- Port 587 (STARTTLS) - Recommended
- Port 465 (SSL/TLS)
- Port 25 (Unencrypted) - Not recommended

## Deployment Scenarios

### Scenario 1: Shared Server

```bash
# Add to /etc/environment or ~/.bashrc
export SMTP_HOST="mail.nbtca.org"
export SMTP_USER="noreply@nbtca.org"
export SMTP_PASS="secure-password"

# Install globally
npm install -g @nbtca/nbtcal

# Users run
nbtcal
```

### Scenario 2: Docker Container

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY . .
RUN npm install && npm run build

ENV SMTP_HOST=mail.nbtca.org
ENV SMTP_PORT=587
ENV SMTP_USER=noreply@nbtca.org
# Use Docker secrets for password
# ENV SMTP_PASS will be set at runtime

CMD ["node", "dist/cli.js"]
```

Run with:
```bash
docker run -e SMTP_PASS="secure-password" nbtca/nbtcal
```

### Scenario 3: Web Service

Create a simple API wrapper:

```typescript
import express from 'express';
import { nbtcal } from '@nbtca/nbtcal';

const app = express();
app.use(express.json());

app.post('/api/schedule', async (req, res) => {
  try {
    const { studentId, password, email } = req.body;

    await nbtcal({
      credentials: {
        username: studentId,
        password: password
      },
      semesterStartDate: new Date('2025-02-24'),
      email: email
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

## Monitoring and Maintenance

### Logging

The application logs:
- Authentication attempts
- Schedule extraction results
- Email sending status

Consider setting up:
- Log aggregation (ELK, Splunk)
- Error tracking (Sentry)
- Uptime monitoring

### Email Delivery Monitoring

Monitor for:
- Failed sends (SMTP errors)
- Bounce rates
- Spam complaints
- Daily/monthly sending limits

### Updates

Keep dependencies updated:
```bash
npm update
npm audit fix
```

## Troubleshooting

### Email Not Sending

1. Check SMTP credentials
2. Verify SMTP server is accessible
3. Check firewall rules
4. Test with different ports (587, 465, 25)
5. Check email server logs

### Authentication Failures

1. Verify NBT credentials
2. Check WebVPN accessibility
3. Review auth error messages
4. Check if password encryption still matches

### ICS File Issues

1. Verify semester start date
2. Check time slot mappings
3. Validate ICS format
4. Test import in multiple calendar apps

## Support

For issues or questions:
- Review logs
- Check [DEVELOPMENT.md](./DEVELOPMENT.md)
- See [README.md](./README.md)
- See: SECURITY.md for reporting security issues
