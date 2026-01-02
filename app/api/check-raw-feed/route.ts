import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Get the ICS data directly
    const icsUrl = process.env.ICS_URL!.replace(/^webcal:\/\//, 'https://')
    const response = await fetch(icsUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch ICS: ${response.status} ${response.statusText}`)
    }
    
    const icsData = await response.text()
    
    // Get tomorrow's date in YYYYMMDD format
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0].replace(/-/g, '')
    
    // Split into events and look for tomorrow's events
    const events = icsData.split('BEGIN:VEVENT')
    const tomorrowEvents = events.filter(event => {
      // Look for any date field containing tomorrow's date
      return event.includes(tomorrowStr)
    })

    return NextResponse.json({
      success: true,
      data: {
        date: tomorrow.toISOString().split('T')[0],
        events: tomorrowEvents.map(event => ({
          raw: event,
          // Extract key fields
          summary: event.match(/SUMMARY:([^\n]+)/)?.[1] || null,
          start: event.match(/DTSTART(?:;[^:]+)?:([^\n]+)/)?.[1] || null,
          status: event.match(/STATUS:([^\n]+)/)?.[1] || null,
          transparency: event.match(/TRANSP:([^\n]+)/)?.[1] || null,
          busyStatus: event.match(/MICROSOFT-CDO-BUSYSTATUS:([^\n]+)/)?.[1] || 
                     event.match(/X-MICROSOFT-CDO-BUSYSTATUS:([^\n]+)/)?.[1] || null,
          sequence: event.match(/SEQUENCE:([^\n]+)/)?.[1] || null,
          recurrenceId: event.match(/RECURRENCE-ID(?:;[^:]+)?:([^\n]+)/)?.[1] || null
        }))
      }
    })
  } catch (error) {
    console.error('Check raw feed error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

