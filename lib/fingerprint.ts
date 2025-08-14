import { createHash } from 'crypto'
import { VEvent } from 'node-ical'

export interface EventFingerprintData {
  uid: string
  summary?: string
  location?: string
  description?: string
  dtstart?: Date
  dtend?: Date
  transp?: string
  status?: string
  sequence?: number
  'last-modified'?: Date
}

export function createEventFingerprint(vevent: VEvent): string {
  const fingerprintData: EventFingerprintData = {
    uid: vevent.uid || '',
    summary: vevent.summary,
    location: vevent.location,
    description: vevent.description,
    dtstart: vevent.start,
    dtend: vevent.end,
    transp: vevent.transparency,
    status: vevent.status,
    sequence: vevent.sequence,
    'last-modified': vevent.lastmodified,
  }

  // Create a stable JSON string (sorted keys)
  const jsonString = JSON.stringify(fingerprintData, Object.keys(fingerprintData).sort())
  
  // Hash the JSON string
  return createHash('sha256').update(jsonString).digest('hex')
}
