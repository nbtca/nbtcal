# @nbtca/nbtcal — Calendar-Feed Library (Design)

**Date:** 2026-06-17
**Status:** Approved (pending spec review)

## Summary

Pivot `@nbtca/nbtcal` from a campus course-schedule scraper into a focused,
data-only **calendar-feed library**. It fetches the downstream NBTCA ICS feed
(`https://ical.nbtca.space`, exported from the maintainers' Google Calendar),
parses it, handles all the date/timezone/recurrence logic, and returns clean
typed event objects plus aggregated heatmap data.

`@nbtca/prompt` becomes a thin **presentation** consumer: it gathers nbtcal (and
other `@nbtca/*` modules), then focuses purely on the interactive CLI and ASCII
art / TUI experience (a claude-code / codex-like terminal feel). nbtcal never
renders; prompt never parses ICS.

## Architecture

```
Google Calendar (few maintainers)
        │  exported as ICS
        ▼
  ical.nbtca.space            ← downstream ICS feed
        │  fetch
        ▼
  @nbtca/nbtcal  (DATA)       ← fetch + parse + date/recurrence/query + heatmap data
        │  typed events / buckets
        ▼
  @nbtca/prompt  (PRESENTATION)  ← interactive CLI + ASCII art; renders events & heatmap
```

Each module ships as its own npm package (`@nbtca/nbtcal`, `@nbtca/prompt`,
`@nbtca/welcome`, …) and is maintained separately. **No monorepo** — that is a
deliberate choice to keep complexity down.

### Design principles

- **Data only.** No rendering, no formatting, no i18n fallbacks. nbtcal returns
  raw values (including `null`); consumers decide how to display "Untitled" /
  "TBD".
- **Isomorphic.** Only universal APIs — global `fetch` and `ical.js` — so both
  prompt (Node) and `nbtca.space/calendar` (web) can reuse it. No Node-only
  dependencies.
- **Owns all date logic.** Timezones, all-day vs timed events, and **recurrence
  expansion** are nbtcal's job. Consumers never touch raw ICS.
- **Code-first repo.** Keep the codebase lean on prose — no status / quickstart /
  deployment / wiki sprawl. The only persistent markdown is a minimal README,
  this spec, and the orthogonal governance docs. Prefer self-documenting code,
  tests, and small focused modules. "Talk is cheap, show me the code."

## API surface (hybrid: pure functions + thin convenience wrapper)

Low-level pure functions for testability and offline/custom use, plus a
`loadCalendar()` convenience wrapper for ergonomics.

```ts
// feed.ts — network
function fetchFeed(
  url?: string,                                  // default DEFAULT_FEED_URL
  opts?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<string>;                              // raw ICS text

// parse.ts — pure, no network
function parseCalendar(icsText: string): ParsedCalendar;

// query.ts — operate on a ParsedCalendar
//   upcoming({ days }) | next(n) | inRange(start, end) | all()
//   heatmap({ start, end, bucket })

// calendar.ts — convenience
function loadCalendar(
  opts?: { url?: string; timeoutMs?: number; signal?: AbortSignal }
): Promise<Calendar>;                            // fetch + parse, returns queryable object
```

`Calendar` (returned by `loadCalendar`) exposes the query/heatmap methods bound
to the parsed feed:

```ts
interface Calendar {
  upcoming(opts?: { days?: number }): CalendarEvent[]; // default 30 days
  next(n: number): CalendarEvent[];
  inRange(start: Date, end: Date): CalendarEvent[];
  all(): CalendarEvent[];
  heatmap(opts: HeatmapOptions): HeatmapBucket[];
}
```

### Core types

```ts
interface CalendarEvent {
  uid: string;
  title: string | null;
  start: Date;
  end: Date | null;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  recurring: boolean;        // true if expanded from an RRULE instance
}

interface HeatmapOptions {
  start: Date;
  end: Date;
  bucket?: 'day' | 'week';   // default 'day'
}

interface HeatmapBucket {
  date: string;              // ISO 'YYYY-MM-DD' (day, or week-start for 'week')
  count: number;             // events occurring in that bucket
}
```

Notes:
- Events are sorted ascending by `start`.
- Queries that span time (`upcoming`, `inRange`, `heatmap`) **expand recurring
  events** within the requested window.
- `heatmap` output is **dense**: every bucket in `[start, end]` is present,
  including zero-count days, so a consumer can lay out a contiguous grid without
  gap-filling.

### Typed errors

```ts
class FeedFetchError extends Error {}   // network failure or timeout/abort
class FeedParseError extends Error {}   // malformed ICS
```

prompt uses these to show the right hint (e.g. "request timed out" vs "bad
feed").

## Key value over today's prompt code

`prompt/src/features/calendar.ts` currently inlines fetch + parse and:

1. **Drops recurring events** — it reads `event.startDate` once and ignores
   `RRULE`. nbtcal expands recurrence via `ICAL.Event`'s iterator within the
   query window. **This is the central reason to extract the library.**
2. Uses raw `toJSDate()` with no all-day / timezone distinction. nbtcal models
   `isAllDay` and zoned events correctly.
3. Hardcodes a 5s timeout and a single error string. nbtcal gives typed errors
   and configurable timeout.
4. Cannot be tested without network. nbtcal's `parseCalendar(text)` takes raw
   ICS, so tests run against fixtures offline.

## Heatmap (the "impressive" piece)

nbtcal supplies the **data**; prompt supplies the **art**.

- nbtcal: `heatmap({ start, end, bucket })` counts event occurrences
  (recurrence-expanded) per day/week and returns a dense bucket array.
- prompt: renders a GitHub-contributions-style terminal grid — weeks as columns,
  weekdays (Mon–Sun) as rows, intensity mapped to shaded blocks
  (e.g. `·░▒▓█` or chalk color ramps), aligned and legend-labelled.

This keeps all aggregation/date-bucketing in the data layer and all visual
choices in the presentation layer.

## Module layout

```
src/
  index.ts     – public exports
  types.ts     – CalendarEvent, HeatmapBucket, options, typed errors
  feed.ts      – fetchFeed(url?, { timeoutMs, signal }) → raw ICS text
  parse.ts     – parseCalendar(icsText) → ParsedCalendar (recurrence-aware)
  query.ts     – upcoming / next / inRange / all / heatmap
  calendar.ts  – loadCalendar() convenience wrapper
```

`DEFAULT_FEED_URL = 'https://ical.nbtca.space'` lives in `feed.ts` (overridable
for staging/tests).

## What gets removed

Delete from this repo (history remains in git):

- `src/auth`, `src/scraper`, `src/converter`, `src/mailer`, `src/i18n`, `src/cli.ts`
- `api/` (serverless email)
- The `bin` entry / CLI — nbtcal becomes a pure library; prompt is the CLI
- Scraper/SMTP-specific docs: `STATUS.md`, `DEPLOYMENT.md`, `SMTP-EVALUATION.md`,
  `QUICKSTART.md`, `test-email.ts`, `test-full-flow.ts`, and related env examples
- Scraper deps from `package.json`: `axios`, `axios-cookiejar-support`,
  `cheerio`, `crypto-js`, `ics`, `inquirer`, `nodemailer`, `tough-cookie`

Add dependency: `ical.js` (already used by prompt — version-aligned).

Update `package.json`: description, keywords, remove `bin`, bump to **0.2.0**
(breaking pivot).

**Out of scope / left as-is:** the uncommitted calendar-source *governance* docs
(`docs/calendar-maintenance.md`, the issue/discussion templates, README/TODO
governance edits) — orthogonal to this library pivot; they stay.

## Downstream change in @nbtca/prompt (separate repo, follow-up)

Not part of this repo's work, but the intended payoff:
`prompt/src/features/calendar.ts` drops `fetchEvents` and ICS parsing, depends on
`@nbtca/nbtcal`, maps `CalendarEvent[]` through its own i18n fallbacks, and keeps
only `renderEventsTable` + a new heatmap renderer.

## Testing

- TDD against ICS fixtures (no network): a timed event, an all-day event, a
  recurring (`RRULE`) event, an event with `VTIMEZONE`, and a malformed feed.
- `parseCalendar` / `query` / `heatmap` covered with pure unit tests.
- `fetchFeed` covered with an injected/mocked `fetch` (timeout + HTTP error
  paths → `FeedFetchError`).

## Open questions

None blocking. Runtime target assumed isomorphic (Node + browser via universal
APIs); revisit only if a Node-only dependency becomes compelling.
