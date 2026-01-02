# External Dependencies and Usage

## Core Framework Dependencies

### 1. Next.js 15 (#dependencies #framework)

**Version**: 15.0.0  
**Purpose**: React framework with App Router for full-stack application  
**Usage**: Application foundation, API routes, server-side rendering

**Key Features Used**:
- App Router for file-based routing
- API routes for backend functionality
- Server-side rendering for dashboard
- Built-in TypeScript support
- Automatic code splitting

**Configuration**:
```javascript
// next.config.js
module.exports = {
  experimental: {
    appDir: true
  }
}
```

### 2. React 18 (#dependencies #ui)

**Version**: ^18  
**Purpose**: UI library for component-based frontend  
**Usage**: Dashboard components, state management, user interactions

**Components Used**:
- Functional components with hooks
- useState for local state management
- useEffect for side effects
- Custom hooks for API integration

## Database and ORM Dependencies

### 1. Prisma ORM (#dependencies #database)

**Version**: ^5.7.1  
**Purpose**: Type-safe database client and schema management  
**Usage**: Database operations, migrations, type generation

**Key Features**:
- SQLite database support
- Automatic TypeScript type generation
- Migration management
- Query optimization
- Connection pooling

**Schema Management**:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

**Usage Pattern**:
```typescript
import { prisma } from './lib/db'

// Type-safe database operations
const mapping = await prisma.mapping.findUnique({
  where: { uid: eventUid }
})
```

### 2. SQLite Database (#dependencies #storage)

**Purpose**: Lightweight, file-based database for single-user application  
**Usage**: Event mappings, OAuth tokens, sync logs

**Advantages**:
- No server setup required
- ACID compliance
- Cross-platform compatibility
- Backup via file copy

## External API Dependencies

### 1. Google APIs Client (#dependencies #integration)

**Package**: googleapis  
**Version**: ^133.0.0  
**Purpose**: Google Calendar API integration and OAuth 2.0 authentication

**Services Used**:
- Google Calendar API v3
- OAuth 2.0 authentication
- Token refresh management

**Usage Pattern**:
```typescript
import { google } from 'googleapis'

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
)

const calendar = google.calendar({ 
  version: 'v3', 
  auth: oauth2Client 
})
```

**API Endpoints**:
- `calendar.events.list()` - Fetch events
- `calendar.events.insert()` - Create events
- `calendar.events.update()` - Update events
- `calendar.events.delete()` - Delete events

### 2. ICS Feed Parser (#dependencies #parsing)

**Package**: node-ical  
**Version**: ^0.17.1  
**Purpose**: Parse iCalendar (ICS) format from Office 365 feeds

**Features Used**:
- RFC 5545 iCalendar parsing
- VEVENT object extraction
- Recurring event support (RRULE)
- Exception handling (EXDATE)
- Timezone processing

**Usage Pattern**:
```typescript
import { parseICS } from 'node-ical'

const response = await fetch(icsUrl)
const icsData = await response.text()
const parsed = parseICS(icsData)
```

## Utility Dependencies

### 1. Date Manipulation (#dependencies #utilities)

**Package**: date-fns  
**Version**: ^3.0.6  
**Purpose**: Date/time manipulation and formatting

**Functions Used**:
- Date parsing and formatting
- Timezone conversions
- Date arithmetic
- ISO 8601 string handling

**Usage Examples**:
```typescript
import { format, parseISO, addDays } from 'date-fns'

const formattedDate = format(new Date(), 'yyyy-MM-dd')
const parsedDate = parseISO(isoString)
```

### 2. Runtime Validation (#dependencies #validation)

**Package**: zod  
**Version**: ^3.22.4  
**Purpose**: Runtime type validation and schema parsing

**Usage**:
- Environment variable validation
- API request/response validation
- Configuration schema validation

**Schema Examples**:
```typescript
import { z } from 'zod'

const ConfigSchema = z.object({
  ICS_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CALENDAR_ID: z.string().email()
})
```

### 3. Environment Configuration (#dependencies #config)

**Package**: dotenv  
**Version**: ^17.2.3  
**Purpose**: Environment variable loading from .env files

