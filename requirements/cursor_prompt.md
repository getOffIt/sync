# Next.js 15 Outlook ICS → Google Calendar Sync App

You are building a production-ready **Next.js 15 (App Router) + TypeScript** app with **Tailwind CSS** and **Prisma (SQLite)**. The app mirrors an **Office 365 published ICS feed** into a **Google Calendar**:

## Goals & behavior

- Manual **“Sync now”** button on a dashboard page.
- **Scheduled daily** sync (once a day), with instructions for:
  - **Vercel** (Scheduled Functions / Cron hitting our API route), and
  - **Self-hosted** (node-cron).
- ICS → Google Calendar **one-way mirror**:
  - Create events for new ICS VEVENTs.
  - Update when title/description/location/time changes.
  - Delete from Google if removed from ICS.
- **Filters**:
  - Skip events marked **free/transparent** (`TRANSP:TRANSPARENT` or `X-MICROSOFT-CDO-BUSYSTATUS:FREE`).
  - If ICS contains attendee data and we know `MY_EMAIL`, **skip events I declined** (`PARTSTAT=DECLINED`).
- Store mapping in DB: `uid ↔ googleEventId` plus a **fingerprint** hash of important fields to detect changes.
- **Config via .env**; do not hardcode secrets.
- Nice, minimalist Tailwind UI: a card with:
  - ICS URL & target Google calendar ID (read-only display from env)
  - Last sync time + last status
  - A “Sync now” button (POSTs to `/api/sync`)
  - Table of last 20 changes (created/updated/deleted)
- Code quality: clean, typed, small modules.

## Tech choices

- **Next.js 15** (App Router, `app/`).
- **Tailwind CSS** for styling.
- **Prisma** with **SQLite** (suitable local; easy to swap).
- **node-ical** for ICS parsing.
- **googleapis** for Google Calendar.
- OAuth2:
  - Implement a simple in-app **OAuth flow** for Google with `offline` access to obtain and **store refresh token** in DB.
  - Provide routes `/api/google/oauth/initiate` and `/api/google/oauth/callback`.
  - Calendar scope: `https://www.googleapis.com/auth/calendar`.
  - Use a **single user** (me) auth model for now; store tokens in one row table.
- Timezone: default Europe/Paris (for logging/UI); do not force/conflate event times (honor ICS timezone).

## Environment variables (.env.local)

```
NEXT_PUBLIC_APP_NAME="Outlook ICS → Google Sync"
ICS_URL="webcal://outlook.office365.com/.../calendar.ics"
GOOGLE_CALENDAR_ID="your@gmail.com"               # or secondary calendar id
MY_EMAIL="your.email@company.com"           # optional, for decline filter
SKIP_EVENT_TITLES="Team Standup,Weekly Review"  # comma-separated list of event titles to skip

GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="http://localhost:4001/api/google/oauth/callback"
# If deploying to Vercel, set to your prod URL
# GOOGLE_REDIRECT_URI="https://yourapp.vercel.app/api/google/oauth/callback"
```

## Data model (Prisma)

Create a Prisma schema with:

- `Mapping`:
  - `uid` (String, id)
  - `googleEventId` (String)
  - `fingerprint` (String)
  - `createdAt` / `updatedAt`
- `Token`: (single row; use `singleton` boolean or fixed id)
  - `id` (Int, id)
  - `accessToken` (String)
  - `refreshToken` (String)
  - `expiryDate` (DateTime)
  - `scopes` (String) // optional
  - `createdAt` / `updatedAt`
- `SyncLog`:
  - `id` (Int, id)
  - `startedAt` (DateTime)
  - `finishedAt` (DateTime)
  - `status` (enum: SUCCESS | ERROR | PARTIAL)
  - `summary` (String)
  - `created` (Int)
  - `updated` (Int)
  - `deleted` (Int)
  - `errors` (Json) // array of strings or objects

## File structure

