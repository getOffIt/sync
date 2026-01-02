# Key Processes and Workflows

## Primary Sync Workflow

### 1. Complete Sync Process (#workflow #sync)

The main synchronization workflow orchestrates the entire process from ICS fetch to Google Calendar updates.

```mermaid
flowchart TD
    A[Sync Triggered] --> B[Fetch ICS Feed]
    B --> C[Parse ICS Events]
    C --> D[Apply Event Filters]
    D --> E[Generate Fingerprints]
    E --> F[Load Existing Mappings]
    F --> G[Compare Changes]
    G --> H{Changes Detected?}
    H -->|Yes| I[Update Google Calendar]
    H -->|No| J[Skip Event]
    I --> K[Update Database Mapping]
    J --> L[Continue to Next Event]
    K --> L
    L --> M{More Events?}
    M -->|Yes| G
    M -->|No| N[Clean Up Deleted Events]
    N --> O[Log Sync Results]
    O --> P[Complete Sync]
```

**Key Steps**:
1. **ICS Fetch**: Download and parse Office 365 ICS feed
2. **Event Filtering**: Apply business rules to skip unwanted events
3. **Change Detection**: Compare fingerprints to detect modifications
4. **Google API Operations**: Create, update, or delete events
5. **Database Updates**: Maintain mapping and logging records
6. **Cleanup**: Remove mappings for deleted events

### 2. Event Processing Pipeline (#workflow #events)

Each event goes through a standardized processing pipeline:

```mermaid
sequenceDiagram
    participant Parser as ICS Parser
    participant Filter as Event Filter
    participant Finger as Fingerprint Gen
    participant DB as Database
    participant Google as Google API
    participant Logger as Sync Logger
    
    Parser->>Filter: Raw Event
    Filter->>Filter: Apply Skip Rules
    alt Event Skipped
        Filter->>Logger: Log Skip Reason
    else Event Processed
        Filter->>Finger: Filtered Event
        Finger->>DB: Check Existing Mapping
        DB-->>Finger: Current Fingerprint
        Finger->>Finger: Compare Fingerprints
        alt No Changes
            Finger->>Logger: Log No Change
        else Changes Detected
            Finger->>Google: Update Event
            Google-->>Finger: Event ID
            Finger->>DB: Update Mapping
            Finger->>Logger: Log Success
        end
    end
```

## Authentication Workflow

### 1. OAuth 2.0 Flow (#workflow #auth)

Complete OAuth authentication process for Google Calendar access:

```mermaid
sequenceDiagram
    participant User as User
    participant App as Application
    participant Google as Google OAuth
    participant DB as Database
    
    User->>App: Click "Connect Calendar"
    App->>Google: Initiate OAuth (/oauth/initiate)
    Google-->>User: Redirect to Consent Screen
    User->>Google: Grant Permissions
    Google->>App: Authorization Code (/oauth/callback)
    App->>Google: Exchange Code for Tokens
    Google-->>App: Access + Refresh Tokens
    App->>DB: Store Tokens
    App-->>User: Success Confirmation
    
    Note over App,DB: Tokens automatically refreshed when expired
```

**OAuth Scopes Required**:
- `https://www.googleapis.com/auth/calendar` - Full calendar access
- `https://www.googleapis.com/auth/calendar.events` - Event management

### 2. Token Management Workflow (#workflow #auth)

Automatic token refresh and error handling:

```mermaid
stateDiagram-v2
    [*] --> CheckToken
    CheckToken --> ValidToken : Token exists & valid
    CheckToken --> ExpiredToken : Token expired
    CheckToken --> NoToken : No token found
    
    ValidToken --> APICall : Use existing token
    ExpiredToken --> RefreshToken : Auto refresh
    NoToken --> OAuthFlow : Redirect to auth
    
    RefreshToken --> ValidToken : Refresh success
    RefreshToken --> OAuthFlow : Refresh failed
    
    APICall --> Success : API call succeeds
    APICall --> TokenError : 401/403 error
    TokenError --> RefreshToken : Retry with refresh
    
    Success --> [*]
    OAuthFlow --> [*]
```

## Event Filtering Workflow

### 1. Multi-Stage Filtering Process (#workflow #filtering)

Events are filtered through multiple stages to ensure only relevant events are synced:

```mermaid
flowchart TD
    A[Raw ICS Event] --> B{Has Summary?}
    B -->|No| C[Skip - No Title]
    B -->|Yes| D{Check Skip Titles}
    D -->|Match Found| E[Skip - Title Match]
    D -->|No Match| F{Check Attendee Status}
    F -->|Declined| G[Skip - Declined]
    F -->|Tentative| H[Skip - Tentative]
    F -->|Accepted/None| I{Check Busy Status}
    I -->|Free/Transparent| J[Skip - Free Time]
    I -->|Busy| K[Include Event]
    
    C --> L[Log Skip Reason]
    E --> L
    G --> L
    H --> L
    J --> L
    K --> M[Process Event]
```

**Filter Categories**:

1. **Title-Based Filtering**:
   - Skip events with "Canceled:" or "Declined:" prefixes
   - Custom skip titles from `SKIP_EVENT_TITLES` environment variable

2. **Attendee Status Filtering**:
   - Skip if user has declined (`PARTSTAT=DECLINED`)
   - Skip if status is tentative (`X-MICROSOFT-CDO-BUSYSTATUS=TENTATIVE`)

3. **Availability Filtering**:
   - Skip free/transparent time blocks
   - Skip events marked as not busy

### 2. Recurring Event Handling (#workflow #recurring)

