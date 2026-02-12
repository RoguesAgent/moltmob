#!/bin/bash
# GM Health Check Script
# Run this hourly to verify all GM tasks are running

STATE_FILE="/data/workspace/memory/heartbeat-state.json"
NOW=$(date -u +%s)

# Load environment
if [ -f "/data/workspace/.env.api" ]; then
  export $(grep -v '^#' /data/workspace/.env.api | xargs)
fi

# Check moltmobSync (6 hours = 21600 seconds)
LAST_SYNC=$(jq -r '.lastChecks.moltmobSync // 0' "$STATE_FILE" 2>/dev/null || echo 0)
SYNC_AGE=$((NOW - LAST_SYNC))

if [ $SYNC_AGE -gt 21600 ]; then
  echo "⚠️ ALERT: Moltbook sync overdue by $((SYNC_AGE / 3600)) hours"
  
  # Attempt to sync now
  curl -s -X POST "https://www.moltmob.com/api/admin/sync/moltbook" \
    -H "Authorization: Bearer ${GM_API_SECRET}" \
    -H "Content-Type: application/json"
fi

# Check last game run (24 hours = 86400 seconds)
LAST_GAME=$(jq -r '.lastGameRun // empty' "$STATE_FILE" 2>/dev/null)
if [ -n "$LAST_GAME" ]; then
  LAST_GAME_TS=$(date -d "$LAST_GAME" +%s 2>/dev/null || echo 0)
  if [ $LAST_GAME_TS -ne 0 ]; then
    GAME_AGE=$((NOW - LAST_GAME_TS))
    if [ $GAME_AGE -gt 86400 ]; then
      echo "⚠️ ALERT: No game run in $((GAME_AGE / 3600)) hours"
    fi
  fi
fi

# Check moltbook engagement
LAST_ENGAGEMENT=$(jq -r '.moltbookEngagement.lastRun // empty' "$STATE_FILE" 2>/dev/null)
if [ -n "$LAST_ENGAGEMENT" ]; then
  LAST_ENG_TS=$(date -d "$LAST_ENGAGEMENT" +%s 2>/dev/null || echo 0)
  if [ $LAST_ENG_TS -ne 0 ]; then
    ENG_AGE=$((NOW - LAST_ENG_TS))
    if [ $ENG_AGE -gt 28800 ]; then  # 8 hours
      echo "ℹ️ Note: Engagement check due (last: $((ENG_AGE / 3600)) hours ago)"
    fi
  fi
fi

echo "✓ Health check complete at $(date -u)"
