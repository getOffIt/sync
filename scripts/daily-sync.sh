#!/bin/bash

# Daily sync script for calendar synchronization
# This script is designed to be run by cron

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to project directory
cd "$PROJECT_DIR" || exit 1

# Load environment variables (properly handling values with spaces/special chars)
set -a
source .env.local
set +a

# Log file with date
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/sync-$(date +%Y-%m-%d).log"

# Run the sync
echo "=== Sync started at $(date) ===" >> "$LOG_FILE"
npx tsx scripts/run-sync.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "=== Sync completed successfully at $(date) ===" >> "$LOG_FILE"
else
    echo "=== Sync failed with exit code $EXIT_CODE at $(date) ===" >> "$LOG_FILE"
fi

echo "" >> "$LOG_FILE"

# Keep only last 7 days of logs
find "$LOG_DIR" -name "sync-*.log" -mtime +7 -delete

exit $EXIT_CODE
