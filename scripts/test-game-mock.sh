#!/bin/bash
#
# Full Game Test with Moltbook Mock
# Uses /play endpoint with x402 payment simulation
#

set -e

API_BASE="https://www.moltmob.com/api"
GM_SECRET="moltmob-gm-2026"

# Test wallets (mock)
WALLET_1="BwYK8dN1z8rLXJmuxBCT5Bbbk1ZpL6E7wxN6M2N6a6Wf"
WALLET_2="9pE7cYvL4w2z8rKj5M3qN8xP6vL2w5B6nK3mN7pQ8rS"
WALLET_3="3mN6pQ8rS5vL2wB6nK9qN7pM4xL2w5B6nK3mN7pQ8r"

TIMESTAMP=$(date +%s)
POD_ID=""

echo "═══════════════════════════════════════════════════════════"
echo "  MoltMob Test Game (Moltbook Mock)"
echo "  Timestamp: $TIMESTAMP"
echo "═══════════════════════════════════════════════════════════"

# 1. Check entry requirements
echo -e "\n📋 Entry Requirements:"
curl -s "$API_BASE/v1/play" | python3 -m json.tool 2>/dev/null || true

# 2. Simulate x402 payments and join pod
echo -e "\n🦀 Joining pod with 6 mock agents..."

for i in {1..6}; do
  USERNAME="MockBot${TIMESTAMP}_${i}"
  # Simulate x402: moltmob:amount:memo:tx_signature
  X402="moltmob:100000000:${USERNAME}:mock_tx_${TIMESTAMP}_${i}_$(cat /dev/urandom | tr -dc 'a-z0-9' | fold -w 32 | head -1)"
  
  echo "  Joining as $USERNAME..."
  
  RESPONSE=$(curl -s -X POST "$API_BASE/v1/play" \
    -H "Content-Type: application/json" \
    -H "x-wallet-pubkey: ${WALLET_1}${i}" \
    -H "x402: ${X402}" \
    -d "{\"moltbook_username\":\"${USERNAME}\",\"encryption_pubkey\":\"mock_enc_${i}\"}" \
    2>/dev/null || echo '{"success":false,"error":"curl failed"}')
  
  if echo "$RESPONSE" | grep -q '"success":true'; then
    POD_NUM=$(echo "$RESPONSE" | grep -o '"pod_number":[0-9]*' | head -1 | cut -d':' -f2)
    PLAYERS=$(echo "$RESPONSE" | grep -o '"players":[0-9]*' | head -1 | cut -d':' -f2)
    echo "    ✅ Joined Pod #$POD_NUM ($PLAYERS players)"
    
    # Extract pod_id from first successful join
    if [ -z "$POD_ID" ]; then
      POD_ID=$(echo "$RESPONSE" | grep -o '"pod_id":"[^"]*"' | head -1 | cut -d'"' -f4)
    fi
  else
    ERROR=$(echo "$RESPONSE" | grep -o '"error":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "    ⚠️  Error: ${ERROR:unknown}"
  fi
  
  sleep 0.5
done

# 3. Check GM view
echo -e "\n📊 GM Pod View:"
if [ -n "$POD_ID" ]; then
  curl -s "$API_BASE/gm/pods/$POD_ID" -H "x-gm-secret: $GM_SECRET" | grep -o '"[^"]*player[^"]*"[^:]*:[0-9]*' | head -3 || true
else
  echo "  No pod created yet"
fi

# 4. Admin stats
echo -e "\n📊 Current Stats:"
curl -s "$API_BASE/admin/stats" -H "x-admin-secret: 8a6baae95882953f91d59e7c1cdece45" | python3 -m json.tool 2>/dev/null || true

echo -e "\n═══════════════════════════════════════════════════════════"
if [ -n "$POD_ID" ]; then
  echo "  Test Complete!"
  echo "  Pod ID: $POD_ID"
  echo "  Admin: https://www.moltmob.com/admin"
else
  echo "  Test Partial - Check pod status"
fi
echo "═══════════════════════════════════════════════════════════"
