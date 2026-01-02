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

    // Find all recurring events and their exceptions
    const recurringEvents = []
    const exceptions = []
    const exdates = []

    for (const [uid, event] of Object.entries(calendar)) {
      if (event && typeof event === 'object' && 'type' in event && event.type === 'VEVENT') {
        const vevent = event as any
        
        // Check if this is a recurring event
        if (vevent.rrule) {
          recurringEvents.push({
            uid,
            summary: vevent.summary,
            start: vevent.start,
            rrule: vevent.rrule.toString(),
            exdate: vevent.exdate,
            status: vevent.status,
            transparency: vevent.transparency,
            busystatus: vevent['microsoft-cdo-busystatus'] || vevent['MICROSOFT-CDO-BUSYSTATUS'] || vevent['X-MICROSOFT-CDO-BUSYSTATUS'],
            raw: vevent
          })

          // Check for exceptions in recurrences
          if (vevent.recurrences) {
            for (const [recurrenceDate, recurrenceEvent] of Object.entries(vevent.recurrences)) {
              const recurEvent = recurrenceEvent as any
              exceptions.push({
                uid: recurEvent.uid,
                summary: recurEvent.summary,
                start: recurEvent.start,
                recurrenceId: recurEvent.recurrenceid || recurEvent['recurrence-id'],
                status: recurEvent.status,
                transparency: recurEvent.transparency,
                busystatus: recurEvent['microsoft-cdo-busystatus'] || recurEvent['MICROSOFT-CDO-BUSYSTATUS'] || recurEvent['X-MICROSOFT-CDO-BUSYSTATUS'],
                raw: recurEvent
              })
            }
          }

          // Check for EXDATE
          if (vevent.exdate) {
            exdates.push({
              uid,
              summary: vevent.summary,
              exdate: vevent.exdate
            })
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        date: tomorrow.toISOString().split('T')[0],
        recurringEvents: recurringEvents.filter(e => 
          e.summary && (
            e.summary.includes('121 James/Antoine') || 
            e.summary.includes('121 Ravi/Antoine')
          )
        ),
        exceptions: exceptions.filter(e => 
          e.summary && (
            e.summary.includes('121 James/Antoine') || 
            e.summary.includes('121 Ravi/Antoine')
          )
        ),
        exdates: exdates.filter(e => 
          e.summary && (
            e.summary.includes('121 James/Antoine') || 
            e.summary.includes('121 Ravi/Antoine')
          )
        )
      }
    })
  } catch (error) {
    console.error('Debug raw ICS error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