```
/app
  /api
    /sync/route.ts
    /status/route.ts
    /google
      /oauth
        /initiate/route.ts
        /callback/route.ts
  /page.tsx
  /styles/globals.css
/lib
  db.ts
  google.ts
  ics.ts
  sync.ts
  fingerprint.ts
/components
  SyncCard.tsx
  ChangesTable.tsx
/prisma
  schema.prisma
tailwind.config.ts
postcss.config.js
package.json
```

## Dependencies

Add:
- `node-ical`
- `googleapis`
- `prisma` + `@prisma/client`
- `zod` (validation)
- `date-fns` (formatting, parsing)
- `@tailwindcss/forms`

## Implementation details

### Fingerprint

Hash (SHA-256) of relevant VEVENT fields:
- `uid`, `summary`, `location`, `description`, `dtstart`, `dtend`, `transp`, `status`, `sequence`, `last-modified`
- Emit a stable, JSON-stringified object and hash it.

### ICS parsing rules

- Convert `webcal://` → `https://` before fetch.
- Use `node-ical` to parse; iterate only `VEVENT`.
- Skip events without a `UID`.
- **Free/transparent** check:
  - `vevent.transparency === 'TRANSPARENT'` OR
  - `vevent['x-microsoft-cdo-busystatus'] === 'FREE'` (case-insensitive)
- **Declined-by-me** check (only if `MY_EMAIL` set *and* ICS provides attendees):
  - Iterate attendees; if attendee email equals `MY_EMAIL` and `params.PARTSTAT === 'DECLINED'`, skip.

### Google event body mapping

- All-day vs timed:
  - If ICS uses date-only, use Google’s `{ date: 'YYYY-MM-DD' }`.
  - Otherwise use `{ dateTime: ISO }`.
- Fields:
  - `summary`, `location`, `description`
  - `start`, `end`
  - `transparency` = `'transparent'` when ICS transparent, else `'opaque'`.

### Sync algorithm

1. Fetch & parse ICS.
2. Build `currentUIDs` and `veventsMap`.
3. Load all mappings.
4. For each current UID:
   - Compute fingerprint.
   - If no mapping: **insert** event to Google → store mapping {uid, googleEventId, fingerprint}.
   - If mapping exists:
     - If fingerprint changed: **patch/update** Google event → update fingerprint in DB.
5. For mappings not in `currentUIDs`: **delete** event in Google; remove mapping.
6. Log counts and any errors in `SyncLog`.
7. Return a JSON summary.

### OAuth flow

- `/api/google/oauth/initiate`: redirect to Google auth with `access_type=offline` & `prompt=consent` once to collect a **refresh token**.
- `/api/google/oauth/callback`: exchange code; store `accessToken`, `refreshToken`, `expiryDate` in `Token` table.
- `lib/google.ts`: helper to:
  - Load tokens from DB; refresh when expired using `refresh_token`.
  - Save updated tokens back to DB.
  - Return an authenticated `calendar = google.calendar('v3')` client.

### API routes

- `POST /api/sync`: runs `syncOnce()` (server-only). Returns JSON report `{ created, updated, deleted, startedAt, finishedAt }`.
- `GET /api/status`: returns last `SyncLog` row + whether Google is connected (token exists).
- `GET /api/google/oauth/initiate`: starts OAuth.
- `GET /api/google/oauth/callback`: finishes OAuth.

### UI

- `/` (dashboard):
  - Shows app name, `ICS_URL`, `GOOGLE_CALENDAR_ID`, connection status (✅/❌), last sync summary (from `/api/status`).
  - **“Connect Google Calendar”** button if not connected (links to `/api/google/oauth/initiate`).
  - **“Sync now”** button (disabled if not connected). On click: POST `/api/sync`; show a toast and refresh status.
  - Table listing last 20 changes (read from last `SyncLog.summary` or a `changes` array if you include it).
- Styling: clean Tailwind, cards with rounded-2xl, soft shadow, grid layout.

### Scheduling (once a day)


- **Self-hosted**: add `node-cron` to run `syncOnce()` daily (07:00 local). For Vercel, don’t include node-cron (use platform cron only).

