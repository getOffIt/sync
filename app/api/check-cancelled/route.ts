import { NextResponse } from 'next/server'
import { parseICS } from 'node-ical'
import { getAuthenticatedCalendar } from '@/lib/google'
import { googleCalendarRateLimiter } from '@/lib/rate-limiter'

export async function GET() {
  try {
    // 1. Get the ICS data directly
    const icsUrl = process.env.ICS_URL!.replace(/^webcal:\/\//, 'https://')
    const response = await fetch(icsUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch ICS: ${response.status} ${response.statusText}`)
    }
    
    const icsData = await response.text()
    const calendar = parseICS(icsData)
    
    // Get tomorrow's date range
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    
    const dayAfter = new Date(tomorrow)
    dayAfter.setDate(dayAfter.getDate() + 1)

    // 2. Get Google Calendar events
    const googleCalendar = await getAuthenticatedCalendar()
    const calendarId = process.env.GOOGLE_CALENDAR_ID!
    
    const googleResponse = await googleCalendarRateLimiter.executeWithRetry(
      () => googleCalendar.events.list({
        calendarId,
        timeMin: tomorrow.toISOString(),
        timeMax: dayAfter.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      }),
      'check cancelled events'
    )

    const googleEvents = googleResponse.data.items || []
    
    // Find the specific meetings
    const targetMeetings = googleEvents.filter(e => 
      e.summary && (
        e.summary.includes('121 James/Antoine') || 
        e.summary.includes('121 Ravi/Antoine')
      )
    )

    // Look for these events in the ICS data
    const icsEvents = Object.values(calendar).filter((event: any) => {
      if (event.type !== 'VEVENT') return false
      
      const eventDate = new Date(event.start)
      return eventDate >= tomorrow && eventDate < dayAfter
    })

    const matchingIcsEvents = icsEvents.filter((event: any) => {
      const summary = event.summary || ''
      return summary.includes('121 James/Antoine') || summary.includes('121 Ravi/Antoine')
    })

    return NextResponse.json({
      success: true,
      data: {
        date: tomorrow.toISOString().split('T')[0],
        googleEvents: targetMeetings.map(e => ({
          summary: e.summary,
          start: e.start,
          end: e.end,
          status: e.status,
          created: e.created,
          updated: e.updated
        })),
        icsEvents: matchingIcsEvents.map((e: any) => ({
          summary: e.summary,
          start: e.start,
          end: e.end,
          status: e.status,
          cancelled: e.status === 'CANCELLED' || e.summary?.startsWith('Canceled:'),
          sequence: e.sequence,
          recurrenceId: e['recurrence-id'],
          rrule: e.rrule?.toString(),
          exdate: e.exdate,
          transparency: e.transparency,
          class: e.class,
          raw: e
        }))
      }
    })
  } catch (error) {
    console.error('Check cancelled events error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

