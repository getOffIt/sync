import { NextResponse } from 'next/server'
import { getAuthenticatedCalendar } from '@/lib/google'

export async function GET() {
  try {
    const calendar = await getAuthenticatedCalendar()
    
    // List all calendars
    const response = await calendar.calendarList.list()
    
    const calendars = response.data.items?.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary,
      accessRole: cal.accessRole
    })) || []
    
    return NextResponse.json({ success: true, calendars })
  } catch (error) {
    console.error('Error fetching calendars:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
