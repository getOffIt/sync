import cron from 'node-cron'
import { syncOnce } from '../lib/sync'

// Run sync daily at 7:00 AM
cron.schedule('0 7 * * *', async () => {
  console.log('Running scheduled sync...')
  try {
    const result = await syncOnce()
    console.log('Sync completed:', result)
  } catch (error) {
    console.error('Sync failed:', error)
  }
})

console.log('Cron job scheduled for daily sync at 7:00 AM')
console.log('Press Ctrl+C to stop')

// Keep the process running
process.on('SIGINT', () => {
  console.log('Stopping cron job...')
  process.exit(0)
})