## Acceptance criteria

- Clicking **Sync now** runs end-to-end: fetch ICS, apply filters, upsert/delete events in Google, store mappings, log result.
- `/api/google/oauth/initiate` → Google consent → `/api/google/oauth/callback` stores tokens.
- Daily schedule configured (Vercel cron or node-cron instructions).
- Declined event filtering works **when** ICS contains attendee `PARTSTAT`.
- Transparent/free events are skipped.
- UI shows last sync and connection status; button disabled if not connected.

## Cursor Rules for this project

### No Identifying Data Rule
- NEVER add any identifying data, personal information, or company-specific information to any files that will be committed to git
- This includes but is not limited to:
  - Personal names (first names, last names, full names)
  - Company names (Microsoft, Google, etc.)
  - Company-specific email addresses (@company.com, etc.)
  - Company-specific meeting names, project names, or internal terminology
  - Real calendar URLs, IDs, or tokens
  - Personal or company-specific file paths
  - Internal system names or identifiers

### Code Examples
- Use generic placeholders like:
  - `your.email@company.com` instead of real email addresses
  - `Team Standup, Weekly Review` instead of specific meeting names
  - `your-google-client-id` instead of real client IDs
  - `webcal://outlook.office365.com/.../calendar.ics` instead of real calendar URLs

### Configuration
- All identifying data should be placed in `.env.local` file (which is gitignored)
- Use environment variables for any configurable data
- Provide generic examples in documentation
- Never hardcode real values in source code, README, or documentation

### Documentation
- All examples in README.md, requirements/, and other documentation should be generic
- Use fictional but realistic examples that could apply to any company
- Avoid any references to specific companies, people, or internal systems

### Testing
- When creating test data, use generic names like "Test User", "Sample Meeting", etc.
- Never use real names, real meeting titles, or real company data in tests
- Test files should be deleted after use and not committed to git

### Environment Variables
- Sensitive data should always be in environment variables
- Never commit `.env.local` or any files containing real credentials
- Use `.env.example` for showing the structure without real values

## Important Lessons Learned

### Google Calendar All-Day Event Date Handling
**CRITICAL**: Google Calendar treats all-day event end dates as **exclusive**, not inclusive.

- **Problem**: When converting ICS events with end date "2025-07-18", Google Calendar interprets this as ending on July 17, making a 5-day event appear as 4 days.
- **Solution**: For all-day events, add 1 day to the end date when converting to Google Calendar format.
- **Implementation**: In `createGoogleEventBody()`, detect multi-day events (2+ days) and adjust the end date accordingly.

### Multi-Day Event Detection
- **Rule**: Events spanning 2+ days should be treated as all-day events in Google Calendar
- **Detection**: Calculate duration between start and end dates
- **Conversion**: Use `{ date: 'YYYY-MM-DD' }` format instead of `{ dateTime: 'ISO' }`

### Timezone Handling in RRULE Conversion
- **Issue**: Converting ICS RRULE UNTIL dates to Google Calendar format can cause timezone shifts
- **Problem**: Simply appending 'Z' to convert to UTC can shift the end date by a day
- **Solution**: Properly handle timezone conversion when parsing UNTIL dates in RRULE
- **Implementation**: Check if UNTIL date already has timezone indicator, otherwise convert appropriately

### ICS vs Google Calendar Date Formats
- **ICS**: Uses local timezone or UTC with 'Z' suffix
- **Google Calendar**: 
  - All-day events: `{ date: 'YYYY-MM-DD' }` (exclusive end date)
  - Timed events: `{ dateTime: 'ISO' }` with timezone
- **Conversion**: Always consider timezone and exclusivity rules

### Testing Date Conversions
- **Always test**: Multi-day events, timezone boundaries, and RRULE conversions
- **Verify**: Event duration matches between ICS source and Google Calendar destination
- **Common issues**: Off-by-one errors due to exclusive end dates, timezone shifts