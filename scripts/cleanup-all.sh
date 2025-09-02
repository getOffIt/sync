#!/bin/bash

# Cleanup script wrapper for wiping local database and Google Calendar
# This provides a clean slate for testing sync functionality

set -e



# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Calendar Sync Cleanup Script${NC}"
echo -e "${YELLOW}⚠️  WARNING: This will delete sync data and events from configured calendar!${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Please run this script from the project root directory${NC}"
    exit 1
fi

# Check if tsx is available
if ! command -v tsx &> /dev/null; then
    echo -e "${RED}❌ Error: tsx is not installed. Please install it first:${NC}"
    echo "npm install -g tsx"
    exit 1
fi

# Parse command line arguments
RESET_SCHEMA=false
HELP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --reset-schema)
            RESET_SCHEMA=true
            shift
            ;;
        --help|-h)
            HELP=true
            shift
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

if [ "$HELP" = true ]; then
    echo -e "${BLUE}Usage:${NC}"
    echo "  ./scripts/cleanup-all.sh [options]"
    echo ""
    echo -e "${BLUE}Options:${NC}"
    echo "  --reset-schema    Completely reset database schema (drops all tables)"
    echo "  --help, -h        Show this help message"
    echo ""
    echo -e "${BLUE}This script will:${NC}"
echo "1. Delete all events from your configured Google Calendar (GOOGLE_CALENDAR_ID)"
echo "2. Clear sync data from your local database (preserving OAuth tokens)"
echo "3. Optionally reset the database schema completely"
echo ""
echo -e "${YELLOW}⚠️  WARNING: This will remove events and sync data!${NC}"
    exit 0
fi

# Final confirmation
echo -e "${RED}Are you absolutely sure you want to delete ALL data?${NC}"
echo -e "${YELLOW}This action cannot be undone!${NC}"
echo ""
read -p "Type 'YES' to confirm: " confirmation

if [ "$confirmation" != "YES" ] && [ "$confirmation" != "yes" ] && [ "$confirmation" != "Yes" ]; then
    echo -e "${GREEN}✅ Cleanup cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}Starting cleanup process...${NC}"

# Build the command
CMD="tsx scripts/cleanup-all.ts"
if [ "$RESET_SCHEMA" = true ]; then
    CMD="$CMD --reset-schema"
fi

# Run the cleanup script
echo -e "${BLUE}Running: $CMD${NC}"
echo ""

$CMD

echo ""
echo -e "${GREEN}✅ Cleanup script completed!${NC}"
echo -e "${BLUE}📝 Next steps:${NC}"
echo "   1. Run a fresh sync to populate both systems:"
echo "      npm run dev"
echo "      # Then visit http://localhost:4001 and click 'Sync Now'"
echo "      # Or use the API directly: curl -X POST http://localhost:4001/api/sync"
