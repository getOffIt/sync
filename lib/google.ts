import { google } from 'googleapis'
import { prisma } from './db'

export interface GoogleTokens {
  accessToken: string
  refreshToken: string
  expiryDate: Date
  scopes?: string
}

export async function getStoredTokens(): Promise<GoogleTokens | null> {
  try {
    const token = await prisma.token.findFirst({
      where: { id: 1 }
    })
    
    if (!token) return null
    
    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiryDate: token.expiryDate,
      scopes: token.scopes || undefined
    }
  } catch (error) {
    console.error('Error fetching stored tokens:', error)
    return null
  }
}

export async function storeTokens(tokens: GoogleTokens): Promise<void> {
  try {
    await prisma.token.upsert({
      where: { id: 1 },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiryDate: tokens.expiryDate,
        scopes: tokens.scopes
      },
      create: {
        id: 1,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiryDate: tokens.expiryDate,
        scopes: tokens.scopes
      }
    })
  } catch (error) {
    console.error('Error storing tokens:', error)
    throw error
  }
}

export async function getAuthenticatedCalendar() {
  const tokens = await getStoredTokens()
  
  if (!tokens) {
    throw new Error('No Google tokens found. Please authenticate first.')
  }
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate.getTime()
  })
  
  // Set up token refresh handler
  oauth2Client.on('tokens', async (newTokens) => {
    if (newTokens.access_token) {
      const updatedTokens: GoogleTokens = {
        accessToken: newTokens.access_token,
        refreshToken: tokens.refreshToken, // Keep the original refresh token
        expiryDate: newTokens.expiry_date ? new Date(newTokens.expiry_date) : new Date(Date.now() + 3600000),
        scopes: tokens.scopes
      }
      
      await storeTokens(updatedTokens)
    }
  })
  
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

