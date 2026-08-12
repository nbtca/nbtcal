# @nbtca/nbtcal

Typed ESM library for NBTCA calendar feeds and personal academic timetables.
It handles parsing, recurrence expansion, date queries, heatmaps, and ICS
generation without owning credentials, sessions, files, or UI.

## Install

```bash
npm install @nbtca/nbtcal
```

## Usage

```ts
import { loadCalendar } from '@nbtca/nbtcal';

const calendar = await loadCalendar();
const start = new Date('2026-09-01T00:00:00Z');
const end = new Date('2026-10-01T00:00:00Z');

const upcoming = calendar.upcoming({ days: 30 });
const nextFive = calendar.next(5);
const range = calendar.inRange(start, end);
const dailyCounts = calendar.heatmap({ start, end, bucket: 'day' });
```

Recurring events are expanded within each query window. Heatmaps are dense and
include zero-count day or week buckets. Lower-level feed, parser, query, and ICS
functions are available from the package root.

## Personal timetable

The `@nbtca/nbtcal/timetable` subpath accepts an authenticated transport for the
campus JWXT protocol:

```ts
import {
  createNbtTimetableClient,
  createTimetableSchedule,
  findAcademicTerm,
  timetableToIcs,
} from '@nbtca/nbtcal/timetable';

const client = createNbtTimetableClient(authenticatedTransport, {
  baseUrl: 'https://jwxt-443.webvpn.nbt.edu.cn',
});

const terms = await client.listTerms();
const current = findAcademicTerm(terms);
if (!current) throw new Error('No current academic term');
const timetable = await client.fetchTerm(current);
const schedule = createTimetableSchedule(timetable, { weekOneMonday: '2026-09-07' });
const week = schedule.weekAt(new Date());
const today = schedule.meetingsOnDay(week, schedule.weekdayAt(new Date()));
const nextClass = schedule.next();

const ics = timetableToIcs(timetable, {
  // Confirm this date for the selected term.
  weekOneMonday: '2026-09-07',
});
```

`findAcademicTerm` accepts an opaque `year:code` selector or the `year-1`,
`year-2`, and `year-3` semester aliases.

The host injects an authenticated transport; this package never receives
credentials or a cookie jar. If JWXT omits authoritative calendar dates,
`weekOneMonday` is required. Malformed rows produce structured warnings, and
unresolved practice rows retain only allowlisted, identity-free fields.

## Quality checks

```bash
npm run check
```

## License

MIT