**Configuration**:
```typescript
import 'dotenv/config'

const config = {
  icsUrl: process.env.ICS_URL,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  // ... other environment variables
}
```

## Development Dependencies

### 1. TypeScript Ecosystem (#dependencies #development)

**Packages**:
- `typescript`: ^5 - TypeScript compiler
- `@types/node`: ^20 - Node.js type definitions
- `@types/react`: ^18 - React type definitions
- `@types/react-dom`: ^18 - React DOM type definitions

**Configuration**:
```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "jsx": "preserve"
  }
}
```

### 2. Code Quality Tools (#dependencies #quality)

**ESLint Configuration**:
- `eslint`: ^8 - JavaScript/TypeScript linting
- `eslint-config-next`: 15.0.0 - Next.js specific rules

**Usage**: Automatic code quality checks and formatting

### 3. Build and Runtime Tools (#dependencies #build)

**Packages**:
- `tsx`: ^4.6.2 - TypeScript execution for scripts
- `autoprefixer`: ^10.0.1 - CSS vendor prefixing
- `postcss`: ^8 - CSS processing

## Styling Dependencies

### 1. Tailwind CSS (#dependencies #styling)

**Package**: tailwindcss  
**Version**: ^3.3.0  
**Purpose**: Utility-first CSS framework

**Configuration**:
```javascript
// tailwind.config.ts
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### 2. Tailwind Forms Plugin (#dependencies #forms)

**Package**: @tailwindcss/forms  
**Version**: ^0.5.7  
**Purpose**: Enhanced form styling with Tailwind CSS

**Usage**: Automatic form element styling and normalization

## Dependency Management Patterns

### 1. Version Pinning Strategy (#dependencies #management)

**Exact Versions**: Critical dependencies (Next.js, Prisma)
**Caret Ranges**: Stable utilities (date-fns, zod)
**Tilde Ranges**: Development tools (ESLint, TypeScript)

### 2. Security Considerations (#dependencies #security)

**Regular Updates**: Monthly dependency audits
**Vulnerability Scanning**: npm audit integration
**Minimal Dependencies**: Only essential packages included

### 3. Bundle Size Optimization (#dependencies #performance)

**Tree Shaking**: Automatic unused code elimination
**Dynamic Imports**: Lazy loading for non-critical features
**Dependency Analysis**: Regular bundle size monitoring

## External Service Dependencies

### 1. Google Cloud Platform (#dependencies #services)

**Services Used**:
- Google Calendar API
- Google OAuth 2.0 service
- Google Cloud Console for API management

**Requirements**:
- Google Cloud project with Calendar API enabled
- OAuth 2.0 credentials (Client ID/Secret)
- Authorized redirect URIs configured

### 2. Office 365 Integration (#dependencies #services)

**Service**: Microsoft Office 365 Calendar
**Protocol**: ICS (iCalendar) feed via HTTPS/webcal
**Format**: RFC 5545 compliant iCalendar data

**Requirements**:
- Published calendar with public ICS URL
- Network access to Office 365 servers
- Standard iCalendar format compliance

## Runtime Environment Dependencies

### 1. Node.js Runtime (#dependencies #runtime)

**Version**: Node.js 18+ (LTS recommended)
**Features Used**:
- ES modules support
- Fetch API (Node 18+)
- File system operations
- HTTP/HTTPS client

### 2. Operating System Support (#dependencies #platform)

**Supported Platforms**:
- macOS (development and production)
- Linux (production deployment)
- Windows (development with WSL recommended)

**File System Requirements**:
- SQLite database file storage
- Environment variable file (.env.local)
- Log file directory access

## Deployment Dependencies

### 1. Vercel Platform (#dependencies #deployment)

**Features Used**:
- Serverless function deployment
- Automatic builds from Git
- Environment variable management
- Cron job scheduling

### 2. Self-Hosted Requirements (#dependencies #selfhosted)

**System Dependencies**:
- Node.js runtime environment
- Process manager (PM2, systemd)
- Reverse proxy (nginx, Apache)
- SSL certificate management

**Optional Dependencies**:
- Docker for containerization
- Database backup tools
- Monitoring and logging systems
