#!/usr/bin/env npx ts-node

/**
 * Google Calendar utility for Henry
 * Uses OAuth credentials from /Users/ant/git/perso/sync
 * 
 * Usage:
 *   npx ts-node scripts/google-calendar.ts list [calendar] [days]
 *   npx ts-node scripts/google-calendar.ts today [calendar]
 *   npx ts-node scripts/google-calendar.ts week [calendar]
 *   npx ts-node scripts/google-calendar.ts create <calendar> <title> <start> <end> [description]
 */

import { google } from 'googleapis'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import * as path from 'path'

// Load env from sync project
config({ path: '/Users/ant/git/perso/sync/.env.local' })

// Use Prisma from sync project
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:/Users/ant/git/perso/sync/prisma/dev.db'
    }
  }
})

// Calendar aliases
const CALENDAR_ALIASES: Record<string, string> = {
  'primary': 'primary',
  'personal': 'antoine.rabanes@gmail.com',
  'gmail': 'antoine.rabanes@gmail.com',
  'family': 'family09303672022781827803@group.calendar.google.com',
  'work': '0177d7e71527ab687b617b126f80d3d96457f1f4e654b5dd6cdc873e807aa074@group.calendar.google.com',
  'bbc': '0177d7e71527ab687b617b126f80d3d96457f1f4e654b5dd6cdc873e807aa074@group.calendar.google.com',
  'school': 'smsponline.com_u6jv4cim25es8tslttjpjimacg@group.calendar.google.com'
}

async function getCalendar() {
  const token = await prisma.token.findFirst({ where: { id: 1 } })
  
  if (!token) {
    throw new Error('No Google tokens found. Run OAuth flow in sync project first.')
  }
  
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
  
  // Auto-save refreshed tokens
  oauth2Client.on('tokens', async (newTokens) => {
    if (newTokens.access_token) {
      await prisma.token.update({
        where: { id: 1 },
        data: {
          accessToken: newTokens.access_token,
          expiryDate: newTokens.expiry_date ? new Date(newTokens.expiry_date) : new Date(Date.now() + 3600000)
        }
      })
    }
  })
  
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

function resolveCalendarId(alias: string): string {
  return CALENDAR_ALIASES[alias.toLowerCase()] || alias
}

async function listEvents(calendarId: string, days: number = 7) {
  const calendar = await getCalendar()
  const now = new Date()
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  
  const response = await calendar.events.list({
    calendarId: resolveCalendarId(calendarId),
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    maxResults: 50,
    singleEvents: true,
    orderBy: 'startTime'
  })
  
  return response.data.items || []
}

async function listAllCalendars() {
  const calendar = await getCalendar()
  const response = await calendar.calendarList.list()
  return response.data.items || []
}

async function createEvent(
  calendarId: string,
  summary: string,
  startTime: string,
  endTime: string,
  description?: string
) {
  const calendar = await getCalendar()
  
  const event = {
    summary,
    description,
    start: {
      dateTime: new Date(startTime).toISOString(),
      timeZone: 'Europe/London'
    },
    end: {
      dateTime: new Date(endTime).toISOString(),
      timeZone: 'Europe/London'
    }
  }
  
  const response = await calendar.events.insert({
    calendarId: resolveCalendarId(calendarId),
    requestBody: event
  })
  
  return response.data
}

// CLI interface
async function main() {
  const [,, command, ...args] = process.argv
  
  try {
    switch (command) {
      case 'calendars':
        const cals = await listAllCalendars()
        console.log(JSON.stringify(cals, null, 2))
        break
        
      case 'list':
        const [listCal = 'primary', listDays = '7'] = args
        const events = await listEvents(listCal, parseInt(listDays))
        console.log(JSON.stringify(events, null, 2))
        break
        
      case 'today':
        const [todayCal = 'primary'] = args
        const todayEvents = await listEvents(todayCal, 1)
        console.log(JSON.stringify(todayEvents, null, 2))
        break
        
      case 'week':
        const [weekCal = 'primary'] = args
        const weekEvents = await listEvents(weekCal, 7)
        console.log(JSON.stringify(weekEvents, null, 2))
        break
        
      case 'create':
        const [createCal, title, start, end, desc] = args
        if (!createCal || !title || !start || !end) {
          console.error('Usage: create <calendar> <title> <start> <end> [description]')
          process.exit(1)
        }
        const created = await createEvent(createCal, title, start, end, desc)
        console.log(JSON.stringify(created, null, 2))
        break
        
      default:
        console.log(`
Google Calendar CLI

Commands:
  calendars              List all calendars
  list [cal] [days]      List events (default: primary, 7 days)
  today [cal]            List today's events
  week [cal]             List this week's events
  create <cal> <title> <start> <end> [desc]  Create an event

Calendar aliases: primary, personal, gmail, family, work, bbc, school
        `)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(console.error)
