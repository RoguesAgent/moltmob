#!/bin/bash
#
# Full Game Test with Mock Moltbook Integration
# Creates a complete game stored in database with admin visibility
#

set -e

API_BASE="https://www.moltmob.com/api"
ADMIN_SECRET="8a6baae95882953f91d59e7c1cdece45"
GM_SECRET="moltmob-gm-2026"
TIMESTAMP=$(date +%s)
POD_NUMBER=$((9000 + RANDOM % 999))

echo "═══════════════════════════════════════════════════════════"
echo "  MoltMob Full Game Test with Mock Moltbook"
echo "  Timestamp: $TIMESTAMP"
echo "═══════════════════════════════════════════════════════════"

# 1. Initial stats
echo -e "\n📊 Initial admin stats:"
curl -s "${API_BASE}/admin/stats" -H "x-admin-secret: ${ADMIN_SECRET}"
echo ""

# 2. Create pod via GM API
echo -e "\n🦀 Creating pod #$POD_NUMBER..."
POD_RESPONSE=$(curl -s -X POST "${API_BASE}/gm/pods" \
  -H "Content-Type: application/json" \
  -H "x-gm-secret: ${GM_SECRET}" \
  -d "{
    \"pod_number\": ${POD_NUMBER},
    \"entry_fee\": 100000000,
    \"network_name\": \"solana-devnet\",
    \"token\": \"WSOL\"
  }")

echo "Response: $POD_RESPONSE"
POD_ID=$(echo "$POD_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$POD_ID" ]; then
  echo "❌ Failed to create pod"
  exit 1
fi
echo "✅ Pod created: $POD_ID"

# 3. Register and join 8 players
echo -e "\n👥 Registering and joining 8 test agents..."
AGENT_IDS=()
API_KEYS=()

for i in {1..8}; do
  AGENT_NAME="Game${TIMESTAMP}_P${i}"
  
  # Register
  REG_RESPONSE=$(curl -s -X POST "${API_BASE}/v1/agents/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${AGENT_NAME}\",
      \"wallet_pubkey\": \"wallet_${AGENT_NAME}\"
    }")
  
  AGENT_ID=$(echo "$REG_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  API_KEY=$(echo "$REG_RESPONSE" | grep -o '"api_key":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [ -n "$API_KEY" ]; then
    AGENT_IDS+=("$AGENT_ID")
    API_KEYS+=("$API_KEY")
    echo "  Registered: $AGENT_NAME ($AGENT_ID)"
    
    # Join pod
    JOIN_RESPONSE=$(curl -s -X POST "${API_BASE}/v1/pods/${POD_ID}/join" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${API_KEY}" \
      -d "{
        \"tx_signature\": \"tx_${AGENT_NAME}_${TIMESTAMP}\"
      }")
    
    if echo "$JOIN_RESPONSE" | grep -q '"success":true'; then
      echo "    ✅ Joined pod"
    else
      echo "    ❌ Join failed: $(echo "$JOIN_RESPONSE" | grep -o '"error":"[^"]*"' || echo 'unknown')"
    fi
  else
    echo "  ❌ Registration failed for $AGENT_NAME"
  fi
done

echo -e "\n📋 Pod status after joins:"
curl -s "${API_BASE}/gm/pods/${POD_ID}" -H "x-gm-secret: ${GM_SECRET}" | grep -o '"status":"[^"]*"'
curl -s "${API_BASE}/gm/pods/${POD_ID}" -H "x-gm-secret: ${GM_SECRET}" | grep -o '"players":\[[^]]*\]' | head -c 200
echo ""

# 4. Start game via GM API
echo -e "\n🎮 Starting game..."
START_RESPONSE=$(curl -s -X POST "${API_BASE}/admin/pods/${POD_ID}/start" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: ${ADMIN_SECRET}" 2>&1 || echo '{"error":"start failed"}')

echo "Start response: $START_RESPONSE"

# 5. Simulate game rounds
echo -e "\n🔄 Running game simulation..."
ROUND=0
while [ $ROUND -lt 5 ]; do
  ROUND=$((ROUND + 1))
  
  # Check current status
  STATUS=$(curl -s "${API_BASE}/gm/pods/${POD_ID}" -H "x-gm-secret: ${GM_SECRET}")
  PHASE=$(echo "$STATUS" | grep -o '"current_phase":"[^"]*"' | cut -d'"' -f4)
  STATUS_VAL=$(echo "$STATUS" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  echo "  Round $ROUND: phase=$PHASE, status=$STATUS_VAL"
  
  if [ "$STATUS_VAL" != "active" ] && [ "$STATUS_VAL" != "lobby" ]; then
    echo "  Game ended"
    break
  fi
  
  # Submit random votes if in vote phase
  if [ "$PHASE" = "vote" ]; then
    echo "    Submitting votes..."
    for KEY in "${API_KEYS[@]}"; do
      curl -s -X POST "${API_BASE}/v1/pods/${POD_ID}/vote" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${KEY}" \
        -d '{
          "target_id": null,
          "encrypted_vote": "mock_encrypted_vote"
        }' > /dev/null 2>&1 || true
    done
  fi
  
  sleep 0.5
done

# 6. Final status
echo -e "\n📊 Final game state:"
FINAL=$(curl -s "${API_BASE}/gm/pods/${POD_ID}" -H "x-gm-secret: ${GM_SECRET}")
echo "$FINAL" | python3 -m json.tool 2>/dev/null || echo "$FINAL"

# 7. Admin stats update
echo -e "\n📊 Final admin stats:"
curl -s "${API_BASE}/admin/stats" -H "x-admin-secret: ${ADMIN_SECRET}"
echo ""

# 8. Summary
echo -e "\n═══════════════════════════════════════════════════════════"
echo "  Test Complete!"
echo "  Pod ID: $POD_ID"
echo "  Pod #: $POD_NUMBER"
echo "  Admin URL: https://www.moltmob.com/admin/games/${POD_ID}"
echo "═══════════════════════════════════════════════════════════"
