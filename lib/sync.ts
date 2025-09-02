import { prisma } from './db'
import { fetchAndParseICS, ParsedEvent, ICSFilterOptions, shouldSkipEvent } from './ics'
import { getAuthenticatedCalendar, createGoogleEventBody, createGoogleRecurringEventBody } from './google'
import { googleCalendarRateLimiter } from './rate-limiter'
import { parseICS } from 'node-ical'

// Extend ParsedEvent to include rrule for recurring events
interface RecurringParsedEvent extends ParsedEvent {
  rrule: string
}

export interface SyncResult {
  created: number
  updated: number
  deleted: number
  startedAt: Date
  finishedAt: Date
  errors: string[]
}

export async function syncOnce(): Promise<SyncResult> {
  const startedAt = new Date()
  const errors: string[] = []
  let created = 0
  let updated = 0
  let deleted = 0

  try {
    const icsUrl = process.env.ICS_URL
    const myEmail = process.env.MY_EMAIL

    if (!icsUrl) {
      throw new Error('ICS_URL not configured')
    }

    // Fetch and parse ICS with recurring event detection
    const { parsedEvents, recurringEvents } = await fetchAndParseICSWithRecurrence(icsUrl, { myEmail })
    
    // Track both individual events and recurring events
    const currentUIDs = new Set(parsedEvents.map(e => e.uid))
    const recurringUIDs = new Set(recurringEvents.map(e => e.uid))
    const veventsMap = new Map(parsedEvents.map(e => [e.uid, e]))
    const recurringMap = new Map(recurringEvents.map(e => [e.uid, e]))

    // Get Google Calendar client
    const calendar = await getAuthenticatedCalendar()

    // Get existing mappings
    const existingMappings = await prisma.mapping.findMany()
    const existingUIDs = new Set(existingMappings.map((m: any) => m.uid))
    const uidToGoogleId = new Map(existingMappings.map((m: any) => [m.uid, m.googleEventId]))

    // Process recurring events first (these should be created as recurring events in Google Calendar)
    for (const recurringEvent of recurringEvents) {
      try {
        const { uid, vevent, fingerprint, rrule } = recurringEvent
        const existingGoogleId = uidToGoogleId.get(uid)

        if (existingGoogleId) {
          // Check if recurring event needs updating
          const existingMapping = existingMappings.find((m: any) => m.uid === uid)
          if (existingMapping && existingMapping.fingerprint === fingerprint) {
            continue // No changes needed
          }

          // Update existing recurring event
          const eventBody = createGoogleRecurringEventBody(vevent, rrule)
          await googleCalendarRateLimiter.executeWithRetry(
            () => calendar.events.update({
              calendarId: process.env.GOOGLE_CALENDAR_ID!,
              eventId: existingGoogleId,
              requestBody: eventBody
            }),
            `update recurring event ${uid}`
          )
          updated++

          // Update fingerprint in database
          await prisma.mapping.update({
            where: { uid },
            data: { fingerprint }
          })
        } else {
          // Create new recurring event
          const eventBody = createGoogleRecurringEventBody(vevent, rrule)
          const response = await googleCalendarRateLimiter.executeWithRetry(
            () => calendar.events.insert({
              calendarId: process.env.GOOGLE_CALENDAR_ID!,
              requestBody: eventBody
            }),
            `create recurring event ${uid}`
          )

          if (response.data.id) {
            created++
            // Store mapping
            await prisma.mapping.create({
              data: {
                uid,
                googleEventId: response.data.id,
                fingerprint
              }
            })
          }
        }

      } catch (error) {
        const errorMessage = `Error processing recurring event ${recurringEvent.uid}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(errorMessage)
        errors.push(errorMessage)
      }
    }

    // Process non-recurring events (individual events)
    for (const parsedEvent of parsedEvents) {
      // Skip if this is a recurring event (already handled above)
      if (recurringUIDs.has(parsedEvent.uid)) {
        continue
      }

      try {
        const { uid, vevent, fingerprint } = parsedEvent
        const existingGoogleId = uidToGoogleId.get(uid)

        if (existingGoogleId) {
          // Check if event needs updating
          const existingMapping = existingMappings.find((m: any) => m.uid === uid)
          if (existingMapping && existingMapping.fingerprint === fingerprint) {
            continue // No changes needed
          }

          // Update existing event with rate limiting
          const eventBody = createGoogleEventBody(vevent)
          await googleCalendarRateLimiter.executeWithRetry(
            () => calendar.events.update({
              calendarId: process.env.GOOGLE_CALENDAR_ID!,
              eventId: existingGoogleId,
              requestBody: eventBody
            }),
            `update event ${uid}`
          )
          updated++

          // Update fingerprint in database
          await prisma.mapping.update({
            where: { uid },
            data: { fingerprint }
          })
        } else {
          // Create new event with rate limiting
          const eventBody = createGoogleEventBody(vevent)
          const response = await googleCalendarRateLimiter.executeWithRetry(
            () => calendar.events.insert({
              calendarId: process.env.GOOGLE_CALENDAR_ID!,
              requestBody: eventBody
            }),
            `create event ${uid}`
          )

          if (response.data.id) {
            created++
            // Store mapping
            await prisma.mapping.create({
              data: {
                uid,
                googleEventId: response.data.id,
                fingerprint
              }
            })
          }
        }

      } catch (error) {
        const errorMessage = `Error processing event ${parsedEvent.uid}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(errorMessage)
        errors.push(errorMessage)
      }
    }

    // Delete events that no longer exist in ICS
    for (const mapping of existingMappings) {
      if (!currentUIDs.has(mapping.uid) && !recurringUIDs.has(mapping.uid)) {
        try {
          await googleCalendarRateLimiter.executeWithRetry(
            () => calendar.events.delete({
              calendarId: process.env.GOOGLE_CALENDAR_ID!,
              eventId: mapping.googleEventId
            }),
            `delete event ${mapping.uid}`
          )
          deleted++

          // Remove mapping from database
          await prisma.mapping.delete({
            where: { uid: mapping.uid }
          })

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          
          // If the event was already deleted, clean up the database record
          if (errorMessage.includes('Resource has been deleted')) {
            console.log(`Event ${mapping.uid} was already deleted, cleaning up database record`)
            try {
              await prisma.mapping.delete({
                where: { uid: mapping.uid }
              })
              deleted++ // Count it as successfully deleted
            } catch (dbError) {
              const dbErrorMessage = `Error cleaning up database record for ${mapping.uid}: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
              console.error(dbErrorMessage)
              errors.push(dbErrorMessage)
            }
          } else {
            const fullErrorMessage = `Error deleting event ${mapping.uid}: ${errorMessage}`
            console.error(fullErrorMessage)
            errors.push(fullErrorMessage)
          }
        }
      }
    }

  } catch (error) {
    const errorMessage = `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    console.error(errorMessage)
    errors.push(errorMessage)
  }

  const finishedAt = new Date()

  // Log sync results
  const status = errors.length === 0 ? 'SUCCESS' : errors.length < (created + updated + deleted) ? 'PARTIAL' : 'ERROR'
  const summary = `Created: ${created}, Updated: ${updated}, Deleted: ${deleted}, Errors: ${errors.length}`
  console.log(summary)

  // Log rate limiter stats
  const rateLimitStats = googleCalendarRateLimiter.getStats()
  console.log(`Rate limiter stats: ${rateLimitStats.requestCount} requests made`)

  // Save sync log
  await prisma.syncLog.create({
    data: {
      status: errors.length === 0 ? 'SUCCESS' : errors.length < (created + updated + deleted) ? 'PARTIAL' : 'ERROR',
      summary,
      created,
      updated,
      deleted,
      errors: errors.length > 0 ? JSON.stringify(errors) : null
    }
  })

  return { created, updated, deleted, startedAt, finishedAt, errors }
}

// Enhanced function to fetch and parse ICS with recurring event detection
export async function fetchAndParseICSWithRecurrence(icsUrl: string, options: ICSFilterOptions = {}, includeFiltered = false): Promise<{
  parsedEvents: ParsedEvent[],
  recurringEvents: RecurringParsedEvent[]
}> {
  // Convert webcal:// to https://
  const url = icsUrl.replace(/^webcal:\/\//, 'https://')
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ICS: ${response.status} ${response.statusText}`)
  }
  
  const icsData = await response.text()
  const calendar = parseICS(icsData)
  
  const recurringEvents: RecurringParsedEvent[] = []
  const individualEvents: ParsedEvent[] = []
  
  for (const [uid, event] of Object.entries(calendar)) {
    if (event && typeof event === 'object' && 'type' in event && event.type === 'VEVENT') {
      const vevent = event as any
      
      // Apply filters (unless includeFiltered is true)
      if (!includeFiltered && shouldSkipEvent(vevent, options)) {
        continue
      }
      
      // Create fingerprint
      const { createEventFingerprint } = await import('./fingerprint')
      const fingerprint = createEventFingerprint(vevent)
      
      // Check if this is a recurring event
      if (vevent.rrule && vevent.rrule.toString) {
        // This is a recurring event - keep it as recurring
        recurringEvents.push({
          uid,
          vevent,
          fingerprint,
          rrule: vevent.rrule.toString()
        })
      } else {
        // This is an individual event
        individualEvents.push({
          uid,
          vevent,
          fingerprint
        })
      }
    }
  }
  
  return {
    parsedEvents: individualEvents,
    recurringEvents
  }
}

