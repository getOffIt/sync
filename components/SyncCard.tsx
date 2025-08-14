'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'

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

interface SyncCardProps {
  status: SyncStatus
  onSync: () => void
  onConnect: () => void
}

export default function SyncCard({ status, onSync, onConnect }: SyncCardProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSync = async () => {
    setIsSyncing(true)
    setMessage(null)
    
    try {
      const response = await fetch('/api/sync', { method: 'POST' })
      const result = await response.json()
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Sync completed successfully!' })
        onSync() // Refresh status
      } else {
        setMessage({ type: 'error', text: result.error || 'Sync failed' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to sync. Please try again.' })
    } finally {
      setIsSyncing(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS': return 'text-green-600'
      case 'ERROR': return 'text-red-600'
      case 'PARTIAL': return 'text-yellow-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return '✅'
      case 'ERROR': return '❌'
      case 'PARTIAL': return '⚠️'
      default: return '❓'
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {process.env.NEXT_PUBLIC_APP_NAME || 'Outlook ICS → Google Sync'}
        </h2>
        <div className="flex items-center space-x-2">
          <span className={`text-sm font-medium ${status.isConnected ? 'text-green-600' : 'text-red-600'}`}>
            {status.isConnected ? '✅ Connected' : '❌ Not Connected'}
          </span>
        </div>
      </div>

      {/* Configuration Display */}
      <div className="space-y-3 mb-6">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-sm font-medium text-gray-700 mb-1">ICS URL</div>
          <div className="text-sm text-gray-600 break-all">{status.config.icsUrl}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-sm font-medium text-gray-700 mb-1">Google Calendar ID</div>
          <div className="text-sm text-gray-600">{status.config.calendarId}</div>
        </div>
        {status.config.myEmail && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm font-medium text-gray-700 mb-1">My Email (for filtering)</div>
            <div className="text-sm text-gray-600">{status.config.myEmail}</div>
          </div>
        )}
      </div>

      {/* Last Sync Status */}
      {status.lastSync && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-900">Last Sync</h3>
            <span className={`text-sm font-medium ${getStatusColor(status.lastSync.status)}`}>
              {getStatusIcon(status.lastSync.status)} {status.lastSync.status}
            </span>
          </div>
          <div className="text-sm text-gray-600 mb-2">
            {format(new Date(status.lastSync.startedAt), 'PPP p')}
          </div>
          <div className="text-sm text-gray-600 mb-2">{status.lastSync.summary}</div>
          {status.lastSync.errors && status.lastSync.errors.length > 0 && (
            <div className="text-sm text-red-600">
              Errors: {status.lastSync.errors.length}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        {!status.isConnected ? (
          <button
            onClick={onConnect}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            Connect Google Calendar
          </button>
        ) : (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  )
}
