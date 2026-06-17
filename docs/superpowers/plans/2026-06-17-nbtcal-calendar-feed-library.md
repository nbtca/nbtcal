# nbtcal Calendar-Feed Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot `@nbtca/nbtcal` into a data-only, isomorphic library that fetches the `ical.nbtca.space` ICS feed, parses it, owns all date/recurrence logic, and returns typed events plus dense heatmap buckets for `@nbtca/prompt` to render.

**Architecture:** Pure functions (`fetchFeed`, `parseCalendar`, query helpers) with a thin `loadCalendar()` convenience wrapper. No rendering, no Node-only APIs — only global `fetch` and `ical.js`. Recurring events are expanded within each query window; heatmap output is dense (zero-count days included).

**Tech Stack:** TypeScript (ESM, ES2022), `ical.js` for ICS parsing, `vitest` for tests. Node ≥ 20.12.

---

## Deviations from the spec

- **`all()` is dropped (YAGNI).** Infinite recurrence makes an unbounded "all events" ambiguous, and prompt only needs `upcoming` + `heatmap`. The windowed primitives (`upcoming`, `next`, `inRange`, `heatmap`) cover every real consumer. If a bounded "all" is ever needed, it is `inRange(min, max)`.
- **`ical.js` ships no TypeScript types**, so we add a minimal ambient declaration (`src/ical.js.d.ts`) covering only the surface we use.

## File structure

```
src/
  ical.js.d.ts        – minimal ambient types for ical.js (default export)
  types.ts            – CalendarEvent, HeatmapBucket, option types, FeedFetchError, FeedParseError
  parse.ts            – parseCalendar(icsText) → ParsedCalendar
  query.ts            – occurrencesInRange / upcoming / next / heatmap (+ internal expand + toCalendarEvent)
  feed.ts             – fetchFeed(url?, opts) → raw ICS text, DEFAULT_FEED_URL
  calendar.ts         – loadCalendar(opts?) → Calendar (binds parse + query)
  index.ts            – public exports
  __tests__/
    fixtures.ts       – shared ICS fixture strings
```

Test files live next to the unit they test as `*.test.ts` (e.g. `src/query.test.ts`). Build (`tsc`) excludes tests and fixtures; vitest runs them directly.

---

## Task 1: Reset repo and configure tooling

**Files:**
- Delete: `src/auth/`, `src/scraper/`, `src/converter/`, `src/mailer/`, `src/i18n.ts`, `src/cli.ts`, `src/index.ts`, `src/types.ts`, `api/`, `test-email.ts`, `test-full-flow.ts`, `STATUS.md`, `DEPLOYMENT.md`, `DEVELOPMENT.md`, `SMTP-EVALUATION.md`, `QUICKSTART.md`, `GITHUB_SETUP.md`, `PRE-COMMIT-CHECKLIST.md`, `.env.example`, `.env.test.example`, `vercel.json`, `dist/`
- Modify: `package.json`, `tsconfig.json`

- [ ] **Step 1: Delete old source, serverless, scripts, and doc sprawl**

```bash
git rm -r src/auth src/scraper src/converter src/mailer src/i18n.ts src/cli.ts src/index.ts src/types.ts api test-email.ts test-full-flow.ts vercel.json .env.example .env.test.example STATUS.md DEPLOYMENT.md DEVELOPMENT.md SMTP-EVALUATION.md QUICKSTART.md GITHUB_SETUP.md PRE-COMMIT-CHECKLIST.md
rm -rf dist
```

- [ ] **Step 2: Replace `package.json`**

