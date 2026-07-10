# @nbtca/nbtcal

Data-only calendar library for public NBTCA events and personal academic
timetables. It owns parsing, date/timezone logic, typed queries and ICS
generation. Authentication, session persistence, file output and rendering are
the consumer's job (for example, `@nbtca/prompt`).

## Install

```bash
npm install @nbtca/nbtcal
```

## Usage

```ts
import { loadCalendar } from '@nbtca/nbtcal';

const calendar = await loadCalendar();

calendar.upcoming({ days: 30 }); // CalendarEvent[] within the next 30 days
calendar.next(5);                // the next 5 occurrences
calendar.inRange(start, end);    // occurrences in an explicit range
calendar.heatmap({ start, end, bucket: 'day' }); // dense HeatmapBucket[]
```

Recurring events are expanded within each query window. `heatmap` output is
dense — every day (or week) in the range is present, including zero-count
entries — so consumers can render a contiguous grid.

Low-level building blocks (`fetchFeed`, `parseCalendar`, `occurrencesInRange`,
`upcoming`, `next`, `heatmap`) are exported for custom or offline use.

## Personal timetable

The `@nbtca/nbtcal/timetable` subpath understands the NingboTech JWXT timetable
protocol but never receives a student id, password or CookieJar. The host
application injects a narrowly scoped, already-authenticated transport:

```ts
import {
  createNbtTimetableClient,
  timetableToIcs,
} from '@nbtca/nbtcal/timetable';

const client = createNbtTimetableClient(authenticatedTransport, {
  baseUrl: 'https://jwxt-443.webvpn.nbt.edu.cn',
});

const terms = await client.listTerms();
const current = terms.find((term) => term.current)!;
const timetable = await client.fetchTerm(current);

const ics = timetableToIcs(timetable, {
  // Required when JWXT does not return authoritative calendar dates.
  weekOneMonday: 'YYYY-MM-DD', // replace with the confirmed school-calendar date
});
```

`fetchTerms()` is deliberately sequential to avoid unnecessary load on school
systems. Week expressions such as odd/even and discontinuous weeks are expanded
to concrete dates, and the ICS writer emits one `VEVENT` per occurrence. This
avoids ambiguous recurrence rules and gives every occurrence a stable UID that
does not contain student information.

Malformed individual records produce structured warnings instead of silently
disappearing. Practice records without a concrete weekday and period are kept
in `unresolvedItems` as an identity-free allowlist of known fields; the library
never invents all-day events for them. Because the observed `rqazcList` is
empty and its non-empty schema has not been verified, parsed responses never
guess calendar dates—confirm and pass `weekOneMonday` for export. This produces
a base teaching-week schedule only; holidays, make-up classes and temporary
changes still require an authoritative calendar or school notice.

## License

MIT
