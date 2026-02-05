import { google } from 'googleapis'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

config({ path: '.env.local' })

const prisma = new PrismaClient()

async function main() {
  // Get stored tokens
  const token = await prisma.token.findFirst({ where: { id: 1 } })
  
  if (!token) {
    console.error('No tokens found. Run the OAuth flow first.')
    process.exit(1)
  }
  
  console.log('Token found, expires:', token.expiryDate)
  console.log('Scopes:', token.scopes)
  
  // Set up OAuth client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  
  oauth2Client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiryDate.getTime()
  })
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
  
  // List all calendars
  console.log('\n📅 Available Calendars:\n')
  
  const calendarList = await calendar.calendarList.list()
  
  for (const cal of calendarList.data.items || []) {
    console.log(`- ${cal.summary}`)
    console.log(`  ID: ${cal.id}`)
    console.log(`  Access: ${cal.accessRole}`)
    console.log()
  }
  
  // Try to get upcoming events from primary calendar
  console.log('\n📆 Upcoming events (primary calendar):\n')
  
  const now = new Date()
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  
  try {
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    })
    
    for (const event of events.data.items || []) {
      const start = event.start?.dateTime || event.start?.date
      console.log(`- ${start}: ${event.summary}`)
    }
  } catch (error: any) {
    console.error('Error fetching events:', error.message)
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)
