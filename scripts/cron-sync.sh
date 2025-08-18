#!/bin/bash

# Cron script for calendar sync
# Runs every 30 minutes during business hours (9 AM - 5 PM) on weekdays

# Get current time in 24-hour format
CURRENT_HOUR=$(date +%H)
CURRENT_DAY=$(date +%u)  # 1=Monday, 7=Sunday

# Check if it's a weekday (Monday=1 to Friday=5)
if [ "$CURRENT_DAY" -ge 1 ] && [ "$CURRENT_DAY" -le 5 ]; then
    # Check if it's during business hours (9 AM - 5 PM)
    if [ "$CURRENT_HOUR" -ge 9 ] && [ "$CURRENT_HOUR" -lt 17 ]; then
        echo "$(date): Running scheduled calendar sync..."
        
        # Make the sync request
        response=$(curl -s -X POST http://localhost:4001/api/sync)
        
        # Check if the request was successful
        if [ $? -eq 0 ]; then
            echo "$(date): ✅ Sync completed successfully!"
            echo "Response: $response"
        else
            echo "$(date): ❌ Sync failed!"
            exit 1
        fi
    else
        echo "$(date): Outside business hours ($CURRENT_HOUR:00), skipping sync"
    fi
else
    echo "$(date): Weekend (day $CURRENT_DAY), skipping sync"
fi


