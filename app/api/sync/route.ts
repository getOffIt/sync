import { NextRequest, NextResponse } from 'next/server'
import { syncOnce } from '@/lib/sync'

export async function POST(request: NextRequest) {
  try {
    const result = await syncOnce()
    
    return NextResponse.json({
      success: true,
      data: {
        created: result.created,
        updated: result.updated,
        deleted: result.deleted,
        startedAt: result.startedAt.toISOString(),
        finishedAt: result.finishedAt.toISOString(),
        errors: result.errors
      }
    })
  } catch (error) {
    console.error('Sync API error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}
