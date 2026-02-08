#!/bin/bash
#
# Database-backed test game via API
# Creates a game that appears in the admin dashboard
#

set -e

API_BASE="https://www.moltmob.com/api"
ADMIN_SECRET="8a6baae95882953f91d59e7c1cdece45"
GM_SECRET="moltmob-gm-2026"
TIMESTAMP=$(date +%s)

echo "🎮 Creating database-backed test game (timestamp: $TIMESTAMP)..."

# 1. Check admin stats (current state)
echo "📊 Current admin stats:"
curl -s "${API_BASE}/admin/stats" -H "x-admin-secret: ${ADMIN_SECRET}" | cat
echo ""

# 2. Create a new pod via GM API
echo -e "\n🦀 Creating test pod..."
POD_RESPONSE=$(curl -s -X POST "${API_BASE}/gm/pods" \
  -H "Content-Type: application/json" \
  -H "x-gm-secret: ${GM_SECRET}" \
  -d '{
    "pod_number": 9999,
    "entry_fee": 100000000,
    "network_name": "solana-devnet",
    "token": "WSOL"
  }')

echo "Pod response: $POD_RESPONSE"

# Extract pod ID
POD_ID=$(echo "$POD_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Created pod ID: $POD_ID"

if [ -z "$POD_ID" ]; then
  echo "❌ Failed to create pod"
  exit 1
fi

# 3. Get pod details
echo -e "\n📋 Pod details:"
curl -s "${API_BASE}/gm/pods/${POD_ID}" -H "x-gm-secret: ${GM_SECRET}" | head -c 500
echo ""

# 4. Create test agents and have them join
echo -e "\n👥 Adding test players to pod..."

SUCCESS_COUNT=0
for i in {1..8}; do
  AGENT_NAME="Game${TIMESTAMP}_Agent$(printf '%02d' $i)"
  
  # Register agent
  AGENT_RESPONSE=$(curl -s -X POST "${API_BASE}/v1/agents/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${AGENT_NAME}\",
      \"wallet_pubkey\": \"wallet_${AGENT_NAME}\"
    }" 2>/dev/null || echo '{"error":"register failed"}')
  
  # Extract agent ID and API key
  AGENT_ID=$(echo "$AGENT_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  API_KEY=$(echo "$AGENT_RESPONSE" | grep -o '"api_key":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [ -n "$API_KEY" ]; then
    # Join pod
    JOIN_RESPONSE=$(curl -s -X POST "${API_BASE}/v1/pods/${POD_ID}/join" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${API_KEY}" \
      -d "{
        \"tx_signature\": \"tx_${AGENT_NAME}_${TIMESTAMP}\"
      }" 2>/dev/null)
    
    # Check if join succeeded
    if echo "$JOIN_RESPONSE" | grep -q '"success":true'; then
      echo "  ✅ ${AGENT_NAME} joined"
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
      echo "  ⚠️  ${AGENT_NAME} join failed: $(echo "$JOIN_RESPONSE" | grep -o '"error":"[^"]*"' || echo 'unknown error')"
    fi
  else
    echo "  ❌ ${AGENT_NAME} registration failed: $(echo "$AGENT_RESPONSE" | grep -o '"error":"[^"]*"' || echo 'no response')"
  fi
done

echo -e "\n🎲 Players joined: $SUCCESS_COUNT/8"

# 5. Get updated pod details
echo -e "\n📋 Updated pod details:"
curl -s "${API_BASE}/gm/pods/${POD_ID}" -H "x-gm-secret: ${GM_SECRET}" | grep -o '"status":"[^"]*"' | head -1
curl -s "${API_BASE}/gm/pods/${POD_ID}" -H "x-gm-secret: ${GM_SECRET}" | grep -o 'players.*]' | head -c 200
echo ""

echo -e "\n🔗 Admin URL: https://www.moltmob.com/admin/games/${POD_ID}"
echo "🔗 Public Pod: https://www.moltmob.com/admin/games/${POD_ID}"

echo -e "\n📊 New admin stats:"
curl -s "${API_BASE}/admin/stats" -H "x-admin-secret: ${ADMIN_SECRET}" | cat
echo ""

echo -e "\n✅ Test complete! View in admin: https://www.moltmob.com/admin"
