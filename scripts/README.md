# Scripts Directory

This directory contains utility scripts for managing the calendar sync application.

## Production Scripts

### `daily-sync.sh`
**Purpose**: Automated calendar synchronization script
**Usage**: Run manually with `./scripts/daily-sync.sh` or automatically via cron
**Schedule**: Configured to run weekdays at 7:00 AM via cron
**Logs**: Saves to `logs/sync-YYYY-MM-DD.log` (auto-cleanup after 7 days)
**Shell alias**: `calsync`

### `manual-sync.sh`
**Purpose**: Sync via the Next.js API server (requires server running)
**Usage**: `./scripts/manual-sync.sh` or use `calsync-start` then `calsync-api`
**Note**: Requires the dev server to be running on port 4001

## Maintenance & Debugging Tools

### `cleanup-orphaned-events.ts`
**Purpose**: Find and delete events in Google Calendar that aren't tracked in the database
**When to use**:
- After data corruption or failed syncs
- When you suspect duplicate events from orphaned masters
- As periodic maintenance

**Usage**:
```bash
npx tsx scripts/cleanup-orphaned-events.ts
```

**What it does**:
1. Fetches all events from Google Calendar
2. Compares with database mappings
3. Lists orphaned events grouped by summary
4. Deletes orphaned events after review

### `debug-duplicates.ts`
**Purpose**: Analyze the ICS feed for duplicate UIDs and recurring exceptions
**When to use**: Troubleshooting duplicate events or recurring event issues

**Usage**:
```bash
npx tsx scripts/debug-duplicates.ts
```

**Output**:
- Raw ICS parsing statistics
- UIDs appearing multiple times
- Duplicate synthesized exception UIDs
- Events around specific dates

### `check-google-calendar.ts`
**Purpose**: Inspect Google Calendar for duplicates and verify exception handling
**When to use**: Verifying sync results, checking for duplicates

**Usage**:
```bash
npx tsx scripts/check-google-calendar.ts
```

**What it checks**:
- Searches specific date ranges for duplicate events
- Verifies EXDATE entries on master recurring events
- Checks originalStartTime on exception events
- Reports missing database mappings

## Archived/One-Time Scripts

The following scripts were used for the initial duplicate fix and are kept for reference:

- `check-master-event.ts` - One-off script to inspect EXDATE formatting
- `check-specific-event.ts` - One-off script to check specific event details
- `fix-existing-exceptions.ts` - Attempted to fix exceptions (didn't work due to API limitations)
- `recreate-exceptions.ts` - One-time script to delete and recreate all exceptions
- `run-sync.ts` - Simple sync runner (superseded by daily-sync.sh)

These can be deleted if the worktree needs to be cleaned up.

## Common Workflows

### Manual Sync
```bash
# Option 1: Direct sync (recommended)
calsync

# Option 2: Via API server
calsync-start  # Start dev server
calsync-api    # Run sync via API
```

### View Logs
```bash
# Follow today's log
calsync-logs

# View today's full log
calsync-logs-today

# List recent logs
calsync-logs-list
```

### Cleanup Orphaned Events
```bash
npx tsx scripts/cleanup-orphaned-events.ts
```

### Debug Duplicates
```bash
# Check ICS feed
npx tsx scripts/debug-duplicates.ts

# Check Google Calendar
npx tsx scripts/check-google-calendar.ts
```

## Development

All scripts that interact with Google Calendar or the database require environment variables from `.env.local`. The scripts automatically load these using:

```typescript
import { config } from 'dotenv'
config({ path: '.env.local' })
```

## Cron Job

The `daily-sync.sh` script is configured to run via cron:

```bash
# View cron jobs
crontab -l

# Edit cron schedule
crontab -e
```

Current schedule: `0 7 * * 1-5` (7:00 AM, Monday-Friday)
