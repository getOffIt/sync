import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedCalendar } from '@/lib/google'
import { googleCalendarRateLimiter } from '@/lib/rate-limiter'

export async function POST() {
  try {
    const calendar = await getAuthenticatedCalendar()
    const calendarId = process.env.GOOGLE_CALENDAR_ID!

    // Get all events from Google Calendar
    const response = await googleCalendarRateLimiter.executeWithRetry(
      () => calendar.events.list({
        calendarId,
        timeMin: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days ago
        timeMax: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 180 days from now
        singleEvents: true,
        orderBy: 'startTime'
      }),
      'list events for cleanup'
    )

    const events = response.data.items || []
    console.log(`Found ${events.length} events in Google Calendar`)

    // Group events by title and start time to find duplicates
    const eventGroups = new Map<string, any[]>()
    
    for (const event of events) {
      if (event.summary && event.start?.dateTime) {
        // Create a key based on title and start time (within 1 minute)
        const startTime = new Date(event.start.dateTime)
        const key = `${event.summary}_${startTime.getFullYear()}-${startTime.getMonth()}-${startTime.getDate()}-${startTime.getHours()}-${startTime.getMinutes()}`
        
        if (!eventGroups.has(key)) {
          eventGroups.set(key, [])
        }
        eventGroups.get(key)!.push(event)
      }
    }

    // Find groups with duplicates
    const duplicates = []
    const toDelete = []
    
    for (const [key, group] of eventGroups.entries()) {
      if (group.length > 1) {
        duplicates.push({
          key,
          count: group.length,
          events: group
        })
        
        // Keep the first event, delete the rest
        for (let i = 1; i < group.length; i++) {
          toDelete.push(group[i])
        }
      }
    }

    console.log(`Found ${duplicates.length} groups with duplicates`)
    console.log(`Will delete ${toDelete.length} duplicate events`)

    // Delete duplicate events
    let deletedCount = 0
    for (const event of toDelete) {
      try {
        await googleCalendarRateLimiter.executeWithRetry(
          () => calendar.events.delete({
            calendarId,
            eventId: event.id!
          }),
          `delete duplicate event ${event.id}`
        )
        deletedCount++
        
        // Also remove from database if it exists
        await prisma.mapping.deleteMany({
          where: {
            googleEventId: event.id
          }
        })
        
      } catch (error) {
        console.error(`Error deleting duplicate event ${event.id}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalEvents: events.length,
        duplicateGroups: duplicates.length,
        duplicatesDeleted: deletedCount,
        duplicateGroups: duplicates.map(d => ({
          title: d.key.split('_')[0],
          count: d.count,
          events: d.events.map(e => ({
            id: e.id,
            start: e.start?.dateTime,
            summary: e.summary
          }))
        }))
      }
    })

  } catch (error) {
    console.error('Cleanup API error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
