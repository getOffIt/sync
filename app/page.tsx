'use client'

import { useState, useEffect } from 'react'
import SyncCard from '@/components/SyncCard'
import ChangesTable from '@/components/ChangesTable'

interface SyncStatus {
  lastSync: {
    id: number
    startedAt: string
    finishedAt: string | null
    status: 'SUCCESS' | 'ERROR' | 'PARTIAL'
    summary: string
    created: number
    updated: number
    deleted: number
    errors: string[] | null
  } | null
  isConnected: boolean
  config: {
    icsUrl: string
    calendarId: string
    myEmail: string
  }
}

interface SyncLog {
  id: number
  startedAt: string
  finishedAt: string | null
  status: 'SUCCESS' | 'ERROR' | 'PARTIAL'
  summary: string
  created: number
  updated: number
  deleted: number
  errors: string[] | null
}

export default function Home() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/status')
      const result = await response.json()
      
      if (result.success) {
        setStatus(result.data)
      } else {
        setError(result.error || 'Failed to fetch status')
      }
    } catch (error) {
      setError('Failed to fetch status')
    }
  }

  const fetchSyncLogs = async () => {
    try {
      // For now, we'll get the last 20 sync logs from the status endpoint
      // In a real app, you might want a separate endpoint for this
      const response = await fetch('/api/status')
      const result = await response.json()
      
      if (result.success && result.data.lastSync) {
        // For simplicity, we'll just show the last sync
        // You could extend this to fetch multiple logs
        setSyncLogs([result.data.lastSync])
      }
    } catch (error) {
      console.error('Failed to fetch sync logs:', error)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchStatus(), fetchSyncLogs()])
      setLoading(false)
    }
    
    loadData()
  }, [])

  const handleSync = async () => {
    await Promise.all([fetchStatus(), fetchSyncLogs()])
  }

  const handleConnect = () => {
    window.location.href = '/api/google/oauth/initiate'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">❌ Error</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600 text-xl mb-4">No status available</div>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <SyncCard
              status={status}
              onSync={handleSync}
              onConnect={handleConnect}
            />
          </div>
          <div>
            <ChangesTable syncLogs={syncLogs} />
          </div>
        </div>
      </div>
    </div>
  )
}
