# Knowledge Base Index

This documentation provides comprehensive information about the Outlook ICS → Google Calendar Sync application. Use this index to navigate to specific information based on your needs.

## How to Use This Documentation

**For AI Assistants**: This index contains rich metadata about each documentation file. Use the summaries below to determine which files contain the information you need, then reference those specific files for detailed information.

## Documentation Files Overview

### 📋 [codebase_info.md](./codebase_info.md)
**Purpose**: Basic project information and technology stack overview  
**Contains**: Project metadata, dependencies, directory structure, programming languages  
**Use when**: Getting initial project context or understanding the tech stack  

### 🏗️ [architecture.md](./architecture.md)  
**Purpose**: System architecture and design patterns  
**Contains**: Application layers, data flow, architectural decisions, system diagrams  
**Use when**: Understanding how the system is structured or making architectural decisions  

### 🔧 [components.md](./components.md)
**Purpose**: Major components and their responsibilities  
**Contains**: Core modules, component relationships, API endpoints, business logic  
**Use when**: Understanding specific functionality or modifying existing components  

### 🔌 [interfaces.md](./interfaces.md)
**Purpose**: APIs, interfaces, and integration points  
**Contains**: External API integrations, internal interfaces, data contracts  
**Use when**: Working with integrations or understanding data exchange  

### 📊 [data_models.md](./data_models.md)
**Purpose**: Data structures and database schema  
**Contains**: Database models, data relationships, schema definitions  
**Use when**: Working with data persistence or understanding data structures  

### ⚡ [workflows.md](./workflows.md)
**Purpose**: Key processes and business workflows  
**Contains**: Sync process, authentication flow, error handling, operational procedures  
**Use when**: Understanding business logic or troubleshooting processes  

### 📦 [dependencies.md](./dependencies.md)
**Purpose**: External dependencies and their usage  
**Contains**: Third-party libraries, APIs, services, and their integration patterns  
**Use when**: Managing dependencies or understanding external integrations  

### 📝 [review_notes.md](./review_notes.md)
**Purpose**: Documentation quality assessment and gaps  
**Contains**: Consistency issues, completeness gaps, improvement recommendations  
**Use when**: Improving documentation or identifying areas needing attention  

## Quick Reference

### Common Questions → Relevant Files
- **"How does sync work?"** → workflows.md, components.md
- **"What's the database schema?"** → data_models.md, interfaces.md  
- **"How is authentication handled?"** → workflows.md, components.md
- **"What APIs are used?"** → interfaces.md, dependencies.md
- **"How is the code organized?"** → architecture.md, components.md
- **"What are the main modules?"** → components.md, codebase_info.md
- **"How to add new features?"** → architecture.md, workflows.md
- **"What external services are used?"** → dependencies.md, interfaces.md

## Metadata Tags

Each documentation file includes metadata tags for targeted information retrieval:
- `#architecture` - System design and structure
- `#components` - Individual modules and their functions  
- `#data` - Database and data-related information
- `#integration` - External service integrations
- `#workflow` - Business processes and flows
- `#api` - API endpoints and interfaces
- `#auth` - Authentication and authorization
- `#sync` - Calendar synchronization logic

## Project Context

**Application Type**: Next.js 15 TypeScript application  
**Primary Function**: One-way sync from Office 365 ICS feeds to Google Calendar  
**Key Features**: Smart filtering, change detection, OAuth2 authentication, dashboard UI  
**Architecture**: API-first design with React frontend and SQLite database  

## Getting Started with the Documentation

1. **New to the project?** Start with `codebase_info.md` and `architecture.md`
2. **Working on sync logic?** Focus on `workflows.md` and `components.md`  
3. **Adding integrations?** Check `interfaces.md` and `dependencies.md`
4. **Database changes?** Reference `data_models.md` and `interfaces.md`
5. **Troubleshooting?** Use `workflows.md` and `review_notes.md`
