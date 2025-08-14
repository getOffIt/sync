import { parseICS, VEvent } from 'node-ical'

export interface ParsedEvent {
  uid: string
  vevent: VEvent
  fingerprint: string
}

export interface ICSFilterOptions {
  myEmail?: string
  onlyToday?: boolean // New option for testing
}
// Instruction: Never skip transparent events (free time)
export function shouldSkipEvent(vevent: VEvent, options: ICSFilterOptions = {}): boolean {
  // Skip specific events by title
  // Also skip events where the user hasn't accepted the invitation (only include ACCEPTED events)
  const skipTitles = [
    'Canceled:', // removed cancelled events
    'Declined:' // removed events marked at declined events
  ]
  
  // Add custom skip titles from environment variable
  const customSkipTitles = process.env.SKIP_EVENT_TITLES
  if (customSkipTitles) {
    const titles = customSkipTitles.split(',').map(title => title.trim()).filter(Boolean)
    skipTitles.push(...titles)
  }
  
  if (vevent.summary) {
    for (const title of skipTitles) {
      if (vevent.summary.includes(title)) {
        return true
      }
    }
  }

  // Skip events based on attendee status if MY_EMAIL is provided
  // remove events that I have declined or haven't accepted
  if (options.myEmail) {
    // Check Microsoft-specific busy status - TENTATIVE means not confirmed
    if ((vevent as any)['x-microsoft-cdo-busystatus'] === 'TENTATIVE' || 
        (vevent as any)['MICROSOFT-CDO-BUSYSTATUS'] === 'TENTATIVE' || 
        (vevent as any)['X-MICROSOFT-CDO-BUSYSTATUS'] === 'TENTATIVE' || 
        (vevent as any)['microsoft-cdo-busystatus'] === 'TENTATIVE') {
      return true
    }
    
    // Check attendee status for events with attendees
    if (vevent.attendee) {
      const attendees = Array.isArray(vevent.attendee) ? vevent.attendee : [vevent.attendee]
      
      for (const attendee of attendees) {
        if (typeof attendee === 'string') {
          if (attendee.toLowerCase() === options.myEmail.toLowerCase()) {
            // For string attendees, we can't check PARTSTAT, so skip to be safe
            return true
          }
        } else if (attendee.val && attendee.val.toLowerCase().replace('mailto:', '') === options.myEmail.toLowerCase()) {
          const partstat = attendee.params?.PARTSTAT
          // Skip events that are declined, need action, or have no response status
          if (partstat === 'DECLINED' || partstat === 'NEEDS-ACTION' || !partstat) {
            return true
          }
          // Only include events that are explicitly accepted
          if (partstat !== 'ACCEPTED') {
            return true
          }
        }
      }
    }
  }

  return false
}

// Simple RRULE parser for common patterns
function parseRRULE(rruleStr: string, startDate: Date, exdates: string[] = []): Date[] {
  const occurrences: Date[] = []
  
  // Extract the actual RRULE part
  const rruleMatch = rruleStr.match(/RRULE:(.+)/)
  if (!rruleMatch) return occurrences
  
  const rrule = rruleMatch[1]
  
  // Parse common RRULE patterns
  if (rrule.includes('FREQ=WEEKLY')) {
    // Weekly recurring events
    const untilMatch = rrule.match(/UNTIL=(\d{8}T\d{6})/)
    const bydayMatch = rrule.match(/BYDAY=([A-Z,]+)/)
    
    if (bydayMatch) {
      const days = bydayMatch[1].split(',')
      const dayMap: { [key: string]: number } = {
        'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6, 'SU': 0
      }
      
      let currentDate = new Date(startDate)
      const endDate = untilMatch ? new Date(untilMatch[1].replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')) : new Date(currentDate.getTime() + 90 * 24 * 60 * 60 * 1000)
      
      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay()
        const dayStr = Object.keys(dayMap).find(key => dayMap[key] === dayOfWeek)
        
        if (dayStr && days.includes(dayStr)) {
          // Check if this date is in the exdates list
          const currentDateStr = currentDate.toISOString().split('T')[0]
          const isExcluded = exdates.includes(currentDateStr)
          
          if (!isExcluded) {
            occurrences.push(new Date(currentDate))
          }
        }
        
        currentDate.setDate(currentDate.getDate() + 1)
      }
    }
  } else if (rrule.includes('FREQ=MONTHLY')) {
    // Monthly recurring events
    const untilMatch = rrule.match(/UNTIL=(\d{8}T\d{6})/)
    const bymonthdayMatch = rrule.match(/BYMONTHDAY=(\d+)/)
    
    if (bymonthdayMatch) {
      const dayOfMonth = parseInt(bymonthdayMatch[1])
      let currentDate = new Date(startDate)
      const endDate = untilMatch ? new Date(untilMatch[1].replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')) : new Date(currentDate.getTime() + 90 * 24 * 60 * 60 * 1000)
      
      while (currentDate <= endDate) {
        if (currentDate.getDate() === dayOfMonth) {
          // Check if this date is in the exdates list
          const currentDateStr = currentDate.toISOString().split('T')[0]
          const isExcluded = exdates.includes(currentDateStr)
          
          if (!isExcluded) {
            occurrences.push(new Date(currentDate))
          }
        }
        
        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1)
        currentDate.setDate(dayOfMonth)
      }
    }
  }
  
  return occurrences
}

// Helper function to parse EXDATE field
function parseEXDATE(exdateObj: any): string[] {
  const exdates: string[] = []
  
  if (exdateObj && typeof exdateObj === 'object') {
    // node-ical parses EXDATE as an object with date keys
    for (const dateKey of Object.keys(exdateObj)) {
      // The dateKey is already in "YYYY-MM-DD" format
      exdates.push(dateKey)
    }
  }
  
  return exdates
}

