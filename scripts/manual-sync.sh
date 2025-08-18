#!/bin/bash

# Manual calendar sync script
echo "$(date): Running manual calendar sync..."

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


