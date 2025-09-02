# Outlook ICS → Google Calendar Sync

A Next.js 15 application that syncs an Office 365 published ICS feed to Google Calendar with intelligent filtering and change detection.

## Features

- 🔄 **One-way sync** from ICS to Google Calendar
- 🎯 **Smart filtering**: Skip free/transparent events and declined meetings
- 🔍 **Change detection**: Only updates events that have actually changed
- 📊 **Dashboard**: Beautiful UI with sync status and history
- 🔐 **OAuth2**: Secure Google Calendar authentication
- 📝 **Logging**: Detailed sync logs with error tracking
- ⏰ **Scheduling**: Support for daily automated syncs

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Prisma** (SQLite)
- **Google Calendar API**
- **node-ical** (ICS parsing)

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd outlook-ics-google-sync
npm install
```

### 2. Environment Setup

Create a `.env.local` file:

```env
# Database
DATABASE_URL="file:./dev.db"

# App Configuration
NEXT_PUBLIC_APP_NAME="Outlook ICS → Google Sync"
ICS_URL="webcal://outlook.office365.com/.../calendar.ics"
GOOGLE_CALENDAR_ID="your@gmail.com"
MY_EMAIL="your.email@company.com"
SKIP_EVENT_TITLES="Team Standup,Weekly Review,All Hands"  # Comma-separated list of event titles to skip (optional)

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:4001/api/google/oauth/callback"
```

### 3. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials
5. Add `http://localhost:4001/api/google/oauth/callback` to authorized redirect URIs
6. Copy Client ID and Client Secret to your `.env.local`

### 4. Database Setup

```bash
npx prisma generate
npx prisma db push
```

### 5. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:4001` and click "Connect Google Calendar" to start.

## Configuration

### Skipping Specific Events

You can configure the app to skip specific events by title using the `SKIP_EVENT_TITLES` environment variable:

```bash
SKIP_EVENT_TITLES="Team Standup,Weekly Review,All Hands"
```

This is useful for filtering out meetings you don't want to sync to Google Calendar. The app will automatically skip events with titles that contain any of the specified strings.

## Usage

### Manual Sync

1. Connect your Google Calendar using the OAuth flow
2. Click "Sync Now" to manually sync your ICS feed
3. View sync results and history in the dashboard

### Automated Sync

#### Vercel Deployment

For Vercel, use their [Cron Jobs](https://vercel.com/docs/cron-jobs):

```typescript
// app/api/cron/route.ts
import { syncOnce } from '@/lib/sync'

export async function GET() {
  await syncOnce()
  return new Response('OK')
}
```

Add to `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron",
    "schedule": "0 7 * * *"
  }]
}
```

#### Self-hosted

Install `node-cron`:

```bash
npm install node-cron
```

Create a cron job file:

```typescript
// scripts/cron.ts
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
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ICS_URL` | Your Office 365 ICS feed URL | Yes |
| `GOOGLE_CALENDAR_ID` | Target Google Calendar ID | Yes |
| `MY_EMAIL` | Your email for decline filtering | No |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | Yes |
| `GOOGLE_REDIRECT_URI` | OAuth redirect URI | Yes |

### Filtering Rules

The app automatically filters out:

- **Free/Transparent events**: Events marked as `TRANSP:TRANSPARENT` or `X-MICROSOFT-CDO-BUSYSTATUS:FREE`
- **Declined meetings**: Events where you're an attendee with `PARTSTAT=DECLINED` (requires `MY_EMAIL`)

## API Endpoints

- `POST /api/sync` - Manual sync trigger
- `GET /api/status` - Get sync status and configuration
- `GET /api/google/oauth/initiate` - Start OAuth flow
- `GET /api/google/oauth/callback` - OAuth callback handler

## Database Schema

- **Mapping**: Maps ICS UIDs to Google Event IDs with fingerprints
- **Token**: Stores Google OAuth tokens (single row)
- **SyncLog**: Tracks sync history and results

## Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push database schema
npx prisma db push

# Open Prisma Studio
npx prisma studio

# Run development server
npm run dev

# Build for production
npm run build
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Update `GOOGLE_REDIRECT_URI` to your production URL
5. Deploy

### Self-hosted

1. Build the application: `npm run build`
2. Start production server: `npm start`
3. Set up reverse proxy (nginx/Apache)
4. Configure SSL certificates
5. Set up cron job for automated syncs

## Cleanup and Reset

### Complete Cleanup Script

When testing sync functionality or debugging issues, you may need to start with a clean slate. The app includes a comprehensive cleanup script that wipes both the local database and Google Calendar:

```bash
# Using npm script (recommended)
npm run cleanup:all

# Or run directly
./scripts/cleanup-all.sh

# For complete database schema reset
npm run cleanup:all -- --reset-schema
```

**⚠️ WARNING: This will delete ALL data from both systems!**

The cleanup script will:
1. Delete all events from your Google Calendar
2. Clear all data from your local database
3. Optionally reset the database schema completely

After cleanup, you'll need to:
1. Run a fresh sync to populate both systems

### Manual Cleanup

```bash
# Clean database only
npm run cleanup

# Reset database schema
npx prisma db push --force-reset
```

## Troubleshooting

### Common Issues

1. **OAuth errors**: Ensure redirect URI matches exactly
2. **ICS fetch failures**: Check if ICS URL is accessible
3. **Database errors**: Run `npx prisma db push` to update schema
4. **Sync failures**: Check Google Calendar permissions

### Logs

Sync logs are stored in the database and visible in the dashboard. Check the browser console for client-side errors.

## License

MIT License - see LICENSE file for details.