// Helper function to expand recurring events
function expandRecurringEvents(calendar: any, startDate: Date, endDate: Date): VEvent[] {
  const expandedEvents: VEvent[] = []
  const seenEvents = new Set<string>() // Track unique events to avoid duplicates
  
  for (const [uid, event] of Object.entries(calendar)) {
    if (event && typeof event === 'object' && 'type' in event && event.type === 'VEVENT') {
      const vevent = event as VEvent
      const originalEvent = event as any
      
      // Check if this is a recurring event by looking for RRULE in the original data
      if (originalEvent.rrule && originalEvent.rrule.toString) {
        const rruleStr = originalEvent.rrule.toString()
        
        // Parse EXDATE if present
        let exdates: string[] = []
        if (originalEvent.exdate) {
          exdates = parseEXDATE(originalEvent.exdate)
        }
        
        const occurrences = parseRRULE(rruleStr, vevent.start || new Date(), exdates)
        
        for (const occurrence of occurrences) {
          if (occurrence >= startDate && occurrence <= endDate) {
            // Get the original event's time components
            const originalStart = vevent.start ? new Date(vevent.start) : new Date()
            const originalEnd = vevent.end ? new Date(vevent.end) : new Date(originalStart.getTime() + 60 * 60 * 1000)
            
            // Create new start and end times for the occurrence
            const newStart = new Date(occurrence)
            newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds(), originalStart.getMilliseconds())
            
            const newEnd = new Date(occurrence)
            newEnd.setHours(originalEnd.getHours(), originalEnd.getMinutes(), originalEnd.getSeconds(), originalEnd.getMilliseconds())
            
            // Create a new event with the occurrence date and proper time range
            const newEvent: VEvent = {
              ...vevent,
              start: newStart as any,
              end: newEnd as any
            }
            
            // Ensure we have valid start and end times
            if (newEvent.start && newEvent.end && newEvent.start < newEvent.end) {
              // Create a unique key for this event to avoid duplicates
              const eventKey = `${vevent.uid}_${newStart.getTime()}_${newEvent.summary || ''}`
              
              if (!seenEvents.has(eventKey)) {
                seenEvents.add(eventKey)
                expandedEvents.push(newEvent)
              }
            }
          }
        }
        
        // Handle RECURRENCE-ID events (modified occurrences)
        // Only add these if they're not already covered by the RRULE expansion
        if (originalEvent.recurrences) {
          for (const [recurrenceDate, recurrenceEvent] of Object.entries(originalEvent.recurrences)) {
            const recurEvent = recurrenceEvent as any
            
            if (recurEvent.start && recurEvent.start >= startDate && recurEvent.start <= endDate) {
              // Create a new event for the modified occurrence
              const newEvent: VEvent = {
                ...vevent,
                start: recurEvent.start,
                end: recurEvent.end,
                summary: recurEvent.summary || vevent.summary
              }
              
              // Ensure we have valid start and end times
              if (newEvent.start && newEvent.end && newEvent.start < newEvent.end) {
                // Create a unique key for this event to avoid duplicates
                const eventKey = `${vevent.uid}_${recurEvent.start.getTime()}_${newEvent.summary || ''}`
                
                if (!seenEvents.has(eventKey)) {
                  seenEvents.add(eventKey)
                  expandedEvents.push(newEvent)
                }
              }
            }
          }
        }
      } else {
        // Non-recurring event, add it if it's in our date range
        if (vevent.start && vevent.start >= startDate && vevent.start <= endDate) {
          // Create a unique key for this event to avoid duplicates
          const eventKey = `${vevent.uid}_${vevent.start.getTime()}_${vevent.summary || ''}`
          
          if (!seenEvents.has(eventKey)) {
            seenEvents.add(eventKey)
            expandedEvents.push(vevent)
          }
        }
      }
    }
  }
  
  return expandedEvents
}

export async function fetchAndParseICS(icsUrl: string, options: ICSFilterOptions = {}): Promise<ParsedEvent[]> {
  // Convert webcal:// to https://
  const url = icsUrl.replace(/^webcal:\/\//, 'https://')
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ICS: ${response.status} ${response.statusText}`)
  }
  
  const icsData = await response.text()
  const calendar = parseICS(icsData)
  
  // Define date range for expanding recurring events (3 months back to 6 months forward)
  const now = new Date()
  const startDate = new Date(now)
  startDate.setMonth(now.getMonth() - 3) // 3 months back
  startDate.setHours(0, 0, 0, 0)
  
  const endDate = new Date(now)
  endDate.setMonth(now.getMonth() + 6) // 6 months forward
  endDate.setHours(23, 59, 59, 999)
  
  // Expand recurring events
  const expandedEvents = expandRecurringEvents(calendar, startDate, endDate)
  
  const events: ParsedEvent[] = []
  
  for (const vevent of expandedEvents) {
    // Apply filters
    if (shouldSkipEvent(vevent, options)) {
      continue
    }
    
    // Create fingerprint
    const { createEventFingerprint } = await import('./fingerprint')
    const fingerprint = createEventFingerprint(vevent)
    
    // Generate unique UID for expanded recurring events
    // Use a more stable UID that includes the original UID and a hash of the start time and summary
    const uid = vevent.uid + (vevent.start ? '_' + vevent.start.getTime() : '') + '_' + (vevent.summary ? vevent.summary.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) : '')
    
    events.push({
      uid,
      vevent,
      fingerprint
    })
  }
  
  return events
}
