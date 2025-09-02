import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedCalendar } from '@/lib/google'
import { fetchAndParseICSWithRecurrence } from '@/lib/sync'
import { shouldSkipEvent } from '@/lib/ics'
import { googleCalendarRateLimiter } from '@/lib/rate-limiter'

export async function POST() {
  try {
    const icsUrl = process.env.ICS_URL
    if (!icsUrl) {
      throw new Error('ICS_URL not configured')
    }

    // Get all mappings
    const mappings = await prisma.mapping.findMany()
    
    // Fetch current ICS data (including filtered events)
    const { parsedEvents, recurringEvents } = await fetchAndParseICSWithRecurrence(icsUrl, { 
      myEmail: process.env.MY_EMAIL 
    }, true) // Pass true to include filtered events

    // Create a map of all events from ICS (including filtered ones)
    const allICSEvents = new Map()
    
    // Add individual events
    for (const event of parsedEvents) {
      allICSEvents.set(event.uid, event.vevent)
    }
    
    // Add recurring events
    for (const event of recurringEvents) {
      allICSEvents.set(event.uid, event.vevent)
    }

    const calendar = await getAuthenticatedCalendar()
    let deletedCount = 0
    const errors: string[] = []

    // Check each mapping
    for (const mapping of mappings) {
      const icsEvent = allICSEvents.get(mapping.uid)
      
      if (icsEvent) {
        // Event exists in ICS, check if it should be filtered out
        if (shouldSkipEvent(icsEvent, { myEmail: process.env.MY_EMAIL })) {
          try {
            // Delete from Google Calendar
            await googleCalendarRateLimiter.executeWithRetry(
              () => calendar.events.delete({
                calendarId: process.env.GOOGLE_CALENDAR_ID!,
                eventId: mapping.googleEventId
              }),
              `cleanup delete event ${mapping.uid}`
            )
            
            // Remove from database
            await prisma.mapping.delete({
              where: { uid: mapping.uid }
            })
            
            deletedCount++
            console.log(`Deleted filtered event: ${mapping.uid}`)
            
          } catch (error) {
            const errorMessage = `Error deleting filtered event ${mapping.uid}: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error(errorMessage)
            errors.push(errorMessage)
          }
        }
      } else {
        // Event no longer exists in ICS, delete it
        try {
          await googleCalendarRateLimiter.executeWithRetry(
            () => calendar.events.delete({
              calendarId: process.env.GOOGLE_CALENDAR_ID!,
              eventId: mapping.googleEventId
            }),
            `cleanup delete missing event ${mapping.uid}`
          )
          
          await prisma.mapping.delete({
            where: { uid: mapping.uid }
          })
          
          deletedCount++
          console.log(`Deleted missing event: ${mapping.uid}`)
          
        } catch (error) {
          const errorMessage = `Error deleting missing event ${mapping.uid}: ${error instanceof Error ? error.message : 'Unknown error'}`
          console.error(errorMessage)
          errors.push(errorMessage)
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        deletedCount,
        errors: errors.length > 0 ? errors : null,
        message: `Cleanup completed. Deleted ${deletedCount} events.`
      }
    })

  } catch (error) {
    console.error('Cleanup error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
