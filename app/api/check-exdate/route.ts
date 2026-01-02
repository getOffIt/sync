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

    // Find all recurring events and their EXDATE
    const recurringEvents = []

    for (const [uid, event] of Object.entries(calendar)) {
      if (event && typeof event === 'object' && 'type' in event && event.type === 'VEVENT') {
        const vevent = event as any
        
        // Check if this is a recurring event
        if (vevent.rrule) {
          // Parse EXDATE
          let exdates: string[] = []
          if (vevent.exdate) {
            if (typeof vevent.exdate === 'string') {
              // Single EXDATE
              exdates = [vevent.exdate]
            } else if (Array.isArray(vevent.exdate)) {
              // Multiple EXDATEs
              exdates = vevent.exdate
            } else if (typeof vevent.exdate === 'object') {
              // EXDATE object with date keys
              exdates = Object.keys(vevent.exdate)
            }
          }

          recurringEvents.push({
            uid,
            summary: vevent.summary,
            start: vevent.start,
            rrule: vevent.rrule.toString(),
            exdate: exdates,
            raw: {
              exdate: vevent.exdate,
              rrule: vevent.rrule,
              start: vevent.start,
              end: vevent.end
            }
          })
        }
      }
    }

    // Filter for our target meetings
    const targetEvents = recurringEvents.filter(e => 
      e.summary && (
        e.summary.includes('121 James/Antoine') || 
        e.summary.includes('121 Ravi/Antoine')
      )
    )

    return NextResponse.json({
      success: true,
      data: {
        date: tomorrow.toISOString().split('T')[0],
        events: targetEvents
      }
    })
  } catch (error) {
    console.error('Check EXDATE error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

