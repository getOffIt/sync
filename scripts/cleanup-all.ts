#!/usr/bin/env tsx

// Set default DATABASE_URL if not provided (following the pattern from README)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db'
}

import { prisma } from '../lib/db'
import { getAuthenticatedCalendar } from '../lib/google'
import { googleCalendarRateLimiter } from '../lib/rate-limiter'

/**
 * Cleanup script to wipe both local database and Google Calendar
 * This provides a clean slate for testing sync functionality
 */

async function cleanupDatabase() {
  console.log('🧹 Cleaning up local database...')
  
  try {
    // Delete all records from all tables EXCEPT tokens (keep OAuth tokens)
    const mappingCount = await prisma.mapping.deleteMany({})
    const syncLogCount = await prisma.syncLog.deleteMany({})
    
    console.log(`✅ Database cleaned: ${mappingCount.count} mappings, ${syncLogCount.count} sync logs deleted`)
    console.log(`🔐 OAuth tokens preserved for continued access`)
  } catch (error) {
    console.error('❌ Error cleaning database:', error)
    throw error
  }
}

async function cleanupGoogleCalendar() {
  console.log('🗓️  Cleaning up configured calendar...')
  
  try {
    const calendar = await getAuthenticatedCalendar()
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'
    
    console.log(`📅 Using calendar ID: ${calendarId}`)
    
    // Get all events from the calendar
    const response = await calendar.events.list({
      calendarId: calendarId,
      maxResults: 2500, // Maximum allowed by Google API
      singleEvents: true,
      orderBy: 'startTime'
    })
    
    const events = response.data.items || []
    
    if (events.length === 0) {
      console.log('✅ Calendar is already empty')
      return
    }
    
    console.log(`📅 Found ${events.length} events to delete...`)
    
    // Delete events using the existing rate limiter
    let deletedCount = 0
    const errors: string[] = []
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      
      try {
        await googleCalendarRateLimiter.executeWithRetry(
          () => calendar.events.delete({
            calendarId: calendarId,
            eventId: event.id!
          }),
          `delete event ${event.id}`
        )
        
        deletedCount++
        
        // Progress indicator every 10 events
        if ((i + 1) % 10 === 0) {
          console.log(`📦 Progress: ${i + 1}/${events.length} events deleted`)
        }
        
      } catch (error) {
        const errorMessage = `Failed to delete event ${event.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.warn(`⚠️  ${errorMessage}`)
        errors.push(errorMessage)
      }
    }
    
    console.log(`✅ Calendar cleaned: ${deletedCount} events deleted`)
    
    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} events failed to delete`)
    }
    
    // Log rate limiter stats
    const rateLimitStats = googleCalendarRateLimiter.getStats()
    console.log(`📊 Rate limiter stats: ${rateLimitStats.requestCount} requests made`)
    
  } catch (error) {
    console.error('❌ Error cleaning Google Calendar:', error)
    throw error
  }
}

async function resetDatabaseSchema() {
  console.log('🔄 Resetting database schema...')
  
  try {
    // This will drop all tables and recreate them
    // Note: This is destructive and will remove all data
    await prisma.$executeRaw`PRAGMA writable_schema = 1`
    await prisma.$executeRaw`DELETE FROM sqlite_master WHERE type IN ('table', 'index', 'trigger')`
    await prisma.$executeRaw`PRAGMA writable_schema = 0`
    await prisma.$executeRaw`VACUUM`
    
    console.log('✅ Database schema reset complete')
  } catch (error) {
    console.error('❌ Error resetting database schema:', error)
    throw error
  }
}

async function main() {
  console.log('🚀 Starting cleanup process...')
  console.log('⚠️  WARNING: This will delete sync data and events from configured calendar!')
  console.log('')
  
  try {
    // Clean up Google Calendar first (requires authentication)
    await cleanupGoogleCalendar()
    
    // Clean up local database (keeping OAuth tokens)
    await cleanupDatabase()
    
    // Optionally reset the database schema completely
    console.log('')
    console.log('🔄 Database schema reset is optional. Run with --reset-schema to completely reset the database structure.')
    
    if (process.argv.includes('--reset-schema')) {
      await resetDatabaseSchema()
    }
    
    console.log('')
    console.log('🎉 Cleanup completed successfully!')
    console.log('📝 Next steps:')
    console.log('   1. Run a fresh sync to populate both systems:')
    console.log('      npm run dev')
    console.log('      # Then visit http://localhost:4001 and click "Sync Now"')
    console.log('      # Or use the API directly: curl -X POST http://localhost:4001/api/sync')
    console.log('   2. No re-authentication needed - tokens are preserved')
    
  } catch (error) {
    console.error('💥 Cleanup failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: tsx scripts/cleanup-all.ts [options]

Options:
  --reset-schema    Completely reset database schema (drops all tables)
  --help, -h        Show this help message

This script will:
1. Delete all events from your configured Google Calendar (GOOGLE_CALENDAR_ID)
2. Clear sync data from your local database (preserving OAuth tokens)
3. Optionally reset the database schema completely

⚠️  WARNING: This will remove events and sync data!
`)
  process.exit(0)
}

// Run the cleanup
main().catch(console.error)
