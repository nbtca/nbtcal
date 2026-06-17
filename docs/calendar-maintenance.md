# Calendar source maintenance

NBTCA's public calendar depends on sources that are maintained outside this
package. The package can generate and distribute ICS files, but it cannot decide
which school dates, member dates, or organization events should exist. Those
decisions need a public trail before the data reaches downstream calendar users.

## Goals

- Make each calendar source visible: where it comes from, who maintains it, and
  when it was last checked.
- Discuss uncertain dates in GitHub Discussions before changing distributed
  calendars.
- Track implementation work in issues so the organization Roadmap can show the
  item as `In Progress`.
- Keep private member information out of public threads unless the member has
  explicitly agreed to publish it.

## Sources

### School academic calendar

Use this for the school academic calendar: semester dates, holiday adjustments,
exam weeks, make-up workdays, and teaching-week changes.

Before importing a new academic year, open a discussion with:

- academic year and semester;
- official source link, notice title, or attachment reference;
- expected first teaching day and week numbering;
- known exceptions, such as holiday make-up days;
- affected repositories, usually `nbtca/documents` and `nbtca/nbtcal`.

### Member dates

Use this only for dates that support care, coordination, or consented reminders,
such as birthdays or member-specific milestones.

Do not publish raw member data by default. Public discussions should focus on the
policy, consent model, maintainer, and update cadence. If a date identifies a
person, record it only after consent, and avoid exposing student IDs, phone
numbers, private email addresses, or other unrelated personal data.

### NBTCA events

Use this for association meetings, repair days, workshops, recruitment,
announcements, public deadlines, and other organization milestones.

Event discussions should include the confirmed owner, location or online link,
time zone, recurrence, cancellation policy, and whether the event belongs in the
public subscription calendar.

## Workflow

1. Open a GitHub Discussion under the NBTCA organization or the repository that
   owns the source. Prefer the organization discussion when the decision affects
   more than one repository.
2. Link the discussion to `nbtca/documents` when the source or process needs
   human-readable documentation.
3. Link the discussion to `nbtca/nbtcal` when the source affects generated ICS
   output, defaults, validation, or downstream distribution.
4. Create an actionable issue from the discussion once the next change is clear.
   Add that issue to the organization Roadmap and set its status to
   `In Progress`.
5. Close the loop in the discussion after the calendar source, documentation,
   and generated output are updated.

## Recommended discussion title

```text
[Calendar] Establish public maintenance for NBTCA calendar sources
```

## Initial discussion body

```markdown
NBTCA 的公开日历目前缺少可追踪的上游维护记录。

为了让 `nbtca/documents`、`nbtca/nbtcal` 和其他下游分发使用同一套可信来源，
建议把日程来源维护放到公开讨论中。

需要先确认三类来源：

1. 学校校历：每学年由谁确认、从哪里导入、如何处理节假日调休和教学周变更。
2. 成员重要日期：只在获得同意后记录；公开讨论只讨论机制、维护人和隐私边界。
3. NBTCA 重大事项：维修日、例会、招新、活动、截止日期等需要有负责人和更新规则。

建议执行方式：

- 在本讨论中确认维护范围、负责人和更新节奏。
- 在 `nbtca/documents` 增加日程来源维护流程。
- 在 `nbtca/nbtcal` 增加日历来源维护说明和 issue/discussion 模板。
- 为可执行任务创建 issue，加入组织 Roadmap，并放入 `In Progress`。

这个维护工作不是单纯补日历项，而是建立公开、可复核、尊重隐私的日程来源流程。
```

## Rollout checklist

- Create or reuse a GitHub Discussions category for calendar maintenance.
- If the category slug is `calendar`, use
  `.github/DISCUSSION_TEMPLATE/calendar.yml` from this repository as the
  category form. If the slug is different, copy the same form and rename the
  file to match the category slug.
- Create the initial organization discussion using the body above.
- Create a tracking issue with
  `.github/ISSUE_TEMPLATE/calendar-maintenance.yml`.
- Add the tracking issue to the NBTCA organization Roadmap and set status to
  `In Progress`.
