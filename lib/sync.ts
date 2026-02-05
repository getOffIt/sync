import { prisma } from './db'
import { fetchAndParseICS, ParsedEvent, ICSFilterOptions, shouldSkipEvent } from './ics'
import { getAuthenticatedCalendar, createGoogleEventBody, createGoogleRecurringEventBody } from './google'
import { googleCalendarRateLimiter } from './rate-limiter'
import { parseICS } from 'node-ical'

// Extend ParsedEvent to include rrule for recurring events
interface RecurringParsedEvent extends ParsedEvent {
  rrule: string
}

// New interface for recurring exceptions
interface RecurringExceptionEvent extends ParsedEvent {
  originalUid: string
  exceptionDate: Date
  isException: boolean
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
    const { parsedEvents, recurringEvents, recurringExceptions } = await fetchAndParseICSWithRecurrence(icsUrl, { myEmail })
    
    // Track both individual events and recurring events
    const currentUIDs = new Set(parsedEvents.map(e => e.uid))
    const recurringUIDs = new Set(recurringEvents.map(e => e.uid))
    const exceptionUIDs = new Set(recurringExceptions.map(e => e.uid))
    const veventsMap = new Map(parsedEvents.map(e => [e.uid, e]))
    const recurringMap = new Map(recurringEvents.map(e => [e.uid, e]))
    const exceptionMap = new Map(recurringExceptions.map(e => [e.uid, e]))

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
        
        // Find all exceptions for this master recurring event
        const relatedExceptions = recurringExceptions.filter(ex => ex.originalUid === uid)
        
        // Create enhanced fingerprint that includes exception data
        const enhancedFingerprint = createMasterEventFingerprint(recurringEvent, relatedExceptions)
        
        const existingGoogleId = uidToGoogleId.get(uid)

