# Security Policy

## Data boundary

`@nbtca/nbtcal` is a data-only library. It does not accept or store student
credentials, cookies, verification codes, email configuration or session
files. The private timetable API accepts only an authenticated transport
provided by its host application.

The host application is responsible for:

- collecting credentials without command-line arguments or terminal echo;
- restricting the transport to the intended school hosts and read-only routes;
- storing bearer sessions with appropriate platform permissions;
- clearing sessions on logout or expiry;
- writing the generated ICS file to a user-selected location.

## Privacy guarantees

- Timetable parsing uses an explicit field allowlist and discards the `xsxx`
  student-information object.
- Unknown practice rows are reduced to a small identity-free field allowlist;
  the original object is never retained or returned.
- ICS UIDs are deterministic hashes of teaching-class and occurrence data; they
  do not contain a student id.
- Public errors never include response bodies, request forms, cookies or remote
  error objects.
- Tests and fixtures must be synthetic or fully anonymized. Real credentials and
  raw student responses must never be committed or used in public CI.

## Integration testing

Live school-system tests must be opt-in and run locally with an account whose
owner has authorized the test. Credentials must be entered interactively, kept
only in process memory and excluded from logs, environment variables, command
arguments and files.

## Reporting vulnerabilities

Report vulnerabilities through
[GitHub Security Advisories](https://github.com/nbtca/nbtcal/security/advisories/new).
Do not publish credential, session or timetable material in a public issue.