```json
{
  "name": "@nbtca/nbtcal",
  "version": "0.2.0",
  "description": "Data-only calendar library for the NBTCA ICS feed: fetch, parse, recurrence-aware queries, and heatmap buckets.",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "TZ=UTC vitest run",
    "test:watch": "TZ=UTC vitest",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "ics",
    "ical",
    "calendar",
    "nbtca",
    "ningbotech"
  ],
  "author": "",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/nbtca/nbtcal.git"
  },
  "bugs": {
    "url": "https://github.com/nbtca/nbtcal/issues"
  },
  "homepage": "https://github.com/nbtca/nbtcal#readme",
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=20.12.0"
  },
  "dependencies": {
    "ical.js": "^2.2.1"
  },
  "devDependencies": {
    "@types/node": "^22.19.17",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

> Note: `TZ=UTC` in the test scripts makes calendar-day bucketing deterministic across machines. On Windows shells, run `npx cross-env TZ=UTC vitest run` instead.

- [ ] **Step 3: Replace `tsconfig.json`** (add `DOM` lib for `fetch`/`AbortController` types; exclude tests/fixtures from build)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022", "DOM"],
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "src/__tests__"]
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: lockfile updates; `ical.js`, `vitest`, `typescript`, `@types/node` present; no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: reset nbtcal to a data-only calendar-feed library skeleton"
```

---

## Task 2: ical.js type shim and core types

**Files:**
- Create: `src/ical.js.d.ts`
- Create: `src/types.ts`
- Test: `src/types.test.ts`

- [ ] **Step 1: Create the ical.js ambient declaration**

`src/ical.js.d.ts`:

```ts
// Minimal ambient types for the subset of ical.js this library uses.
declare module 'ical.js' {
  export class Time {
    isDate: boolean;
    toJSDate(): Date;
    static fromJSDate(date: Date, useUTC?: boolean): Time;
  }

  export class Event {
    constructor(component: Component);
    uid: string;
    summary: string;
    location: string;
    description: string;
    startDate: Time;
    endDate: Time;
    isRecurring(): boolean;
    iterator(start?: Time): RecurExpansion;
    getOccurrenceDetails(time: Time): { startDate: Time; endDate: Time; item: Event };
  }

  export class RecurExpansion {
    next(): Time | null;
  }

  export class Component {
    constructor(jcal: unknown);
    getAllSubcomponents(name?: string): Component[];
  }

  export function parse(input: string): unknown;

  const ICAL: {
    Time: typeof Time;
    Event: typeof Event;
    Component: typeof Component;
    parse: typeof parse;
  };
  export default ICAL;
}
```

- [ ] **Step 2: Write the failing test**

`src/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FeedFetchError, FeedParseError } from './types.js';

describe('typed errors', () => {
  it('FeedFetchError is an Error with a name', () => {
    const err = new FeedFetchError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FeedFetchError');
    expect(err.message).toBe('boom');
  });

  it('FeedParseError is an Error with a name', () => {
    const err = new FeedParseError('bad ics');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FeedParseError');
    expect(err.message).toBe('bad ics');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/types.test.ts`
Expected: FAIL — cannot find module `./types.js`.

- [ ] **Step 4: Create `src/types.ts`**

```ts
export interface CalendarEvent {
  uid: string;
  title: string | null;
  start: Date;
  end: Date | null;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  recurring: boolean;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface UpcomingOptions {
  days?: number;
}

export interface HeatmapOptions {
  start: Date;
  end: Date;
  bucket?: 'day' | 'week';
}

export interface HeatmapBucket {
  date: string;
  count: number;
}

export class FeedFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FeedFetchError';
  }
}

export class FeedParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FeedParseError';
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/ical.js.d.ts src/types.ts src/types.test.ts
git commit -m "feat: add core types, typed errors, and ical.js type shim"
```

---

## Task 3: Parse the feed

**Files:**
- Create: `src/__tests__/fixtures.ts`
- Create: `src/parse.ts`
- Test: `src/parse.test.ts`

- [ ] **Step 1: Create shared fixtures**

`src/__tests__/fixtures.ts`:

```ts
// A timed event with location + description.
export const TIMED_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//nbtca//test//EN
BEGIN:VEVENT
UID:timed-1
SUMMARY:Repair Day
LOCATION:Lab 301
DESCRIPTION:Bring your laptop
DTSTART:20260620T090000Z
DTEND:20260620T110000Z
END:VEVENT
END:VCALENDAR`;

