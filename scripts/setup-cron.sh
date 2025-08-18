#!/bin/bash

# Setup script for calendar sync cron job and aliases

echo "Setting up calendar sync automation..."

# Get the absolute path to the project directory
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CRON_SCRIPT="$PROJECT_DIR/scripts/cron-sync.sh"
MANUAL_SCRIPT="$PROJECT_DIR/scripts/manual-sync.sh"

echo "Project directory: $PROJECT_DIR"
echo "Cron script: $CRON_SCRIPT"
echo "Manual script: $MANUAL_SCRIPT"

# Check if scripts exist
if [ ! -f "$CRON_SCRIPT" ]; then
    echo "❌ Cron script not found at $CRON_SCRIPT"
    exit 1
fi

if [ ! -f "$MANUAL_SCRIPT" ]; then
    echo "❌ Manual script not found at $MANUAL_SCRIPT"
    exit 1
fi

# Add aliases to zshrc
ZSHRC="$HOME/.zshrc"

echo "Adding aliases to $ZSHRC..."

# Check if aliases already exist
if grep -q "alias calsync=" "$ZSHRC"; then
    echo "⚠️  Calendar sync aliases already exist in $ZSHRC"
    echo "Current aliases:"
    grep "alias calsync" "$ZSHRC"
else
    # Add aliases
    echo "" >> "$ZSHRC"
    echo "# Calendar sync aliases" >> "$ZSHRC"
    echo "alias calsync='$MANUAL_SCRIPT'" >> "$ZSHRC"
    echo "alias calsync-status='curl -s http://localhost:4001/api/status | jq .'" >> "$ZSHRC"
    echo "alias calsync-start='cd $PROJECT_DIR && npm run dev'" >> "$ZSHRC"
    echo "Calendar sync aliases added to $ZSHRC"
fi

# Setup cron job
echo ""
echo "Setting up cron job..."

# Create temporary file with current crontab
crontab -l > /tmp/current_crontab 2>/dev/null || echo "" > /tmp/current_crontab

# Check if cron job already exists
if grep -q "cron-sync.sh" /tmp/current_crontab; then
    echo "⚠️  Calendar sync cron job already exists"
    echo "Current cron jobs:"
    crontab -l | grep -E "(cron-sync|calendar)"
else
    # Add cron job (every 30 minutes during business hours on weekdays)
    echo "# Calendar sync - every 30 minutes during business hours (9 AM - 5 PM) on weekdays" >> /tmp/current_crontab
    echo "*/30 9-16 * * 1-5 $CRON_SCRIPT >> $PROJECT_DIR/logs/cron-sync.log 2>&1" >> /tmp/current_crontab
    
    # Install the new crontab
    crontab /tmp/current_crontab
    
    echo "✅ Cron job added successfully"
    echo "Schedule: Every 30 minutes, 9 AM - 5 PM, weekdays only"
fi

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# Clean up
rm /tmp/current_crontab

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Available commands:"
echo "  calsync        - Run manual calendar sync"
echo "  calsync-status - Check sync status"
echo "  calsync-start  - Start the development server"
echo ""
echo "Cron job will run automatically every 30 minutes during business hours."
echo "Logs will be saved to: $PROJECT_DIR/logs/cron-sync.log"
echo ""
echo "To reload your shell configuration:"
echo "  source ~/.zshrc"


