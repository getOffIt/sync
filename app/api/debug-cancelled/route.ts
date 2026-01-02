import { NextResponse } from 'next/server'
import { parseICS } from 'node-ical'

export async function GET() {
  try {
    // Get the ICS data directly
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

    // Find all events with any cancellation indicators
    const events = []

    for (const [uid, event] of Object.entries(calendar)) {
      if (event && typeof event === 'object' && 'type' in event && event.type === 'VEVENT') {
        const vevent = event as any
        
        // Check for any cancellation indicators
        const isCancelled = 
          vevent.status === 'CANCELLED' ||
          vevent.summary?.startsWith('Canceled:') ||
          vevent.summary?.startsWith('Cancelled:') ||
          vevent['microsoft-cdo-busystatus'] === 'FREE' ||
          vevent['MICROSOFT-CDO-BUSYSTATUS'] === 'FREE' ||
          vevent['X-MICROSOFT-CDO-BUSYSTATUS'] === 'FREE' ||
          vevent.transparency === 'TRANSPARENT'

        events.push({
          uid,
          summary: vevent.summary,
          start: vevent.start,
          status: vevent.status,
          transparency: vevent.transparency,
          busystatus: vevent['microsoft-cdo-busystatus'] || vevent['MICROSOFT-CDO-BUSYSTATUS'] || vevent['X-MICROSOFT-CDO-BUSYSTATUS'],
          isCancelled,
          raw: vevent
        })

        // Check for exceptions in recurrences
        if (vevent.recurrences) {
          for (const [recurrenceDate, recurrenceEvent] of Object.entries(vevent.recurrences)) {
            const recurEvent = recurrenceEvent as any
            const isExceptionCancelled = 
              recurEvent.status === 'CANCELLED' ||
              recurEvent.summary?.startsWith('Canceled:') ||
              recurEvent.summary?.startsWith('Cancelled:') ||
              recurEvent['microsoft-cdo-busystatus'] === 'FREE' ||
              recurEvent['MICROSOFT-CDO-BUSYSTATUS'] === 'FREE' ||
              recurEvent['X-MICROSOFT-CDO-BUSYSTATUS'] === 'FREE' ||
              recurEvent.transparency === 'TRANSPARENT'

            events.push({
              uid: recurEvent.uid,
              summary: recurEvent.summary,
              start: recurEvent.start,
              recurrenceId: recurEvent.recurrenceid || recurEvent['recurrence-id'],
              status: recurEvent.status,
              transparency: recurEvent.transparency,
              busystatus: recurEvent['microsoft-cdo-busystatus'] || recurEvent['MICROSOFT-CDO-BUSYSTATUS'] || recurEvent['X-MICROSOFT-CDO-BUSYSTATUS'],
              isCancelled: isExceptionCancelled,
              raw: recurEvent
            })
          }
        }
      }
    }

    // Filter for tomorrow's events and our target meetings
    const targetEvents = events.filter(e => {
      const eventDate = new Date(e.start)
      const isTargetMeeting = e.summary && (
        e.summary.includes('121 James/Antoine') || 
        e.summary.includes('121 Ravi/Antoine')
      )
      return eventDate >= tomorrow && eventDate < dayAfter && isTargetMeeting
    })

    return NextResponse.json({
      success: true,
      data: {
        date: tomorrow.toISOString().split('T')[0],
        events: targetEvents,
        allEvents: events.filter(e => 
          e.summary && (
            e.summary.includes('121 James/Antoine') || 
            e.summary.includes('121 Ravi/Antoine')
          )
        )
      }
    })
  } catch (error) {
    console.error('Debug cancelled events error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