        if (existingGoogleId) {
          // Check if recurring event needs updating (using enhanced fingerprint)
          const existingMapping = existingMappings.find((m: any) => m.uid === uid)
          if (existingMapping && existingMapping.fingerprint === enhancedFingerprint) {
            continue // No changes needed
          }

          // Update existing recurring event with EXDATE for moved instances
          const eventBody = createGoogleRecurringEventBody(vevent, rrule)
          
          // Add EXDATE for all moved/cancelled instances
          if (relatedExceptions.length > 0) {
            const exdates = relatedExceptions.map(ex => {
              // Format the exception date in the same timezone as the event (Europe/London)
              // Google Calendar requires EXDATE to match the timezone of the RRULE
              const date = new Date(ex.exceptionDate)
              // Convert to Europe/London time
              const londonDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/London' }))
              const year = londonDate.getFullYear()
              const month = String(londonDate.getMonth() + 1).padStart(2, '0')
              const day = String(londonDate.getDate()).padStart(2, '0')
              const hours = String(londonDate.getHours()).padStart(2, '0')
              const minutes = String(londonDate.getMinutes()).padStart(2, '0')
              const seconds = String(londonDate.getSeconds()).padStart(2, '0')
              const exdateStr = `${year}${month}${day}T${hours}${minutes}${seconds}`
              return `EXDATE;TZID=Europe/London:${exdateStr}`
            })
            eventBody.recurrence = [...(eventBody.recurrence || []), ...exdates]
          }
          
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
            data: { fingerprint: enhancedFingerprint }
          })
        } else {
          // Create new recurring event with EXDATE for moved instances
          const eventBody = createGoogleRecurringEventBody(vevent, rrule)
          
          // Add EXDATE for all moved/cancelled instances
          if (relatedExceptions.length > 0) {
            const exdates = relatedExceptions.map(ex => {
              // Format the exception date in the same timezone as the event (Europe/London)
              // Google Calendar requires EXDATE to match the timezone of the RRULE
              const date = new Date(ex.exceptionDate)
              // Convert to Europe/London time
              const londonDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/London' }))
              const year = londonDate.getFullYear()
              const month = String(londonDate.getMonth() + 1).padStart(2, '0')
              const day = String(londonDate.getDate()).padStart(2, '0')
              const hours = String(londonDate.getHours()).padStart(2, '0')
              const minutes = String(londonDate.getMinutes()).padStart(2, '0')
              const seconds = String(londonDate.getSeconds()).padStart(2, '0')
              const exdateStr = `${year}${month}${day}T${hours}${minutes}${seconds}`
              return `EXDATE;TZID=Europe/London:${exdateStr}`
            })
            eventBody.recurrence = [...(eventBody.recurrence || []), ...exdates]
          }
          
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
                fingerprint: enhancedFingerprint
              }
            })
            // Update the map so exceptions can find this master in the same sync run
            uidToGoogleId.set(uid, response.data.id)
          }
        }

      } catch (error) {
        const errorMessage = `Error processing recurring event ${recurringEvent.uid}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(errorMessage)
        errors.push(errorMessage)
      }
    }

    // Process recurring exceptions (these should be created AFTER master recurring events exist)
    for (const exception of recurringExceptions) {
      try {
        const { uid, vevent, fingerprint, originalUid } = exception
        
        // Find the Google Calendar ID of the master recurring event
        const masterGoogleId = uidToGoogleId.get(originalUid)
        if (!masterGoogleId) {
          console.warn(`Skipping exception ${uid} - master recurring event ${originalUid} not found in Google Calendar`)
          continue
        }

        console.log(`🔄 Processing exception: ${vevent.summary}`)
        console.log(`   Original UID: ${originalUid}`)
        console.log(`   Master Google ID: ${masterGoogleId}`)
        console.log(`   Exception Date: ${exception.exceptionDate}`)
        console.log(`   New Start: ${vevent.start}`)

        const existingGoogleId = uidToGoogleId.get(uid)

        if (existingGoogleId) {
          // Check if exception needs updating
          const existingMapping = existingMappings.find((m: any) => m.uid === uid)
          if (existingMapping && existingMapping.fingerprint === fingerprint) {
            continue // No changes needed
          }

          // Update existing exception event
          // Note: We DON'T set recurringEventId or originalStartTime for standalone exception events
          // Instead, the EXDATE in the master recurring event handles hiding the original instance
          const eventBody = createGoogleEventBody(vevent)

          const response = await googleCalendarRateLimiter.executeWithRetry(
            () => calendar.events.update({
              calendarId: process.env.GOOGLE_CALENDAR_ID!,
              eventId: existingGoogleId,
              requestBody: eventBody
            }),
            `update exception event ${uid}`
          )
          updated++

          // Update fingerprint and exception metadata in database
          await prisma.mapping.update({
            where: { uid },
            data: {
              fingerprint,
              isException: true,
              originalUid,
              exceptionDate: exception.exceptionDate
            }
          })
        } else {
          // Create new exception event as a standalone event
          // Note: We DON'T set recurringEventId or originalStartTime for standalone exception events
          // Instead, the EXDATE in the master recurring event handles hiding the original instance
          const eventBody = createGoogleEventBody(vevent)

          console.log(`📅 Creating standalone exception event for: ${exception.exceptionDate.toISOString()}`)

          const response = await googleCalendarRateLimiter.executeWithRetry(
            () => calendar.events.insert({
              calendarId: process.env.GOOGLE_CALENDAR_ID!,
              requestBody: eventBody
            }),
            `create exception event ${uid}`
          )

          if (response.data.id) {
            created++
            // Store mapping with exception metadata
            await prisma.mapping.create({
              data: {
                uid,
                googleEventId: response.data.id,
                fingerprint,
                isException: true,
                originalUid,
                exceptionDate: exception.exceptionDate
              }
            })
          }
        }

      } catch (error) {
        const errorMessage = `Error processing exception event ${exception.uid}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(errorMessage)
        errors.push(errorMessage)
      }
    }

    // Process non-recurring events (individual events)
    for (const parsedEvent of parsedEvents) {
      // Skip if this is a recurring event or exception (already handled above)
      if (recurringUIDs.has(parsedEvent.uid) || exceptionUIDs.has(parsedEvent.uid)) {
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
      if (!currentUIDs.has(mapping.uid) && !recurringUIDs.has(mapping.uid) && !exceptionUIDs.has(mapping.uid)) {
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
  recurringEvents: RecurringParsedEvent[],
  recurringExceptions: RecurringExceptionEvent[]
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
  const recurringExceptions: RecurringExceptionEvent[] = []
  
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
      
      // Check if this is a recurring event exception FIRST
      if ((vevent as any)['recurrence-id'] || vevent['recurrenceid']) {
        // This is an exception to a recurring event
        const originalUid = extractOriginalUidFromException(vevent)
        const exceptionDate = parseRecurrenceId((vevent as any)['recurrence-id'] || vevent['recurrenceid'])
        
        console.log(`🔍 Found recurring exception: ${vevent.summary}`)
        console.log(`   Original UID: ${originalUid}`)
        console.log(`   Exception Date: ${exceptionDate}`)
        console.log(`   New Start: ${vevent.start}`)
        
        recurringExceptions.push({
          uid: `${originalUid}_EXCEPTION_${exceptionDate.toISOString().split('T')[0]}`,
          vevent,
          fingerprint,
          originalUid,
          exceptionDate,
          isException: true
        })
      } else if (vevent.rrule && vevent.rrule.toString) {
        // This is a master recurring event
        recurringEvents.push({
          uid,
          vevent,
          fingerprint,
          rrule: vevent.rrule.toString()
        })
        
        // Also check for exceptions in the recurrences property
        if (vevent.recurrences) {
          for (const [recurrenceKey, recurrenceValue] of Object.entries(vevent.recurrences)) {
            if (recurrenceValue && typeof recurrenceValue === 'object') {
              const recEvent = recurrenceValue as any
              
              // Create fingerprint for the exception
              const exceptionFingerprint = createEventFingerprint(recEvent)
              const originalUid = recEvent.uid || uid // Use the recurrence UID or fall back to master UID
              const exceptionDate = recEvent.recurrenceid ? new Date(recEvent.recurrenceid) : new Date()
              
              console.log(`🔍 Found recurring exception in recurrences: ${recEvent.summary}`)
              console.log(`   Original UID: ${originalUid}`)
              console.log(`   Exception Date: ${exceptionDate}`)
              console.log(`   New Start: ${recEvent.start}`)
              
              recurringExceptions.push({
                uid: `${originalUid}_EXCEPTION_${exceptionDate.toISOString().split('T')[0]}`,
                vevent: recEvent,
                fingerprint: exceptionFingerprint,
                originalUid,
                exceptionDate,
                isException: true
              })
            }
          }
        }
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
  
  console.log(`📊 Parsing results:`)
  console.log(`   Recurring events: ${recurringEvents.length}`)
  console.log(`   Individual events: ${individualEvents.length}`)
  console.log(`   Recurring exceptions: ${recurringExceptions.length}`)
  
  return {
    parsedEvents: individualEvents,
    recurringEvents,
    recurringExceptions
  }
}

// Enhanced fingerprinting for masters with exceptions
function createMasterEventFingerprint(master: RecurringParsedEvent, exceptions: RecurringExceptionEvent[]): string {
  const { createHash } = require('crypto')
  
  const masterData = {
    uid: master.uid,
    fingerprint: master.fingerprint,
    rrule: master.rrule,
    exceptions: exceptions.map(ex => ({
      uid: ex.uid,
      exceptionDate: ex.exceptionDate.toISOString(),
      newStart: ex.vevent.start?.toISOString(),
      fingerprint: ex.fingerprint
    }))
  }
  
  return createHash('sha256').update(JSON.stringify(masterData)).digest('hex')
}

// Helper function to extract the original UID from an exception event
function extractOriginalUidFromException(vevent: any): string {
  // The UID should be the same as the master recurring event
  return vevent.uid
}

// Helper function to parse RECURRENCE-ID date
function parseRecurrenceId(recurrenceId: any): Date {
  // Convert to string if it's not already
  const recurrenceIdStr = String(recurrenceId)
  
  // Handle different RECURRENCE-ID formats
  if (recurrenceIdStr.includes('TZID=')) {
    // Format: RECURRENCE-ID;TZID=GMT Standard Time:20250902T160000
    const dateMatch = recurrenceIdStr.match(/:(\d{8}T\d{6})/)
    if (dateMatch) {
      const dateStr = dateMatch[1]
      const year = dateStr.substring(0, 4)
      const month = dateStr.substring(4, 6)
      const day = dateStr.substring(6, 8)
      const hour = dateStr.substring(9, 11)
      const minute = dateStr.substring(11, 13)
      const second = dateStr.substring(13, 15)
      
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
    }
  } else {
    // Format: RECURRENCE-ID:20250902T160000
    const dateMatch = recurrenceIdStr.match(/:(\d{8}T\d{6})/)
    if (dateMatch) {
      const dateStr = dateMatch[1]
      const year = dateStr.substring(0, 4)
      const month = dateStr.substring(4, 6)
      const day = dateStr.substring(6, 8)
      const hour = dateStr.substring(9, 11)
      const minute = dateStr.substring(11, 13)
      const second = dateStr.substring(13, 15)
      
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
    }
  }
  
  // Fallback to current date if parsing fails
  console.warn(`⚠️  Failed to parse RECURRENCE-ID: ${recurrenceIdStr}, using current date`)
  return new Date()
}

