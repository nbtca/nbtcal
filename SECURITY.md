# Security Policy

## Sensitive Information

This project requires configuration of sensitive information:

### Never Commit These Files

- `.env` - Production environment variables
- `.env.test` - Test environment variables containing real credentials
- Any files containing real passwords or API keys

### Use Example Files Instead

- `.env.example` - Template for SMTP configuration
- `.env.test.example` - Template for test credentials

Copy example files and fill in your own credentials locally.

## Credentials Required

### For Testing

Set environment variables:
```bash
export TEST_STUDENT_ID="your-student-id"
export TEST_PASSWORD="your-password"
export SMTP_HOST="your-smtp-host"
export SMTP_USER="your-email"
export SMTP_PASS="your-password"
```

Or create `.env.test` from `.env.test.example`.

### For Production

Configure SMTP via:
- Environment variables (recommended)
- `.env` file (copy from `.env.example`)

## Reporting Security Issues

If you discover a security vulnerability, please report it through GitHub Security Advisories:

https://github.com/nbtca/nbtcal/security/advisories/new

Do not open public issues for security vulnerabilities.

## Best Practices

1. **Never hardcode credentials** in source code
2. **Use app-specific passwords** for email services
3. **Enable 2FA** on all accounts
4. **Rotate passwords** regularly
5. **Review commits** before pushing to ensure no sensitive data
6. **Use `.gitignore`** to exclude sensitive files

## Password Requirements

- SMTP passwords should be app-specific passwords, not account passwords
- Use strong, unique passwords for each service
- Store passwords securely (password manager recommended)

## Encryption

- Student passwords are encrypted with AES-CBC before transmission
- Credentials are never logged or stored permanently
- All communication with NBT servers uses HTTPS

## GitHub Secrets

For CI/CD and GitHub Actions, configure secrets in repository settings:

Settings → Secrets and variables → Actions

Required secrets:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

## Contact

For security concerns: Use GitHub Security Advisories
