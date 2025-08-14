import { syncOnce } from '@/lib/sync'

export async function GET() {
  try {
    console.log('Running scheduled sync...')
    const result = await syncOnce()
    console.log('Scheduled sync completed:', result)
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Sync completed successfully',
      data: result
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Scheduled sync failed:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }
}