Special workflow for recurring events and exceptions:

```mermaid
flowchart TD
    A[Parse Event] --> B{Has RRULE?}
    B -->|Yes| C[Recurring Event]
    B -->|No| D{Has RECURRENCE-ID?}
    D -->|Yes| E[Exception Event]
    D -->|No| F[Single Event]
    
    C --> G[Create Master Event]
    G --> H[Store Recurring Mapping]
    
    E --> I[Find Master Event]
    I --> J{Master Exists?}
    J -->|Yes| K[Create Exception]
    J -->|No| L[Create Standalone]
    K --> M[Link to Master]
    
    F --> N[Standard Processing]
    H --> O[Continue Processing]
    M --> O
    L --> O
    N --> O
```

## Error Handling Workflows

### 1. Graceful Error Recovery (#workflow #errors)

The system implements comprehensive error handling with graceful degradation:

```mermaid
sequenceDiagram
    participant Sync as Sync Process
    participant Google as Google API
    participant DB as Database
    participant Logger as Error Logger
    
    Sync->>Google: API Request
    alt Success
        Google-->>Sync: Success Response
        Sync->>DB: Update Mapping
    else Rate Limited
        Google-->>Sync: 429 Rate Limit
        Sync->>Sync: Wait & Retry
        Sync->>Google: Retry Request
    else Auth Error
        Google-->>Sync: 401 Unauthorized
        Sync->>Sync: Refresh Token
        Sync->>Google: Retry with New Token
    else Event Error
        Google-->>Sync: 400 Bad Request
        Sync->>Logger: Log Event Error
        Sync->>Sync: Continue with Next Event
    else Critical Error
        Google-->>Sync: 500 Server Error
        Sync->>Logger: Log Critical Error
        Sync->>Sync: Abort Sync
    end
```

**Error Categories**:
- **Recoverable**: Rate limits, temporary auth issues
- **Event-Specific**: Invalid event data, conflicts
- **Critical**: Service unavailable, network failures

### 2. Partial Sync Recovery (#workflow #recovery)

When sync fails partially, the system maintains consistency:

```mermaid
stateDiagram-v2
    [*] --> SyncStarted
    SyncStarted --> ProcessingEvents
    ProcessingEvents --> EventSuccess : Event processed
    ProcessingEvents --> EventError : Event failed
    EventSuccess --> ProcessingEvents : More events
    EventError --> LogError : Record error
    LogError --> ProcessingEvents : Continue sync
    ProcessingEvents --> PartialComplete : Some failures
    ProcessingEvents --> FullSuccess : All success
    PartialComplete --> [*] : Return partial results
    FullSuccess --> [*] : Return success
```

## Operational Workflows

### 1. Manual Sync Trigger (#workflow #manual)

User-initiated synchronization through the dashboard:

```mermaid
sequenceDiagram
    participant UI as Dashboard UI
    participant API as Sync API
    participant Sync as Sync Logic
    participant DB as Database
    
    UI->>API: POST /api/sync
    API->>DB: Check Auth Status
    alt Not Authenticated
        DB-->>API: No valid tokens
        API-->>UI: Redirect to OAuth
    else Authenticated
        DB-->>API: Valid tokens
        API->>Sync: Trigger syncOnce()
        Sync->>Sync: Execute Full Sync
        Sync-->>API: Sync Results
        API-->>UI: Display Results
    end
```

### 2. Automated Sync Scheduling (#workflow #automation)

Scheduled synchronization for continuous updates:

**Vercel Cron Jobs**:
```typescript
// vercel.json configuration
{
  "crons": [{
    "path": "/api/cron",
    "schedule": "0 7 * * *"  // Daily at 7 AM
  }]
}
```

**Self-Hosted Cron**:
```mermaid
graph LR
    A[System Cron] --> B[Node Cron Script]
    B --> C[Import Sync Logic]
    C --> D[Execute syncOnce()]
    D --> E[Log Results]
    E --> F[Handle Errors]
```

### 3. Cleanup and Maintenance (#workflow #maintenance)

Regular maintenance operations for data consistency:

```mermaid
flowchart TD
    A[Cleanup Triggered] --> B[Scan Database Mappings]
    B --> C[Check Google Calendar]
    C --> D{Event Still Exists?}
    D -->|Yes| E[Keep Mapping]
    D -->|No| F[Remove Mapping]
    E --> G[Continue Scan]
    F --> H[Log Deletion]
    H --> G
    G --> I{More Mappings?}
    I -->|Yes| C
    I -->|No| J[Cleanup Complete]
```

**Cleanup Operations**:
- Remove orphaned mappings
- Clean up old sync logs
- Validate token expiration
- Database optimization

## Development and Debug Workflows

### 1. Debug API Workflow (#workflow #debug)

Extensive debugging capabilities for development:

**Debug Endpoints**:
- `/api/debug-raw-ics` - Inspect raw ICS feed
- `/api/check-cancelled` - Analyze cancelled events
- `/api/compare-events` - Compare ICS vs Google events
- `/api/debug-allday` - All-day event debugging

### 2. Testing and Validation (#workflow #testing)

Comprehensive testing workflow for sync reliability:

```mermaid
flowchart LR
    A[Test Trigger] --> B[Fetch Test ICS]
    B --> C[Parse Events]
    C --> D[Apply Filters]
    D --> E[Validate Results]
    E --> F[Compare Expected]
    F --> G[Generate Report]
```

**Test Categories**:
- Event parsing accuracy
- Filter rule validation
- Google API integration
- Error handling scenarios
- Performance benchmarks
