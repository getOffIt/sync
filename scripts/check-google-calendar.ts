import { getAuthenticatedCalendar } from '../lib/google'
import { config } from 'dotenv'
import { prisma } from '../lib/db'

// Load environment variables
config({ path: '.env.local' })

async function checkGoogleCalendar() {
  const calendar = await getAuthenticatedCalendar()
  const calendarId = process.env.GOOGLE_CALENDAR_ID!

  // Get mappings from database to understand what events we've synced
  const mappings = await prisma.mapping.findMany()
  console.log(`Total mappings in database: ${mappings.length}\n`)

  // Look for the specific meetings mentioned by the user
  const targetDates = [
    { start: '2026-02-05T13:00:00Z', end: '2026-02-05T15:00:00Z', description: 'SMP fortnightly meeting' },
    { start: '2026-02-09T10:00:00Z', end: '2026-02-09T12:00:00Z', description: 'iPlayer operational check-in' },
    { start: '2026-02-12T13:00:00Z', end: '2026-02-12T15:00:00Z', description: 'Joe/Antoine catch-up' }
  ]

  for (const target of targetDates) {
    console.log(`\n=== ${target.description} ===`)
    console.log(`Searching Google Calendar between ${target.start} and ${target.end}\n`)

    try {
      const response = await calendar.events.list({
        calendarId,
        timeMin: target.start,
        timeMax: target.end,
        singleEvents: true, // This expands recurring events into individual instances
        orderBy: 'startTime'
      })

      const events = response.data.items || []
      console.log(`Found ${events.length} event(s) in this timerange:\n`)

      for (const event of events) {
        console.log(`Event: ${event.summary}`)
        console.log(`  ID: ${event.id}`)
        console.log(`  Start: ${event.start?.dateTime || event.start?.date}`)
        console.log(`  End: ${event.end?.dateTime || event.end?.date}`)
        console.log(`  Recurring Event ID: ${event.recurringEventId || 'N/A'}`)
        console.log(`  Original Start Time: ${event.originalStartTime?.dateTime || 'N/A'}`)
        console.log(`  Status: ${event.status}`)

        // Find corresponding mapping in database
        const mapping = mappings.find(m => m.googleEventId === event.id || m.googleEventId === event.recurringEventId)
        if (mapping) {
          console.log(`  Database mapping found:`)
          console.log(`    UID: ${mapping.uid}`)
          console.log(`    Is Exception: ${mapping.isException}`)
          console.log(`    Original UID: ${mapping.originalUid || 'N/A'}`)
        } else {
          console.log(`  ⚠️  No database mapping found for this event!`)
        }
        console.log()
      }

      // Check for duplicate event summaries
      const summaries = events.map(e => e.summary)
      const duplicateSummaries = summaries.filter((s, i) => summaries.indexOf(s) !== i)
      if (duplicateSummaries.length > 0) {
        console.log(`\n🚨 DUPLICATE DETECTED: Found ${duplicateSummaries.length} duplicate event(s) with same summary:\n`)
        const uniqueDuplicates = [...new Set(duplicateSummaries)]
        uniqueDuplicates.forEach(summary => {
          const duplicateEvents = events.filter(e => e.summary === summary)
          console.log(`  "${summary}" appears ${duplicateEvents.length} times:`)
          duplicateEvents.forEach((event, index) => {
            console.log(`    ${index + 1}. ID: ${event.id}`)
            console.log(`       Recurring Event ID: ${event.recurringEventId || 'N/A'}`)
            console.log(`       Start: ${event.start?.dateTime}`)
          })
        })
      }
    } catch (error) {
      console.error(`Error fetching events: ${error}`)
    }
  }

  // Also check: are there events without proper EXDATE?
  console.log('\n\n=== CHECKING RECURRING EVENTS WITH EXCEPTIONS ===\n')

  // Find mappings for recurring events that have exceptions
  const masterEvents = mappings.filter(m => !m.isException && !m.originalUid)
  const exceptionsMap = new Map<string, typeof mappings>()

  for (const exception of mappings.filter(m => m.originalUid)) {
    if (!exceptionsMap.has(exception.originalUid)) {
      exceptionsMap.set(exception.originalUid, [])
    }
    exceptionsMap.get(exception.originalUid)!.push(exception)
  }

  console.log(`Found ${exceptionsMap.size} recurring events with exceptions\n`)

  for (const [originalUid, exceptions] of exceptionsMap.entries()) {
    const masterMapping = mappings.find(m => m.uid === originalUid)
    if (!masterMapping) {
      console.log(`⚠️  Master event not found for UID: ${originalUid}`)
      continue
    }

    console.log(`Master Event UID: ${originalUid}`)
    console.log(`  Google Event ID: ${masterMapping.googleEventId}`)
    console.log(`  Number of exceptions: ${exceptions.length}`)

    try {
      const event = await calendar.events.get({
        calendarId,
        eventId: masterMapping.googleEventId
      })

      console.log(`  Event Summary: ${event.data.summary}`)
      console.log(`  Has Recurrence: ${!!event.data.recurrence}`)
      if (event.data.recurrence) {
        const exdates = event.data.recurrence.filter(r => r.startsWith('EXDATE'))
        console.log(`  Number of EXDATE entries: ${exdates.length}`)
        if (exdates.length !== exceptions.length) {
          console.log(`  ⚠️  MISMATCH: Expected ${exceptions.length} EXDATE entries but found ${exdates.length}!`)
        }
        if (exdates.length > 0 && exdates.length <= 5) {
          console.log(`  EXDATE entries:`)
          exdates.forEach(ex => console.log(`    ${ex}`))
        }
      } else {
        console.log(`  ⚠️  WARNING: This recurring event has NO recurrence rules!`)
      }

      // Check each exception
      for (const exception of exceptions) {
        const exceptionEvent = await calendar.events.get({
          calendarId,
          eventId: exception.googleEventId
        })
        console.log(`    Exception: ${exceptionEvent.data.summary}`)
        console.log(`      Google ID: ${exception.googleEventId}`)
        console.log(`      Original Start Time: ${exceptionEvent.data.originalStartTime?.dateTime || 'NOT SET!'}`)
        if (!exceptionEvent.data.originalStartTime) {
          console.log(`      🚨 PROBLEM: Exception is missing originalStartTime - this causes duplicates!`)
        }
      }
    } catch (error: any) {
      if (error.message?.includes('Resource has been deleted')) {
        console.log(`  ⚠️  Event has been deleted from Google Calendar`)
      } else {
        console.error(`  Error fetching event: ${error}`)
      }
    }

    console.log()
  }

  await prisma.$disconnect()
}

checkGoogleCalendar().catch(console.error)
