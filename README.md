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
