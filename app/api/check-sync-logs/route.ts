import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    // Get recent sync logs
    const logs = await prisma.syncLog.findMany({
      orderBy: {
        id: 'desc'
      },
      take: 10
    })

    return NextResponse.json({
      success: true,
      data: {
        logs: logs.map(log => ({
          id: log.id,
          status: log.status,
          summary: log.summary,
          created: log.created,
          updated: log.updated,
          deleted: log.deleted,
          errors: log.errors ? JSON.parse(log.errors) : null
        }))
      }
    })
  } catch (error) {
    console.error('Check sync logs error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

