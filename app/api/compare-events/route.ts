import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedCalendar } from '@/lib/google'
import { fetchAndParseICSWithRecurrence } from '@/lib/sync'
import { googleCalendarRateLimiter } from '@/lib/rate-limiter'

export async function GET() {
  try {
    const calendar = await getAuthenticatedCalendar()
    const calendarId = process.env.GOOGLE_CALENDAR_ID!

    // Get all events from Google Calendar
    const response = await googleCalendarRateLimiter.executeWithRetry(
      () => calendar.events.list({
        calendarId,
        timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        timeMax: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days from now
        singleEvents: true,
        orderBy: 'startTime'
      }),
      'list events for comparison'
    )

    const googleEvents = response.data.items || []
    console.log(`Found ${googleEvents.length} events in Google Calendar`)

    // Get what the sync system thinks should be there
    const icsUrl = process.env.ICS_URL
    if (!icsUrl) {
      throw new Error('ICS_URL not configured')
    }

    const { parsedEvents, recurringEvents } = await fetchAndParseICSWithRecurrence(icsUrl, { 
      myEmail: process.env.MY_EMAIL 
    })

    // Get all mappings from database
    const mappings = await prisma.mapping.findMany()
    const mappingUIDs = new Set(mappings.map(m => m.uid))
    const mappingGoogleIds = new Set(mappings.map(m => m.googleEventId))

    // Find Google Calendar events that are not in our mappings
    const unmappedGoogleEvents = googleEvents.filter(event => !mappingGoogleIds.has(event.id!))

    // Find events that should be synced but aren't in Google Calendar
    const missingGoogleEvents = parsedEvents.filter(event => !mappingUIDs.has(event.uid))

    // Find events in mappings that are no longer in the ICS feed
    const currentUIDs = new Set([
      ...parsedEvents.map(e => e.uid),
      ...recurringEvents.map(e => e.uid)
    ])
    const orphanedMappings = mappings.filter(m => !currentUIDs.has(m.uid))

    return NextResponse.json({
      success: true,
      data: {
        googleCalendarEvents: googleEvents.length,
        syncSystemEvents: parsedEvents.length + recurringEvents.length,
        mappingsCount: mappings.length,
        unmappedGoogleEvents: unmappedGoogleEvents.length,
        missingGoogleEvents: missingGoogleEvents.length,
        orphanedMappings: orphanedMappings.length,
        sampleUnmappedGoogleEvents: unmappedGoogleEvents.slice(0, 5).map(e => ({
          id: e.id,
          summary: e.summary,
          start: e.start?.dateTime,
          end: e.end?.dateTime
        })),
        sampleMissingGoogleEvents: missingGoogleEvents.slice(0, 5).map(e => ({
          uid: e.uid,
          summary: e.vevent.summary,
          start: e.vevent.start
        })),
        sampleOrphanedMappings: orphanedMappings.slice(0, 5).map(m => ({
          uid: m.uid,
          googleEventId: m.googleEventId
        }))
      }
    })

  } catch (error) {
    console.error('Compare events error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

