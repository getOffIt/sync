import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fetchAndParseICSWithRecurrence } from '@/lib/sync'
import { shouldSkipEvent } from '@/lib/ics'

export async function GET() {
  try {
    // Get all mappings
    const mappings = await prisma.mapping.findMany({
      orderBy: { uid: 'asc' }
    })

    // Get recent sync logs
    const recentSyncs = await prisma.syncLog.findMany({
      take: 5,
      orderBy: { startedAt: 'desc' }
    })

    // Fetch current ICS data to see what's being processed
    const icsUrl = process.env.ICS_URL
    if (!icsUrl) {
      throw new Error('ICS_URL not configured')
    }

    // Get events with filtering (normal sync behavior)
    const { parsedEvents, recurringEvents } = await fetchAndParseICSWithRecurrence(icsUrl, { 
      myEmail: process.env.MY_EMAIL 
    })

    // Get ALL events including filtered ones
    const { parsedEvents: allParsedEvents, recurringEvents: allRecurringEvents } = await fetchAndParseICSWithRecurrence(icsUrl, { 
      myEmail: process.env.MY_EMAIL 
    }, true)

    // Get UIDs that are currently in the ICS feed (after filtering)
    const currentUIDs = new Set([
      ...parsedEvents.map(e => e.uid),
      ...recurringEvents.map(e => e.uid)
    ])

    // Get ALL UIDs from ICS feed (including filtered)
    const allUIDs = new Set([
      ...allParsedEvents.map(e => e.uid),
      ...allRecurringEvents.map(e => e.uid)
    ])

    // Check which mappings correspond to events that are no longer in the ICS feed
    const orphanedMappings = mappings.filter(m => !allUIDs.has(m.uid))

    // Check which mappings correspond to events that are filtered out
    const filteredMappings = mappings.filter(m => allUIDs.has(m.uid) && !currentUIDs.has(m.uid))

    // Get sample of filtered events to understand what's being filtered
    const filteredEvents = []
    for (const event of [...allParsedEvents, ...allRecurringEvents]) {
      if (!currentUIDs.has(event.uid)) {
        const vevent = event.vevent
        filteredEvents.push({
          uid: event.uid,
          summary: vevent.summary,
          start: vevent.start,
          busyStatus: (vevent as any)['x-microsoft-cdo-busystatus'],
          attendee: vevent.attendee,
          transparency: vevent.transparency
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        mappingsCount: mappings.length,
        currentEventsCount: parsedEvents.length + recurringEvents.length,
        allEventsCount: allParsedEvents.length + allRecurringEvents.length,
        orphanedMappingsCount: orphanedMappings.length,
        filteredMappingsCount: filteredMappings.length,
        orphanedMappings: orphanedMappings.map(m => ({
          uid: m.uid,
          googleEventId: m.googleEventId,
          fingerprint: m.fingerprint
        })),
        filteredMappings: filteredMappings.map(m => ({
          uid: m.uid,
          googleEventId: m.googleEventId,
          fingerprint: m.fingerprint
        })),
        recentSyncs: recentSyncs.map(s => ({
          id: s.id,
          startedAt: s.startedAt.toISOString(),
          status: s.status,
          summary: s.summary,
          created: s.created,
          updated: s.updated,
          deleted: s.deleted
        })),
        sampleCurrentEvents: [
          ...parsedEvents.slice(0, 3).map(e => ({ uid: e.uid, type: 'individual' })),
          ...recurringEvents.slice(0, 3).map(e => ({ uid: e.uid, type: 'recurring' }))
        ],
        sampleFilteredEvents: filteredEvents.slice(0, 5)
      }
    })
  } catch (error) {
    console.error('Debug API error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
