import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getStoredTokens } from '@/lib/google'

export async function GET() {
  try {
    // Get last sync log
    const lastSync = await prisma.syncLog.findFirst({
      orderBy: { startedAt: 'desc' }
    })

    // Check Google connection
    const tokens = await getStoredTokens()
    const isConnected = !!tokens

    // Get mappings count
    const mappingsCount = await prisma.mapping.count()

    return NextResponse.json({
      success: true,
      data: {
        lastSync: lastSync ? {
          id: lastSync.id,
          startedAt: lastSync.startedAt.toISOString(),
          finishedAt: lastSync.finishedAt?.toISOString(),
          status: lastSync.status,
          summary: lastSync.summary,
          created: lastSync.created,
          updated: lastSync.updated,
          deleted: lastSync.deleted,
          errors: lastSync.errors ? JSON.parse(lastSync.errors) : null
        } : null,
        isConnected,
        mappingsCount,
        config: {
          icsUrl: process.env.ICS_URL,
          calendarId: process.env.GOOGLE_CALENDAR_ID,
          myEmail: process.env.MY_EMAIL
        }
      }
    })
  } catch (error) {
    console.error('Status API error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
