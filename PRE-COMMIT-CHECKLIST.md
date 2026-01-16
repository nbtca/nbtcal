# Pre-Commit Checklist

Before committing to GitHub, verify:

## ✅ Sensitive Information

- [ ] No real passwords in code
- [ ] No real student IDs in code
- [ ] `.env.test` is NOT in git staging area
- [ ] `.env` is NOT in git staging area
- [ ] All example files use placeholder passwords ("your-password")

## ✅ Configuration Files

- [ ] `.gitignore` properly configured
- [ ] `.env.example` has placeholders
- [ ] `.env.test.example` has placeholders
- [ ] `SECURITY.md` is present

## ✅ Code Quality

- [ ] `npm run build` succeeds with no errors
- [ ] No TypeScript errors
- [ ] All imports are correct
- [ ] No debug console.logs in production code

## ✅ Documentation

- [ ] README.md is up to date
- [ ] QUICKSTART.md is accurate
- [ ] DEPLOYMENT.md has instructions
- [ ] SECURITY.md covers sensitive info

## ✅ Test Files

- [ ] `test-full-flow.ts` reads from environment variables
- [ ] `test-email.ts` reads from environment variables
- [ ] No hardcoded credentials in test files

## ✅ Git Status

Run these commands to verify:

```bash
# Check what will be committed
git status

# Verify .env files are NOT staged
git status | grep "\.env"
# Should only show: .env.example and .env.test.example

# Search for sensitive info
grep -r "ming\|3230621134\|ZZHhange" --include="*.md" --include="*.ts" --exclude-dir=node_modules --exclude-dir=dist .
# Should return nothing (or only references in .env files which are ignored)

# Build successfully
npm run build

# Check git diff
git diff --cached
```

## ✅ Final Steps

1. Review all staged files: `git status`
2. Build the project: `npm run build`
3. Commit with clear message
4. Push to GitHub

## Verification Commands

```bash
# List all files to be committed
git diff --cached --name-only

# Verify .env.test is ignored
git check-ignore .env.test
# Should output: .env.test

# Check for sensitive patterns
git diff --cached | grep -i "password\|secret\|key" | grep -v "your-password\|example"
# Should return nothing or only example placeholders
```

## After Push

- [ ] Check GitHub repository - verify no .env files
- [ ] Verify README renders correctly
- [ ] Test clone on another machine
- [ ] Verify builds work: `npm install && npm run build`
