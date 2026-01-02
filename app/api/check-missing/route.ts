import { NextResponse } from 'next/server'
import { getAuthenticatedCalendar } from '@/lib/google'
import { googleCalendarRateLimiter } from '@/lib/rate-limiter'
import { getIcsEvents } from '@/lib/ics'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    // Get tomorrow's date range
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    
    const dayAfter = new Date(tomorrow)
    dayAfter.setDate(dayAfter.getDate() + 1)

    // 1. Get Google Calendar events
    const calendar = await getAuthenticatedCalendar()
    const calendarId = process.env.GOOGLE_CALENDAR_ID!
    
    const googleResponse = await googleCalendarRateLimiter.executeWithRetry(
      () => calendar.events.list({
        calendarId,
        timeMin: tomorrow.toISOString(),
        timeMax: dayAfter.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      }),
      'list tomorrow events'
    )
    
    const googleEvents = googleResponse.data.items || []

    // 2. Get ICS events
    const icsEvents = await getIcsEvents()
    const tomorrowIcsEvents = icsEvents.filter(event => {
      const eventDate = new Date(event.start)
      return eventDate >= tomorrow && eventDate < dayAfter
    })

    // 3. Get mappings
    const mappings = await prisma.mapping.findMany({
      where: {
        googleEventId: {
          in: googleEvents.map(e => e.id!)
        }
      }
    })

    // 4. Find events in Google that aren't in ICS
    const unmappedEvents = googleEvents.filter(gEvent => 
      !mappings.some(m => m.googleEventId === gEvent.id)
    )

    return NextResponse.json({
      success: true,
      data: {
        date: tomorrow.toISOString().split('T')[0],
        googleEvents: googleEvents.map(e => ({
          id: e.id,
          summary: e.summary,
          start: e.start,
          end: e.end,
          isMapped: mappings.some(m => m.googleEventId === e.id)
        })),
        icsEvents: tomorrowIcsEvents.map(e => ({
          summary: e.summary,
          start: e.start,
          end: e.end
        })),
        unmappedEvents: unmappedEvents.map(e => ({
          id: e.id,
          summary: e.summary,
          start: e.start,
          end: e.end,
          createdTime: e.created,
          creator: e.creator
        }))
      }
    })
  } catch (error) {
    console.error('Check missing events error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