// An all-day event (VALUE=DATE).
export const ALLDAY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//nbtca//test//EN
BEGIN:VEVENT
UID:allday-1
SUMMARY:Recruitment Week
DTSTART;VALUE=DATE:20260622
DTEND;VALUE=DATE:20260623
END:VEVENT
END:VCALENDAR`;

// A weekly recurring event, 8 occurrences starting 2026-06-01 12:00 UTC.
export const WEEKLY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//nbtca//test//EN
BEGIN:VEVENT
UID:weekly-1
SUMMARY:Weekly Meeting
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
RRULE:FREQ=WEEKLY;COUNT=8
END:VEVENT
END:VCALENDAR`;

// Two timed events plus the weekly one, for query/heatmap tests.
export const MIXED_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//nbtca//test//EN
BEGIN:VEVENT
UID:timed-1
SUMMARY:Repair Day
LOCATION:Lab 301
DTSTART:20260620T090000Z
DTEND:20260620T110000Z
END:VEVENT
BEGIN:VEVENT
UID:timed-2
SUMMARY:Workshop
DTSTART:20260620T140000Z
DTEND:20260620T160000Z
END:VEVENT
BEGIN:VEVENT
UID:weekly-1
SUMMARY:Weekly Meeting
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
RRULE:FREQ=WEEKLY;COUNT=8
END:VEVENT
END:VCALENDAR`;

export const MALFORMED_ICS = `this is not a calendar`;
```

- [ ] **Step 2: Write the failing test**

`src/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCalendar } from './parse.js';
import { FeedParseError } from './types.js';
import { TIMED_ICS, MIXED_ICS, MALFORMED_ICS } from './__tests__/fixtures.js';

describe('parseCalendar', () => {
  it('returns one vevent for a single-event feed', () => {
    const parsed = parseCalendar(TIMED_ICS);
    expect(parsed.vevents).toHaveLength(1);
    expect(parsed.vevents[0].uid).toBe('timed-1');
  });

  it('returns all vevents for a multi-event feed', () => {
    const parsed = parseCalendar(MIXED_ICS);
    expect(parsed.vevents.map((e) => e.uid).sort()).toEqual(['timed-1', 'timed-2', 'weekly-1']);
  });

  it('throws FeedParseError on malformed input', () => {
    expect(() => parseCalendar(MALFORMED_ICS)).toThrow(FeedParseError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/parse.test.ts`
Expected: FAIL — cannot find module `./parse.js`.

- [ ] **Step 4: Create `src/parse.ts`**

```ts
import ICAL from 'ical.js';
import { FeedParseError } from './types.js';

export interface ParsedCalendar {
  vevents: ICAL.Event[];
}

export function parseCalendar(icsText: string): ParsedCalendar {
  let component: ICAL.Component;
  try {
    const jcal = ICAL.parse(icsText);
    component = new ICAL.Component(jcal);
  } catch (err) {
    throw new FeedParseError('Failed to parse ICS feed', { cause: err });
  }

  const subcomponents = component.getAllSubcomponents('vevent');
  if (subcomponents.length === 0 && !looksLikeCalendar(icsText)) {
    throw new FeedParseError('Input does not contain a VCALENDAR');
  }

  const vevents = subcomponents.map((c) => new ICAL.Event(c));
  return { vevents };
}

function looksLikeCalendar(text: string): boolean {
  return text.includes('BEGIN:VCALENDAR');
}
```

> Rationale: `ICAL.parse` is lenient and does not always throw on junk; the `looksLikeCalendar` guard turns "parsed but not a calendar" into a `FeedParseError`. An empty-but-valid VCALENDAR (no events) is allowed and yields `vevents: []`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/parse.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/fixtures.ts src/parse.ts src/parse.test.ts
git commit -m "feat: parse ICS feeds into vevents with FeedParseError handling"
```

---

## Task 4: Occurrence expansion (the core date logic)

**Files:**
- Create: `src/query.ts`
- Test: `src/query.test.ts`

- [ ] **Step 1: Write the failing test**

`src/query.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCalendar } from './parse.js';
import { occurrencesInRange } from './query.js';
import { TIMED_ICS, ALLDAY_ICS, WEEKLY_ICS } from './__tests__/fixtures.js';

const D = (iso: string) => new Date(iso);