export function createGoogleEventBody(vevent: any) {
  const eventBody: any = {
    summary: vevent.summary,
    location: vevent.location,
    description: vevent.description,
    transparency: vevent.transparency === 'TRANSPARENT' ? 'transparent' : 'opaque'
  }
  
  // Check if this is a recurring event exception
  if (vevent['recurrence-id']) {
    // This is an exception to a recurring event
    // We'll need to set the recurringEventId when creating the event
    console.log(`📅 Creating exception event: ${vevent.summary}`)
    console.log(`   Original date: ${vevent['recurrence-id']}`)
    console.log(`   New date: ${vevent.start}`)
  }
  
  // Helper function to detect all-day events with specific patterns for this ICS source
  function isAllDayEvent(vevent: any): boolean {
    // Check if the event has explicit all-day indicators
    if (vevent.allDay === true || vevent['all-day'] === true) {
      return true
    }
    
    // Check if start and end times indicate an all-day event
    if (vevent.start && vevent.end) {
      const startDate = new Date(vevent.start)
      const endDate = new Date(vevent.end)
      
      // Calculate duration in hours
      const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
      
      // SPECIFIC PATTERN FOR THIS ICS SOURCE:
      // All-day events appear as 23-hour events from 00:00 UTC to 23:00 UTC
      // which becomes 01:00 BST to 00:00 BST (next day) in local time
      
      // Check if both start and end are at midnight in UTC (the source pattern)
      const startAtMidnightUTC = startDate.getUTCHours() === 0 && 
                                startDate.getUTCMinutes() === 0 && 
                                startDate.getUTCSeconds() === 0 &&
                                startDate.getUTCMilliseconds() === 0
      
      const endAt23UTC = endDate.getUTCHours() === 23 && 
                         endDate.getUTCMinutes() === 0 && 
                         endDate.getUTCSeconds() === 0 &&
                         endDate.getUTCMilliseconds() === 0
      
      // Primary detection: 23-hour duration from 00:00 UTC to 23:00 UTC
      if (durationHours === 23 && startAtMidnightUTC && endAt23UTC) {
        return true
      }
      
      // Secondary detection: 23-hour duration starting at midnight (any timezone)
      const startAtMidnight = startDate.getHours() === 0 && 
                             startDate.getMinutes() === 0 && 
                             startDate.getSeconds() === 0 &&
                             startDate.getMilliseconds() === 0
      
      if (durationHours === 23 && startAtMidnight) {
        return true
      }
      
      // Standard 24-hour all-day events
      const isFullDays = durationHours > 0 && durationHours % 24 === 0
      const endAtMidnightUTC = endDate.getUTCHours() === 0 && 
                              endDate.getUTCMinutes() === 0 && 
                              endDate.getUTCSeconds() === 0 &&
                              endDate.getUTCMilliseconds() === 0
      
      const endAtMidnight = endDate.getHours() === 0 && 
                           endDate.getMinutes() === 0 && 
                           endDate.getSeconds() === 0 &&
                           endDate.getMilliseconds() === 0
      
      if (isFullDays && (startAtMidnight && endAtMidnight || startAtMidnightUTC && endAtMidnightUTC)) {
        return true
      }
      
      // Additional pattern: Events with "office day" in the title and 23-hour duration
      if (vevent.summary && vevent.summary.toLowerCase().includes('office day') && durationHours === 23) {
        return true
      }
      
      // Additional pattern: Events with "away day" in the title and full-day duration
      if (vevent.summary && vevent.summary.toLowerCase().includes('away day') && durationHours >= 23) {
        return true
      }
    }
    
    return false
  }

  // Helper function to format date in local timezone
  function formatLocalDateTime(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    
    // Get timezone offset in minutes
    const offset = date.getTimezoneOffset()
    const offsetHours = Math.abs(Math.floor(offset / 60))
    const offsetMinutes = Math.abs(offset % 60)
    const offsetSign = offset <= 0 ? '+' : '-'
    const offsetStr = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetStr}`
  }
  
  // Handle start and end time with improved all-day detection
  const isAllDay = isAllDayEvent(vevent)
  
  // Handle start time
  if (vevent.start) {
    if (vevent.start instanceof Date && !isNaN(vevent.start.getTime())) {
      if (isAllDay) {
        // For all-day events, use date format (YYYY-MM-DD)
        eventBody.start = { date: vevent.start.toISOString().split('T')[0] }
      } else {
        // For timed events, use dateTime format with timezone
        eventBody.start = { dateTime: formatLocalDateTime(vevent.start) }
      }
    }
  }
  
  // Handle end time
  if (vevent.end) {
    if (vevent.end instanceof Date && !isNaN(vevent.end.getTime())) {
      if (isAllDay) {
        // For all-day events, Google Calendar treats end date as exclusive
        // For a 1-day event, if start is 2025-10-14, end should be 2025-10-15
        // But our ICS source gives us the actual end date, so we need to add 1 day
        const endDate = new Date(vevent.end)
        endDate.setDate(endDate.getDate() + 1)
        eventBody.end = { date: endDate.toISOString().split('T')[0] }
      } else {
        // For timed events, use dateTime format with timezone
        eventBody.end = { dateTime: formatLocalDateTime(vevent.end) }
      }
    }
  }
  
  return eventBody
}

export function createGoogleRecurringEventBody(vevent: any, rrule: string) {
  const eventBody = createGoogleEventBody(vevent)
  
  // Convert ICS RRULE to Google Calendar recurrence format
  const googleRecurrence = convertRRULEToGoogleRecurrence(rrule)
  
  if (googleRecurrence) {
    eventBody.recurrence = [googleRecurrence]
  }
  
  // Handle timezone information from RRULE or DTSTART
  let timezone: string | null = null
  
  // First try to extract timezone from RRULE
  const timezoneMatch = rrule.match(/TZID=([^:\n;]+)/)
  if (timezoneMatch) {
    timezone = timezoneMatch[1].trim()
  }
  
  // If no timezone in RRULE, try to extract from DTSTART
  if (!timezone) {
    const dtstartMatch = rrule.match(/DTSTART;TZID=([^:;]+):/)
    if (dtstartMatch) {
      timezone = dtstartMatch[1].trim()
    }
  }
  
  // Normalize common timezone names to Google Calendar compatible format
  if (timezone) {
    timezone = normalizeTimezone(timezone)
    
    // Only add timezone to dateTime events, preserve all-day events as date format
    if (eventBody.start && eventBody.start.dateTime && !eventBody.start.timeZone) {
      eventBody.start.timeZone = timezone
    }
    
    if (eventBody.end && eventBody.end.dateTime && !eventBody.end.timeZone) {
      eventBody.end.timeZone = timezone
    }
  } else {
    // Fallback: use a default timezone if none is found, but only for timed events
    const fallbackTimezone = 'Europe/London' // or process.env.DEFAULT_TIMEZONE
    
    // Only add timezone to dateTime events, preserve all-day events
    if (eventBody.start && eventBody.start.dateTime && !eventBody.start.timeZone) {
      console.warn(`⚠️  No timezone found in RRULE for timed event, using fallback: ${fallbackTimezone}`)
      eventBody.start.timeZone = fallbackTimezone
    }
    
    if (eventBody.end && eventBody.end.dateTime && !eventBody.end.timeZone) {
      eventBody.end.timeZone = fallbackTimezone
    }
  }
  
  return eventBody
}

// Helper function to normalize timezone names to Google Calendar compatible format
function normalizeTimezone(timezone: string): string {
  // Common timezone mappings from ICS to Google Calendar format
  const timezoneMap: { [key: string]: string } = {
    'GMT Standard Time': 'Europe/London',
    'GMT Daylight Time': 'Europe/London',
    'GMT': 'Europe/London',
    'UTC': 'UTC',
    'Eastern Standard Time': 'America/New_York',
    'Eastern Daylight Time': 'America/New_York',
    'Central Standard Time': 'America/Chicago',
    'Central Daylight Time': 'America/Chicago',
    'Mountain Standard Time': 'America/Denver',
    'Mountain Daylight Time': 'America/Denver',
    'Pacific Standard Time': 'America/Los_Angeles',
    'Pacific Daylight Time': 'America/Los_Angeles',
    'Central European Time': 'Europe/Paris',
    'Central European Summer Time': 'Europe/Paris',
    'CET': 'Europe/Paris',
    'CEST': 'Europe/Paris'
  }
  
  // Return mapped timezone or original if no mapping found
  return timezoneMap[timezone] || timezone
}

// Helper function to convert ICS RRULE to Google Calendar recurrence format
export function convertRRULEToGoogleRecurrence(rrule: string): string | null {
  // Parse the RRULE to extract frequency and other parameters
  const freqMatch = rrule.match(/FREQ=([A-Z]+)/)
  const intervalMatch = rrule.match(/INTERVAL=(\d+)/)
  const bydayMatch = rrule.match(/BYDAY=([A-Z,]+)/)
  const untilMatch = rrule.match(/UNTIL=(\d{8}T\d{6}Z?)/)
  const timezoneMatch = rrule.match(/TZID=([^:\n;]+)/)
  const dtstartMatch = rrule.match(/DTSTART;TZID=([^:;]+):(\d{8}T\d{6})/)
  
  if (!freqMatch) return null
  
  const freq = freqMatch[1]
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1
  let timezone = timezoneMatch ? timezoneMatch[1].trim() : null
  
  // If no timezone in RRULE, try to extract from DTSTART
  if (!timezone && dtstartMatch) {
    timezone = dtstartMatch[1].trim()
  }
  
  // Normalize timezone
  if (timezone) {
    timezone = normalizeTimezone(timezone)
  } else {
    timezone = 'UTC' // fallback
  }
  
  // Convert frequency to Google Calendar format
  let googleFreq: string
  switch (freq) {
    case 'DAILY':
      googleFreq = 'DAILY'
      break
    case 'WEEKLY':
      googleFreq = 'WEEKLY'
      break
    case 'MONTHLY':
      googleFreq = 'MONTHLY'
      break
    case 'YEARLY':
      googleFreq = 'YEARLY'
      break
    default:
      return null
  }
  
  // Build the Google Calendar recurrence rule
  let googleRule = `RRULE:FREQ=${googleFreq}`
  
  if (interval > 1) {
    googleRule += `;INTERVAL=${interval}`
  }
  
  // Handle BYDAY (day of week)
  if (bydayMatch) {
    const days = bydayMatch[1].split(',')
    const dayMap: { [key: string]: string } = {
      'MO': 'MO', 'TU': 'TU', 'WE': 'WE', 'TH': 'TH', 'FR': 'FR', 'SA': 'SA', 'SU': 'SU'
    }
    
    const googleDays = days.map(day => dayMap[day]).filter(Boolean)
    if (googleDays.length > 0) {
      googleRule += `;BYDAY=${googleDays.join(',')}`
    }
  }
  
  // Handle UNTIL (end date) - convert to proper timezone format
  if (untilMatch) {
    const untilDate = untilMatch[1]
    
    // Check if the UNTIL date already has a timezone indicator
    if (untilDate.includes('Z')) {
      // Already in UTC, use as is
      googleRule += `;UNTIL=${untilDate}`
    } else {
      // Convert from YYYYMMDDTHHMMSS to proper format
      const year = untilDate.substring(0, 4)
      const month = untilDate.substring(4, 6)
      const day = untilDate.substring(6, 8)
      const hour = untilDate.substring(9, 11)
      const minute = untilDate.substring(11, 13)
      const second = untilDate.substring(13, 15)
      
      // Create a Date object in the specified timezone and convert to UTC
      const localDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
      
      // If we have timezone information, adjust accordingly
      if (timezone && timezone !== 'UTC') {
        // For now, we'll use the local timezone as a fallback
        // In a production environment, you'd want to use a proper timezone library
        const utcDate = new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000))
        const formattedUntil = utcDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
        googleRule += `;UNTIL=${formattedUntil}`
      } else {
        // Format as ISO string with timezone
        const formattedUntil = `${year}${month}${day}T${hour}${minute}${second}Z`
        googleRule += `;UNTIL=${formattedUntil}`
      }
    }
  }
  
  return googleRule
}
