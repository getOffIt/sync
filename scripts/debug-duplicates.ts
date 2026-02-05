import { fetchAndParseICSWithRecurrence } from '../lib/sync'
import { parseICS } from 'node-ical'
import { config } from 'dotenv'

// Load environment variables
config({ path: '.env.local' })

async function debugDuplicates() {
  const icsUrl = process.env.ICS_URL
  const myEmail = process.env.MY_EMAIL

  if (!icsUrl) {
    throw new Error('ICS_URL not configured')
  }

  console.log('Fetching ICS feed...\n')

  // First, let's look at the raw ICS parsing
  const url = icsUrl.replace(/^webcal:\/\//, 'https://')
  const response = await fetch(url)
  const icsData = await response.text()
  const calendar = parseICS(icsData)

  // Count events by UID
  const uidCounts = new Map<string, number>()
  const eventsByUid = new Map<string, any[]>()

  for (const [key, event] of Object.entries(calendar)) {
    if (event && typeof event === 'object' && 'type' in event && event.type === 'VEVENT') {
      const vevent = event as any
      const uid = vevent.uid

      uidCounts.set(uid, (uidCounts.get(uid) || 0) + 1)

      if (!eventsByUid.has(uid)) {
        eventsByUid.set(uid, [])
      }
      eventsByUid.get(uid)!.push(vevent)
    }
  }

  console.log('=== RAW ICS PARSING RESULTS ===')
  console.log(`Total calendar entries: ${Object.keys(calendar).length}`)
  console.log(`Unique UIDs found: ${uidCounts.size}`)
  console.log(`UIDs appearing more than once: ${Array.from(uidCounts.entries()).filter(([_, count]) => count > 1).length}\n`)

  // Show UIDs that appear multiple times
  console.log('=== UIDs APPEARING MULTIPLE TIMES IN RAW PARSE ===')
  for (const [uid, count] of uidCounts.entries()) {
    if (count > 1) {
      console.log(`\n${uid}: appears ${count} times`)
      const events = eventsByUid.get(uid)!
      events.forEach((vevent, index) => {
        console.log(`  Event ${index + 1}:`)
        console.log(`    Summary: ${vevent.summary}`)
        console.log(`    Start: ${vevent.start}`)
        console.log(`    Has RRULE: ${!!vevent.rrule}`)
        console.log(`    Has RECURRENCE-ID: ${!!(vevent['recurrence-id'] || vevent['recurrenceid'])}`)
        console.log(`    Has recurrences property: ${!!vevent.recurrences}`)
        if (vevent.recurrences) {
          console.log(`    Number of recurrences: ${Object.keys(vevent.recurrences).length}`)
        }
      })
    }
  }

  // Now parse with our logic
  console.log('\n\n=== PARSED WITH OUR LOGIC ===')
  const { parsedEvents, recurringEvents, recurringExceptions } = await fetchAndParseICSWithRecurrence(icsUrl, { myEmail })

  console.log(`Individual events: ${parsedEvents.length}`)
  console.log(`Recurring events: ${recurringEvents.length}`)
  console.log(`Recurring exceptions: ${recurringExceptions.length}`)

  // Check for duplicate synthesized exception UIDs
  const exceptionUidCounts = new Map<string, number>()
  for (const exception of recurringExceptions) {
    exceptionUidCounts.set(exception.uid, (exceptionUidCounts.get(exception.uid) || 0) + 1)
  }

  console.log('\n=== DUPLICATE SYNTHESIZED EXCEPTION UIDs ===')
  const duplicateExceptionUids = Array.from(exceptionUidCounts.entries()).filter(([_, count]) => count > 1)
  if (duplicateExceptionUids.length > 0) {
    console.log(`Found ${duplicateExceptionUids.length} duplicate exception UIDs:`)
    for (const [uid, count] of duplicateExceptionUids) {
      console.log(`  ${uid}: appears ${count} times`)
      const matchingExceptions = recurringExceptions.filter(ex => ex.uid === uid)
      matchingExceptions.forEach((ex, index) => {
        console.log(`    Exception ${index + 1}:`)
        console.log(`      Summary: ${ex.vevent.summary}`)
        console.log(`      Start: ${ex.vevent.start}`)
        console.log(`      Original UID: ${ex.originalUid}`)
        console.log(`      Exception Date: ${ex.exceptionDate}`)
      })
    }
  } else {
    console.log('No duplicate exception UIDs found')
  }

  // Look for events around the dates mentioned by the user
  console.log('\n\n=== EVENTS AROUND MENTIONED DATES ===')

  const targetDates = [
    { date: '2026-02-05', time: '13:30', description: 'SMP fortnightly meeting' },
    { date: '2026-02-09', time: '11:00', description: 'iPlayer operational check-in' },
    { date: '2026-02-12', time: '14:00', description: 'Joe/Antoine catch-up' }
  ]

  for (const target of targetDates) {
    console.log(`\n--- ${target.description} (${target.date} at ${target.time}) ---`)

    // Check individual events
    const matchingIndividual = parsedEvents.filter(e => {
      const start = e.vevent.start
      if (!start) return false
      const dateStr = start.toISOString().split('T')[0]
      return dateStr === target.date
    })

    if (matchingIndividual.length > 0) {
      console.log(`  Found ${matchingIndividual.length} individual event(s):`)
      matchingIndividual.forEach(e => {
        console.log(`    - ${e.vevent.summary} (${e.vevent.start})`)
        console.log(`      UID: ${e.uid}`)
      })
    }

    // Check recurring exceptions
    const matchingExceptions = recurringExceptions.filter(ex => {
      const start = ex.vevent.start
      if (!start) return false
      const dateStr = start.toISOString().split('T')[0]
      return dateStr === target.date
    })

    if (matchingExceptions.length > 0) {
      console.log(`  Found ${matchingExceptions.length} recurring exception(s):`)
      matchingExceptions.forEach(ex => {
        console.log(`    - ${ex.vevent.summary} (${ex.vevent.start})`)
        console.log(`      UID: ${ex.uid}`)
        console.log(`      Original UID: ${ex.originalUid}`)
      })
    }
  }
}

debugDuplicates().catch(console.error)
