#!/bin/bash

# Sync script for Calendar
echo "Starting Calendar sync..."

# Make the sync request
response=$(curl -s -X POST http://localhost:4001/api/sync)

# Check if the request was successful
if [ $? -eq 0 ]; then
    echo "✅ Sync completed successfully!"
    echo "Response: $response"
else
    echo "❌ Sync failed!"
    exit 1
fi

