import { NextResponse } from 'next/server'
import { fetchAndParseICS } from '@/lib/ics'

export async function GET() {
  try {
    const icsUrl = process.env.ICS_URL
    const myEmail = process.env.MY_EMAIL

    if (!icsUrl) {
      return NextResponse.json({ success: false, error: 'ICS_URL not configured' })
    }

    // Use the proper parsing function that expands recurring events
    const parsedEvents = await fetchAndParseICS(icsUrl, { myEmail })
    
    const today = new Date()
    const todayStr = today.toDateString()
    
    const allEvents = []
    const filteredEvents = []
    const todayEvents = []
    
    for (const parsedEvent of parsedEvents) {
      const vevent = parsedEvent.vevent
      
      // Check if it's today
      const eventDate = vevent.start ? new Date(vevent.start) : null
      const isToday = eventDate && eventDate.toDateString() === todayStr
      
      const eventInfo = {
        uid: parsedEvent.uid,
        summary: vevent.summary,
        start: vevent.start,
        isToday,
        transparency: vevent.transparency,
        busyStatus: (vevent as any)['x-microsoft-cdo-busystatus'],
        attendee: vevent.attendee
      }
      
      allEvents.push(eventInfo)
      
      if (isToday) {
        todayEvents.push(eventInfo)
        
        // Check if it would be filtered
        const { shouldSkipEvent } = await import('@/lib/ics')
        const wouldSkip = shouldSkipEvent(vevent, { myEmail, onlyToday: true })
        
        if (wouldSkip) {
          filteredEvents.push({
            ...eventInfo,
            reason: 'Filtered out by shouldSkipEvent'
          })
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      stats: {
        totalEvents: allEvents.length,
        todayEvents: todayEvents.length,
        filteredEvents: filteredEvents.length,
        wouldSync: todayEvents.length - filteredEvents.length
      },
      allEvents,
      todayEvents,
      filteredEvents
    })
    
  } catch (error) {
    console.error('Debug error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
