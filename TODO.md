# TODO

## Immediate Testing Phase

### Run Manual Test
```bash
npx tsx test-manual.ts
```

This will help identify:
- [ ] Does login work?
- [ ] Does navigation to schedule work?
- [ ] What is the actual HTML structure?
- [ ] What semester options are available?
- [ ] Can we extract any course data?

### Based on Test Results

- [ ] Update auth selectors if login fails
- [ ] Update schedule page selectors based on actual HTML
- [ ] Refine course data parser for actual format
- [ ] Fix weekday detection logic
- [ ] Verify time slot mappings

## Core Functionality Refinement

### Scraper Module
- [ ] Update table selectors to match actual page structure
- [ ] Implement proper weekday detection from table columns
- [ ] Refine course text parsing logic
- [ ] Handle edge cases (no location, TBA times, etc.)
- [ ] Add support for lab sessions vs lectures
- [ ] Handle duplicate course entries

### ICS Converter
- [ ] Verify date calculations with real data
- [ ] Add support for recurring exceptions
- [ ] Consider adding alarms/reminders
- [ ] Add course type to event categories
- [ ] Include more metadata in descriptions

### Email Service
- [ ] Support multiple SMTP providers
- [ ] Add OAuth support (Gmail, Outlook)
- [ ] Better error messages for common email issues
- [ ] Option to send to multiple recipients
- [ ] HTML email body with better formatting

## Features to Add

### Must Have
- [ ] Error handling and recovery
- [ ] Input validation
- [ ] Better logging
- [ ] Progress indicators
- [ ] Dry-run mode (don't send email, save to file)

### Nice to Have
- [ ] Config file support (~/.nbtcalrc)
- [ ] Remember last used semester
- [ ] Auto-detect current semester
- [ ] Support for multiple student accounts
- [ ] Export to multiple formats (CSV, JSON)
- [ ] Web UI option

### Future Enhancements
- [ ] Automatic sync (cron job)
- [ ] CalDAV server support
- [ ] Mobile app integration
- [ ] Sharing schedules with classmates
- [ ] Integration with other campus services

## Code Quality

- [ ] Add JSDoc comments
- [ ] Unit tests for parser logic
- [ ] Integration tests for scraper
- [ ] Error handling audit
- [ ] Type safety review
- [ ] Code style consistency

## Documentation

- [ ] API documentation
- [ ] Contributing guide
- [ ] Troubleshooting guide
- [ ] FAQ
- [ ] Screenshots/GIFs for README
- [ ] Video tutorial

## Release Preparation

- [ ] Semantic versioning
- [ ] Changelog
- [ ] License file
- [ ] CI/CD setup
- [ ] npm package metadata
- [ ] GitHub repository setup
- [ ] Issue templates
- [ ] PR templates

## Integration with @nbtca/prompt

- [ ] Define integration interface
- [ ] Export types for prompt tool
- [ ] Add to prompt tool dependencies
- [ ] Create wrapper command in prompt
- [ ] Documentation for prompt users

## Notes

Priority order:
1. Get manual test working
2. Fix scraper based on real page structure
3. Verify ICS output with real data
4. Test email delivery
5. Error handling and polish
6. Integration with prompt tool
