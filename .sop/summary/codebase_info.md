# Codebase Information

## Project Overview
- **Name**: outlook-ics-google-sync
- **Version**: 0.1.0
- **Type**: Next.js 15 Application
- **Purpose**: Syncs Office 365 ICS feeds to Google Calendar with intelligent filtering

## Technology Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM
- **Styling**: Tailwind CSS
- **Authentication**: Google OAuth2
- **External APIs**: Google Calendar API, Office 365 ICS feeds
- **Parsing**: node-ical for ICS processing

## Directory Structure
```
/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (54 endpoints)
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Main dashboard
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── SyncCard.tsx       # Sync status display
│   └── ChangesTable.tsx   # Event changes table
├── lib/                   # Core business logic
│   ├── sync.ts           # Main sync orchestration
│   ├── google.ts         # Google Calendar integration
│   ├── ics.ts            # ICS feed parsing
│   ├── rate-limiter.ts   # API rate limiting
│   ├── fingerprint.ts    # Event change detection
│   └── db.ts             # Database connection
├── prisma/               # Database schema and migrations
│   ├── schema.prisma     # Database schema
│   └── dev.db           # SQLite database
├── scripts/              # Utility scripts
└── requirements/         # Project requirements
```

## Key Dependencies
- **@prisma/client**: Database ORM
- **googleapis**: Google Calendar API client
- **node-ical**: ICS feed parsing
- **date-fns**: Date manipulation
- **zod**: Runtime type validation
- **next**: React framework

## Programming Languages Detected
- **TypeScript**: Primary language (100% coverage)
- **CSS**: Styling (Tailwind CSS)
- **SQL**: Database schema (Prisma)

## Architecture Patterns
- **API-first design**: Extensive API routes for all operations
- **Component-based UI**: React components with TypeScript
- **Database-first**: Prisma ORM with SQLite
- **Event-driven sync**: Change detection with fingerprinting
- **OAuth2 authentication**: Google Calendar integration
