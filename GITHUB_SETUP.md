# GitHub Repository Setup Guide

## Initial Repository Setup

### 1. Create Repository on GitHub

```bash
# On GitHub:
# - Create new repository: nbtca/nbtcal
# - Description: NBT课表导出工具 - 提取课表并转换为ICS日历格式
# - Public repository (recommended)
# - Do NOT initialize with README (we already have one)
```

### 2. Configure GitHub Secrets

Go to: **Settings → Secrets and variables → Actions → New repository secret**

Add the following secrets:

#### SMTP Configuration (Required for email functionality)

- **Secret name:** `SMTP_HOST`
  - **Value:** Your SMTP server (e.g., `smtp.gmail.com`)

- **Secret name:** `SMTP_PORT`
  - **Value:** `587` (or `465` for SSL)

- **Secret name:** `SMTP_SECURE`
  - **Value:** `false` (or `true` for SSL)

- **Secret name:** `SMTP_USER`
  - **Value:** Your sender email address

- **Secret name:** `SMTP_PASS`
  - **Value:** Your SMTP password (use app-specific password)

#### Test Credentials (Optional - for running automated tests)

- **Secret name:** `TEST_STUDENT_ID`
  - **Value:** Test student ID for automated testing

- **Secret name:** `TEST_PASSWORD`
  - **Value:** Test password for automated testing

### 3. Push to GitHub

```bash
# Add remote
git remote add origin https://github.com/nbtca/nbtcal.git

# Verify remote
git remote -v

# Push to main branch
git push -u origin main
```

### 4. Verify Repository

After pushing, verify on GitHub:

- ✅ Check README.md renders correctly
- ✅ Verify no `.env` or `.env.test` files are visible
- ✅ Confirm all documentation is readable
- ✅ Review file structure

### 5. Enable GitHub Actions (Optional)

If you want to enable automated testing:

1. Rename `.github/workflows/test.yml.example` to `.github/workflows/test.yml`
2. Uncomment the test steps in the workflow file
3. Push the changes
4. Check Actions tab on GitHub

## Security Checklist

Before making the repository public:

- [ ] No real passwords in code
- [ ] No real student IDs in code
- [ ] `.env` files are gitignored
- [ ] Secrets are configured in GitHub
- [ ] SECURITY.md is present
- [ ] All example files use placeholders

## Repository Settings Recommendations

### Branch Protection (Optional)

Settings → Branches → Add branch protection rule

For `main` branch:
- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
- [x] Require conversation resolution before merging

### Security

Settings → Security → Code security and analysis

- [x] Enable Dependabot alerts
- [x] Enable Dependabot security updates
- [x] Enable Secret scanning

## Updating Secrets

To update SMTP configuration later:

1. Go to: Settings → Secrets and variables → Actions
2. Click on the secret name
3. Click "Update secret"
4. Enter new value
5. Save changes

## Testing After Setup

Clone the repository on a different machine and verify:

```bash
# Clone
git clone https://github.com/nbtca/nbtcal.git
cd nbtcal

# Install
npm install

# Build
npm run build

# Should succeed ✅
```

To test with actual credentials:

```bash
# Configure locally
export SMTP_HOST="smtp.example.com"
export SMTP_USER="sender@example.com"
export SMTP_PASS="password"
export TEST_STUDENT_ID="student-id"
export TEST_PASSWORD="password"

# Run tests
npm run test:flow
npm run test:email test@example.com
```

## Maintenance

### Regular Updates

1. Keep dependencies updated:
   ```bash
   npm update
   npm audit fix
   ```

2. Monitor security advisories
3. Update documentation as needed
4. Rotate SMTP passwords periodically

### Monitoring

- Check GitHub Actions for build status
- Review Dependabot alerts
- Monitor issue reports

## Troubleshooting

### Build Fails on GitHub Actions

- Check if secrets are configured correctly
- Verify workflow file syntax
- Review Actions logs for errors

### Others Can't Clone

- Verify repository is public (if intended)
- Check repository permissions
- Ensure no required secrets for basic build

## Support

For issues:
- Open GitHub Issue
- Check documentation in `/docs`
- Review SECURITY.md for security concerns

---

**Repository URL:** https://github.com/nbtca/nbtcal

**Status:** Ready for deployment ✅
