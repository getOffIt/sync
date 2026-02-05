import { getAuthenticatedCalendar } from '../lib/google'
import { config } from 'dotenv'
import { prisma } from '../lib/db'

config({ path: '.env.local' })

async function cleanupOrphanedEvents() {
  const calendar = await getAuthenticatedCalendar()
  const calendarId = process.env.GOOGLE_CALENDAR_ID!

  // Get all event IDs we know about from the database
  const mappings = await prisma.mapping.findMany()
  const knownEventIds = new Set(mappings.map(m => m.googleEventId))

  console.log(`Database has ${mappings.length} known events\n`)

  // Fetch all events from Google Calendar
  console.log('Fetching all events from Google Calendar...\n')
  let allEvents: any[] = []
  let pageToken: string | undefined | null = undefined

  do {
    const response = await calendar.events.list({
      calendarId,
      maxResults: 2500,
      singleEvents: false, // Don't expand recurring events
      pageToken: pageToken || undefined
    })

    if (response.data.items) {
      allEvents = allEvents.concat(response.data.items)
    }

    pageToken = response.data.nextPageToken
  } while (pageToken)

  console.log(`Found ${allEvents.length} events in Google Calendar\n`)

  // Find orphaned events (in Google Calendar but not in database)
  const orphanedEvents = allEvents.filter(event => !knownEventIds.has(event.id!))

  console.log(`Found ${orphanedEvents.length} orphaned events\n`)

  if (orphanedEvents.length === 0) {
    console.log('No orphaned events to clean up!')
    await prisma.$disconnect()
    return
  }

  // Group by summary for easier review
  const eventsBySummary = new Map<string, any[]>()
  for (const event of orphanedEvents) {
    const summary = event.summary || '(No title)'
    if (!eventsBySummary.has(summary)) {
      eventsBySummary.set(summary, [])
    }
    eventsBySummary.get(summary)!.push(event)
  }

  console.log('Orphaned events grouped by summary:\n')
  for (const [summary, events] of eventsBySummary.entries()) {
    console.log(`${summary} (${events.length} event(s)):`)
    for (const event of events) {
      const isRecurring = !!event.recurrence
      const recurringInfo = isRecurring ? ' [RECURRING]' : ''
      console.log(`  - ID: ${event.id}${recurringInfo}`)
      console.log(`    Start: ${event.start?.dateTime || event.start?.date}`)
    }
    console.log()
  }

  console.log('\nDeleting orphaned events...\n')

  let deleted = 0
  let errors = 0

  for (const event of orphanedEvents) {
    try {
      await calendar.events.delete({
        calendarId,
        eventId: event.id!
      })
      deleted++
      console.log(`✓ Deleted: ${event.summary} (${event.id})`)
    } catch (error: any) {
      errors++
      console.error(`✗ Error deleting ${event.id}: ${error.message}`)
    }
  }

  console.log(`\n=== SUMMARY ===`)
  console.log(`Orphaned events found: ${orphanedEvents.length}`)
  console.log(`Deleted: ${deleted}`)
  console.log(`Errors: ${errors}`)

  await prisma.$disconnect()
}

cleanupOrphanedEvents().catch(console.error)