describe('occurrencesInRange', () => {
  it('maps a timed event to a CalendarEvent', () => {
    const parsed = parseCalendar(TIMED_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-30T00:00:00Z'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      uid: 'timed-1',
      title: 'Repair Day',
      location: 'Lab 301',
      description: 'Bring your laptop',
      isAllDay: false,
      recurring: false,
    });
    expect(events[0].start.toISOString()).toBe('2026-06-20T09:00:00.000Z');
    expect(events[0].end?.toISOString()).toBe('2026-06-20T11:00:00.000Z');
  });

  it('flags all-day events', () => {
    const parsed = parseCalendar(ALLDAY_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-30T00:00:00Z'));
    expect(events).toHaveLength(1);
    expect(events[0].isAllDay).toBe(true);
    expect(events[0].title).toBe('Recruitment Week');
    expect(events[0].location).toBeNull();
  });

  it('excludes events outside the range', () => {
    const parsed = parseCalendar(TIMED_ICS);
    const events = occurrencesInRange(parsed, D('2026-07-01T00:00:00Z'), D('2026-07-31T00:00:00Z'));
    expect(events).toHaveLength(0);
  });

  it('expands a weekly recurring event within the window', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    // 8 weekly occurrences from 2026-06-01; window covers the first 3.
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-06-16T00:00:00Z'));
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.recurring)).toBe(true);
    expect(events.map((e) => e.start.toISOString())).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-06-08T12:00:00.000Z',
      '2026-06-15T12:00:00.000Z',
    ]);
  });

  it('returns occurrences sorted ascending by start', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = occurrencesInRange(parsed, D('2026-06-01T00:00:00Z'), D('2026-08-01T00:00:00Z'));
    const times = events.map((e) => e.start.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/query.test.ts`
Expected: FAIL — cannot find module `./query.js`.

- [ ] **Step 3: Create `src/query.ts` with occurrence expansion**

```ts
import ICAL from 'ical.js';
import type { ParsedCalendar } from './parse.js';
import type { CalendarEvent } from './types.js';

function toCalendarEvent(
  event: ICAL.Event,
  startTime: ICAL.Time,
  endTime: ICAL.Time | null,
  recurring: boolean,
): CalendarEvent {
  return {
    uid: event.uid,
    title: event.summary || null,
    start: startTime.toJSDate(),
    end: endTime ? endTime.toJSDate() : null,
    isAllDay: Boolean(startTime.isDate),
    location: event.location || null,
    description: event.description || null,
    recurring,
  };
}

function expand(event: ICAL.Event, start: Date, end: Date): CalendarEvent[] {
  if (!event.isRecurring()) {
    const occStart = event.startDate.toJSDate();
    if (occStart >= start && occStart <= end) {
      return [toCalendarEvent(event, event.startDate, event.endDate, false)];
    }
    return [];
  }

  const out: CalendarEvent[] = [];
  const iterator = event.iterator(ICAL.Time.fromJSDate(start, false));
  let next: ICAL.Time | null;
  while ((next = iterator.next())) {
    const occStart = next.toJSDate();
    if (occStart > end) break;
    if (occStart < start) continue;
    const details = event.getOccurrenceDetails(next);
    out.push(toCalendarEvent(event, details.startDate, details.endDate, true));
  }
  return out;
}

export function occurrencesInRange(parsed: ParsedCalendar, start: Date, end: Date): CalendarEvent[] {
  const events = parsed.vevents.flatMap((e) => expand(e, start, end));
  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return events;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/query.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/query.ts src/query.test.ts
git commit -m "feat: expand events (incl. recurrence) within a date range"
```

---

## Task 5: upcoming and next queries

**Files:**
- Modify: `src/query.ts`
- Test: `src/query.upcoming.test.ts`

- [ ] **Step 1: Write the failing test**

`src/query.upcoming.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCalendar } from './parse.js';
import { upcoming, next } from './query.js';
import { WEEKLY_ICS } from './__tests__/fixtures.js';

beforeEach(() => {
  vi.useFakeTimers();
  // Pretend "now" is just before the first weekly occurrence.
  vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('upcoming', () => {
  it('returns occurrences within the default 30-day window', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = upcoming(parsed);
    // 2026-06-01..2026-07-01 covers occurrences on 06-01,08,15,22,29 = 5.
    expect(events).toHaveLength(5);
  });

  it('respects a custom day count', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = upcoming(parsed, { days: 14 });
    // 2026-06-01..2026-06-15 covers 06-01, 06-08, 06-15 = 3.
    expect(events).toHaveLength(3);
  });
});

describe('next', () => {
  it('returns the next N occurrences', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = next(parsed, 2);
    expect(events.map((e) => e.start.toISOString())).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-06-08T12:00:00.000Z',
    ]);
  });

  it('returns fewer than N when not enough remain', () => {
    const parsed = parseCalendar(WEEKLY_ICS);
    const events = next(parsed, 100);
    expect(events).toHaveLength(8); // RRULE COUNT=8
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/query.upcoming.test.ts`
Expected: FAIL — `upcoming`/`next` are not exported.

- [ ] **Step 3: Append to `src/query.ts`**

```ts
import type { UpcomingOptions } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NEXT_HORIZON_DAYS = 365;

export function upcoming(parsed: ParsedCalendar, options: UpcomingOptions = {}): CalendarEvent[] {
  const days = options.days ?? 30;
  const now = new Date();
  const end = new Date(now.getTime() + days * DAY_MS);
  return occurrencesInRange(parsed, now, end);
}

export function next(parsed: ParsedCalendar, count: number): CalendarEvent[] {
  const now = new Date();
  const horizon = new Date(now.getTime() + NEXT_HORIZON_DAYS * DAY_MS);
  return occurrencesInRange(parsed, now, horizon).slice(0, count);
}
```

> `next` looks ahead at most one year; a recurring event with no `COUNT`/`UNTIL` is therefore bounded. This is sufficient for prompt's "what's coming up" use.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/query.upcoming.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/query.ts src/query.upcoming.test.ts
git commit -m "feat: add upcoming() and next() queries"
```

---

## Task 6: Heatmap buckets

**Files:**
- Modify: `src/query.ts`
- Test: `src/heatmap.test.ts`

- [ ] **Step 1: Write the failing test**

`src/heatmap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCalendar } from './parse.js';
import { heatmap } from './query.js';
import { MIXED_ICS } from './__tests__/fixtures.js';

const D = (iso: string) => new Date(iso);

describe('heatmap (day buckets)', () => {
  it('is dense: every day in range is present, including zeros', () => {
    const parsed = parseCalendar(MIXED_ICS);
    const buckets = heatmap(parsed, { start: D('2026-06-19T00:00:00Z'), end: D('2026-06-21T00:00:00Z') });
    expect(buckets.map((b) => b.date)).toEqual(['2026-06-19', '2026-06-20', '2026-06-21']);
  });

  it('counts multiple events on the same day', () => {
    const parsed = parseCalendar(MIXED_ICS);
    const buckets = heatmap(parsed, { start: D('2026-06-19T00:00:00Z'), end: D('2026-06-21T00:00:00Z') });
    const byDate = Object.fromEntries(buckets.map((b) => [b.date, b.count]));
    // timed-1 (09:00) and timed-2 (14:00) both on 06-20.
    expect(byDate['2026-06-20']).toBe(2);
    expect(byDate['2026-06-19']).toBe(0);
    expect(byDate['2026-06-21']).toBe(0);
  });

  it('counts recurring occurrences', () => {
    const parsed = parseCalendar(MIXED_ICS);
    // 2026-06-08 is a weekly-meeting occurrence and nothing else.
    const buckets = heatmap(parsed, { start: D('2026-06-08T00:00:00Z'), end: D('2026-06-08T00:00:00Z') });
    expect(buckets).toEqual([{ date: '2026-06-08', count: 1 }]);
  });
});

describe('heatmap (week buckets)', () => {
  it('buckets by ISO week start (Monday) and is dense', () => {
    const parsed = parseCalendar(MIXED_ICS);
    const buckets = heatmap(parsed, {
      start: D('2026-06-01T00:00:00Z'),
      end: D('2026-06-21T00:00:00Z'),
      bucket: 'week',
    });
    // Weeks starting Mon 06-01, 06-08, 06-15.
    expect(buckets.map((b) => b.date)).toEqual(['2026-06-01', '2026-06-08', '2026-06-15']);
    const byDate = Object.fromEntries(buckets.map((b) => [b.date, b.count]));
    // Week of 06-15 contains timed-1, timed-2 (06-20) and the weekly meeting (06-15) = 3.
    expect(byDate['2026-06-15']).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/heatmap.test.ts`
Expected: FAIL — `heatmap` is not exported.

- [ ] **Step 3: Append heatmap logic to `src/query.ts`**

```ts
import type { HeatmapOptions, HeatmapBucket } from './types.js';

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

export function heatmap(parsed: ParsedCalendar, options: HeatmapOptions): HeatmapBucket[] {
  const bucket = options.bucket ?? 'day';
  const events = occurrencesInRange(parsed, options.start, options.end);

  const counts = new Map<string, number>();
  for (const event of events) {
    const key = bucket === 'week' ? dateKey(startOfWeek(event.start)) : dateKey(startOfDay(event.start));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const buckets: HeatmapBucket[] = [];
  const stepStart = bucket === 'week' ? startOfWeek(options.start) : startOfDay(options.start);
  const cursor = new Date(stepStart);
  const last = startOfDay(options.end);
  while (cursor <= last) {
    const key = dateKey(cursor);
    buckets.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + (bucket === 'week' ? 7 : 1));
  }
  return buckets;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/heatmap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/query.ts src/heatmap.test.ts
git commit -m "feat: add dense day/week heatmap buckets"
```

---

## Task 7: Fetch the feed

**Files:**
- Create: `src/feed.ts`
- Test: `src/feed.test.ts`

- [ ] **Step 1: Write the failing test**

`src/feed.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFeed, DEFAULT_FEED_URL } from './feed.js';
import { FeedFetchError } from './types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchFeed', () => {
  it('returns the response text on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('BEGIN:VCALENDAR', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const text = await fetchFeed();
    expect(text).toBe('BEGIN:VCALENDAR');
    expect(fetchMock).toHaveBeenCalledWith(DEFAULT_FEED_URL, expect.any(Object));
  });

  it('fetches a custom url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('X', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchFeed('https://example.com/cal.ics');
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/cal.ics', expect.any(Object));
  });

  it('throws FeedFetchError on non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    await expect(fetchFeed()).rejects.toBeInstanceOf(FeedFetchError);
  });

  it('throws FeedFetchError when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(fetchFeed()).rejects.toBeInstanceOf(FeedFetchError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/feed.test.ts`
Expected: FAIL — cannot find module `./feed.js`.

- [ ] **Step 3: Create `src/feed.ts`**

```ts
import { FeedFetchError } from './types.js';

export const DEFAULT_FEED_URL = 'https://ical.nbtca.space';

export interface FetchFeedOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function fetchFeed(
  url: string = DEFAULT_FEED_URL,
  options: FetchFeedOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new FeedFetchError(`Feed request failed: HTTP ${response.status}`);
    }
    return await response.text();
  } catch (err) {
    if (err instanceof FeedFetchError) throw err;
    const reason = err instanceof Error && err.name === 'AbortError' ? 'request timed out' : String(err);
    throw new FeedFetchError(`Failed to fetch feed: ${reason}`, { cause: err });
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/feed.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/feed.ts src/feed.test.ts
git commit -m "feat: add fetchFeed with timeout and FeedFetchError handling"
```

---

## Task 8: loadCalendar wrapper and public exports

**Files:**
- Create: `src/calendar.ts`
- Create: `src/index.ts`
- Test: `src/calendar.test.ts`

- [ ] **Step 1: Write the failing test**

`src/calendar.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadCalendar } from './calendar.js';
import { MIXED_ICS } from './__tests__/fixtures.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadCalendar', () => {
  it('fetches, parses, and exposes query methods', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(MIXED_ICS, { status: 200 })));

    const calendar = await loadCalendar();
    const events = calendar.inRange(new Date('2026-06-20T00:00:00Z'), new Date('2026-06-21T00:00:00Z'));
    expect(events.map((e) => e.uid).sort()).toEqual(['timed-1', 'timed-2']);

    const buckets = calendar.heatmap({
      start: new Date('2026-06-20T00:00:00Z'),
      end: new Date('2026-06-20T00:00:00Z'),
    });
    expect(buckets).toEqual([{ date: '2026-06-20', count: 2 }]);
  });

  it('passes a custom url through to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(MIXED_ICS, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await loadCalendar({ url: 'https://example.com/cal.ics' });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/cal.ics', expect.any(Object));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calendar.test.ts`
Expected: FAIL — cannot find module `./calendar.js`.

- [ ] **Step 3: Create `src/calendar.ts`**

```ts
import { fetchFeed, type FetchFeedOptions } from './feed.js';
import { parseCalendar, type ParsedCalendar } from './parse.js';
import { occurrencesInRange, upcoming, next, heatmap } from './query.js';
import type { CalendarEvent, UpcomingOptions, HeatmapOptions, HeatmapBucket } from './types.js';

export interface Calendar {
  upcoming(options?: UpcomingOptions): CalendarEvent[];
  next(count: number): CalendarEvent[];
  inRange(start: Date, end: Date): CalendarEvent[];
  heatmap(options: HeatmapOptions): HeatmapBucket[];
}

export interface LoadCalendarOptions extends FetchFeedOptions {
  url?: string;
}

export function createCalendar(parsed: ParsedCalendar): Calendar {
  return {
    upcoming: (options) => upcoming(parsed, options),
    next: (count) => next(parsed, count),
    inRange: (start, end) => occurrencesInRange(parsed, start, end),
    heatmap: (options) => heatmap(parsed, options),
  };
}

export async function loadCalendar(options: LoadCalendarOptions = {}): Promise<Calendar> {
  const { url, ...fetchOptions } = options;
  const text = await fetchFeed(url, fetchOptions);
  return createCalendar(parseCalendar(text));
}
```

- [ ] **Step 4: Create `src/index.ts`**

```ts
export { loadCalendar, createCalendar } from './calendar.js';
export type { Calendar, LoadCalendarOptions } from './calendar.js';
export { fetchFeed, DEFAULT_FEED_URL } from './feed.js';
export type { FetchFeedOptions } from './feed.js';
export { parseCalendar } from './parse.js';
export type { ParsedCalendar } from './parse.js';
export { occurrencesInRange, upcoming, next, heatmap } from './query.js';
export type {
  CalendarEvent,
  DateRange,
  UpcomingOptions,
  HeatmapOptions,
  HeatmapBucket,
} from './types.js';
export { FeedFetchError, FeedParseError } from './types.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/calendar.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/calendar.ts src/index.ts src/calendar.test.ts
git commit -m "feat: add loadCalendar wrapper and public exports"
```

---

## Task 9: Full verification, build, and minimal README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass (types, parse, query, query.upcoming, heatmap, feed, calendar).

- [ ] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: no errors; `dist/index.js` and `dist/index.d.ts` produced. No `*.test.*` or `__tests__` files in `dist/`.

- [ ] **Step 3: Replace `README.md` with a lean, code-first README**

```markdown
# @nbtca/nbtcal

Data-only calendar library for the NBTCA ICS feed (`ical.nbtca.space`, exported
from the maintainers' Google Calendar). Fetches and parses the feed, owns all
date/timezone/recurrence logic, and returns typed events plus heatmap buckets.
Rendering is the consumer's job (e.g. `@nbtca/prompt`).

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

## License

MIT
```

- [ ] **Step 4: Final full-suite run after README change**

Run: `npm test`
Expected: all suites still pass.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for the calendar-feed library"
```

---

## Self-review notes

- **Spec coverage:** data-only API (Tasks 4–8), isomorphic/universal `fetch` (Task 7), recurrence expansion (Task 4), typed errors (Tasks 2, 7), heatmap dense buckets (Task 6), old-code deletion + 0.2.0 + `ical.js` (Task 1), code-first minimal docs (Task 9 lean README). `all()` intentionally cut (see Deviations).
- **Type consistency:** `ParsedCalendar.vevents`, `CalendarEvent`, `HeatmapBucket`, `HeatmapOptions`, `UpcomingOptions`, `FetchFeedOptions`, `Calendar` names are used identically across parse/query/feed/calendar/index.
- **Governance docs** (`docs/calendar-maintenance.md`, templates, README/TODO governance edits) are untouched and out of scope.
