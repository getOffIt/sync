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
  
  // Handle start time
  if (vevent.start) {
    if (vevent.start instanceof Date && !isNaN(vevent.start.getTime())) {
      // Check if it's an all-day event (no time component)
      const isAllDay = vevent.start.getHours() === 0 && 
                      vevent.start.getMinutes() === 0 && 
                      vevent.start.getSeconds() === 0 &&
                      vevent.start.getMilliseconds() === 0
      
      if (isAllDay) {
        eventBody.start = { date: vevent.start.toISOString().split('T')[0] }
      } else {
        // Check if this is a multi-day event that should be treated as all-day
        const startDate = new Date(vevent.start)
        const endDate = vevent.end ? new Date(vevent.end) : null
        
        if (endDate) {
          const diffTime = endDate.getTime() - startDate.getTime()
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          
          // If it's a multi-day event (2+ days), treat it as all-day
          if (diffDays >= 2) {
            eventBody.start = { date: startDate.toISOString().split('T')[0] }
          } else {
            // Use local time instead of UTC
            eventBody.start = { dateTime: formatLocalDateTime(vevent.start) }
          }
        } else {
          // Use local time instead of UTC
          eventBody.start = { dateTime: formatLocalDateTime(vevent.start) }
        }
      }
    }
  }
  
  // Handle end time
  if (vevent.end) {
    if (vevent.end instanceof Date && !isNaN(vevent.end.getTime())) {
      const isAllDay = vevent.end.getHours() === 0 && 
                      vevent.end.getMinutes() === 0 && 
                      vevent.end.getSeconds() === 0 &&
                      vevent.end.getMilliseconds() === 0
      
      if (isAllDay) {
        // For all-day events, Google Calendar treats end date as exclusive
        // So we need to add one day to the end date to get the correct duration
        const adjustedEndDate = new Date(vevent.end)
        adjustedEndDate.setDate(adjustedEndDate.getDate() + 1)
        eventBody.end = { date: adjustedEndDate.toISOString().split('T')[0] }
      } else {
        // Check if this is a multi-day event that should be treated as all-day
        const startDate = vevent.start ? new Date(vevent.start) : null
        const endDate = new Date(vevent.end)
        
        if (startDate && endDate) {
          const diffTime = endDate.getTime() - startDate.getTime()
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          
          // If it's a multi-day event (2+ days), treat it as all-day
          if (diffDays >= 2) {
            // For all-day events, Google Calendar treats end date as exclusive
            // So we need to add one day to the end date to get the correct duration
            const adjustedEndDate = new Date(endDate)
            adjustedEndDate.setDate(adjustedEndDate.getDate() + 1)
            eventBody.end = { date: adjustedEndDate.toISOString().split('T')[0] }
          } else {
            // Use local time instead of UTC
            eventBody.end = { dateTime: formatLocalDateTime(vevent.end) }
          }
        } else {
          // Use local time instead of UTC
          eventBody.end = { dateTime: formatLocalDateTime(vevent.end) }
        }
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
  
  // Handle timezone information from RRULE
  const timezoneMatch = rrule.match(/TZID=([^:\n]+)/)
  if (timezoneMatch) {
    const timezone = timezoneMatch[1]
    // Set the timezone for the event
    eventBody.start.timeZone = timezone
    if (eventBody.end) {
      eventBody.end.timeZone = timezone
    }
  }
  
  return eventBody
}

// Helper function to convert ICS RRULE to Google Calendar recurrence format
export function convertRRULEToGoogleRecurrence(rrule: string): string | null {
  // Parse the RRULE to extract frequency and other parameters
  const freqMatch = rrule.match(/FREQ=([A-Z]+)/)
  const intervalMatch = rrule.match(/INTERVAL=(\d+)/)
  const bydayMatch = rrule.match(/BYDAY=([A-Z,]+)/)
  const untilMatch = rrule.match(/UNTIL=(\d{8}T\d{6})/)
  const timezoneMatch = rrule.match(/TZID=([^:\n]+)/)
  const dtstartMatch = rrule.match(/DTSTART;TZID=[^:]+:(\d{8}T\d{6})/)
  
  if (!freqMatch) return null
  
  const freq = freqMatch[1]
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1
  const timezone = timezoneMatch ? timezoneMatch[1] : 'UTC'
  
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
