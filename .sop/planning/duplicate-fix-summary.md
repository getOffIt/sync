# Duplicate Events Fix - Summary

## Problem
Multiple meetings were appearing duplicated in Google Calendar:
- SMP fortnightly meeting (Feb 5 at 1:30pm)
- iPlayer operational check-in (Feb 9 at 11am)
- Joe/Antoine catch-up (Feb 12 at 2pm)
- And many other recurring events with exceptions

## Root Cause
The issue was caused by incorrect handling of recurring event exceptions:

1. **Incorrect EXDATE Format**: EXDATE entries in master recurring events were using UTC format (`20260205T133500Z`) instead of the local timezone format (`EXDATE;TZID=Europe/London:20260205T133500`) that Google Calendar expects.

2. **Orphaned Master Events**: There were duplicate master recurring events in Google Calendar that weren't tracked in the database, causing Google Calendar to show multiple instances of the same event.

## Solution Implemented

### 1. Fixed EXDATE Formatting (lib/sync.ts)
Changed the EXDATE generation to use the same timezone as the master recurring event:

```typescript
// OLD (incorrect):
const exdateStr = ex.exceptionDate.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z'
return `EXDATE:${exdateStr}`

// NEW (correct):
const date = new Date(ex.exceptionDate)
const londonDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/London' }))
const year = londonDate.getFullYear()
const month = String(londonDate.getMonth() + 1).padStart(2, '0')
const day = String(londonDate.getDate()).padStart(2, '0')
const hours = String(londonDate.getHours()).padStart(2, '0')
const minutes = String(londonDate.getMinutes()).padStart(2, '0')
const seconds = String(londonDate.getSeconds()).padStart(2, '0')
const exdateStr = `${year}${month}${day}T${hours}${minutes}${seconds}`
return `EXDATE;TZID=Europe/London:${exdateStr}`
```

### 2. Added `isException` Flag to Database Mappings
Updated the code to properly set the `isException` field when creating exception mappings:

```typescript
await prisma.mapping.create({
  data: {
    uid,
    googleEventId: response.data.id,
    fingerprint,
    isException: true,  // Now properly set
    originalUid,
    exceptionDate: exception.exceptionDate
  }
})
```

### 3. Cleaned Up Orphaned Events
Created and ran scripts to:
- Identify 77 orphaned events in Google Calendar that weren't in the database
- Delete all orphaned events, including duplicate master recurring events

## How Google Calendar Exception Handling Works

When a recurring event has an exception (moved or modified instance):

1. The **master recurring event** includes an `EXDATE` entry in its `recurrence` array that tells Google Calendar to hide that specific instance
2. A **standalone override event** is created for the new time/details
3. The EXDATE and the override event must use matching timezones for Google Calendar to properly link them

**Without proper EXDATE formatting**: Google Calendar shows both the original recurring instance AND the override event, causing duplicates.

## Scripts Created for Debugging and Maintenance

1. `scripts/debug-duplicates.ts` - Analyzes ICS feed for duplicate UIDs and exceptions
2. `scripts/check-google-calendar.ts` - Checks Google Calendar for duplicates
3. `scripts/fix-existing-exceptions.ts` - Attempts to add originalStartTime to existing exceptions (not successful due to API limitations)
4. `scripts/recreate-exceptions.ts` - Deletes and recreates all exceptions
5. `scripts/cleanup-orphaned-events.ts` - Finds and deletes orphaned events
6. `scripts/check-master-event.ts` - Inspects EXDATE entries on master recurring events
7. `scripts/run-sync.ts` - Runs sync with proper environment loading

## Verification

After the fix:
- ✅ All EXDATE entries now use `TZID=Europe/London` format
- ✅ All 77 orphaned events deleted from Google Calendar
- ✅ No duplicate events detected for any of the mentioned meetings
- ✅ 53 exception events properly recreated with correct master event linkage

## Files Modified

- `lib/sync.ts` - Fixed EXDATE formatting and added isException flag
- Created multiple debugging and maintenance scripts in `scripts/` directory

## Future Prevention

To prevent this issue from recurring:
1. The EXDATE format now matches the timezone of the recurring events
2. Regular cleanup of orphaned events can be done using `scripts/cleanup-orphaned-events.ts`
3. Database now properly tracks exception events with `isException` field
