#!/bin/bash
#
# MoltMob v2.0 Test — Corrected Logic
# Uses /play endpoint with 6 unique agents
#

set -e

API_BASE="https://www.moltmob.com/api"
GM_SECRET="moltmob-gm-2026"
TIMESTAMP=$(date +%s)
POD_ID=""

echo "═══════════════════════════════════════════════════════════"
echo "  MoltMob v2.0 Test Game"
echo "  Timestamp: $TIMESTAMP"
echo "═══════════════════════════════════════════════════════════"

# Generate 6 unique valid wallets (Solana format)
declare -a WALLETS=(
  "ByhwM1fGPpRe5JmqjW9rygzKchWkTt7GWcMvZhVgxAmH"  # TestAgentA
  "TestWallet2$(date +%s | sha256sum | head -c 32)"
  "TestWallet3$(date +%s | sha256sum | head -c 32)"
  "TestWallet4$(date +%s | sha256sum | head -c 32)"
  "TestWallet5$(date +%s | sha256sum | head -c 32)"
  "TestWallet6$(date +%s | sha256sum | head -c 32)"
)

# 1. Check entry requirements
echo -e "\n📋 Entry Requirements:"
curl -s "$API_BASE/v1/play" | python3 -m json.tool 2>/dev/null || true

# 2. Join pod with 6 agents
echo -e "\n🦀 Joining pod with 6 agents..."

for i in {1..6}; do
  USERNAME="TestBot${TIMESTAMP}_${i}"
  WALLET="${WALLETS[$((i-1))]}"
  # x402 format: moltmob:amount:memo:tx_signature
  TXSIG="mock_tx_$(date +%s%N | sha256sum | head -c 48)"
  X402="moltmob:100000000:${USERNAME}:${TXSIG}"
  
  echo "  Joining as $USERNAME..."
  
  # Make request and capture both success and error
  HTTP_CODE=$(curl -s -o /tmp/response_$i.json -w "%{http_code}" \
    -X POST "$API_BASE/v1/play" \
    -H "Content-Type: application/json" \
    -H "x-wallet-pubkey: $WALLET" \
    -H "x402: $X402" \
    -d "{\"moltbook_username\":\"$USERNAME\",\"encryption_pubkey\":\"mock_enc_$i\"}" \
    2>/dev/null)
  
  # Parse response
  if [ -f /tmp/response_$i.json ]; then
    RESPONSE=$(cat /tmp/response_$i.json)
    
    if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('success') else 1)" 2>/dev/null; then
      POD_NUM=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('game',{}).get('pod_number','?'))" 2>/dev/null)
      PLAYERS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('game',{}).get('players','?'))" 2>/dev/null)
      echo "    ✅ Joined Pod #$POD_NUM ($PLAYERS players)"
      
      [ -z "$POD_ID" ] && POD_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('game',{}).get('pod_id',''))" 2>/dev/null)
    else
      ERROR_MSG=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','unknown'))" 2>/dev/null || echo "HTTP $HTTP_CODE")
      echo "    ⚠️  Error: $ERROR_MSG"
      echo "    Debug: $(cat /tmp/response_$i.json | head -c 200)"
    fi
  else
    echo "    ❌ No response (curl failed)"
  fi
  
  sleep 0.5
done

# 3. Check pod status
echo -e "\n📊 Pod Status:"
if [ -n "$POD_ID" ]; then
  curl -s "$API_BASE/gm/pods/$POD_ID" \
    -H "x-gm-secret: $GM_SECRET" 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"  ID: {d.get('id','N/A')}\"); print(f\"  Status: {d.get('status','N/A')}\"); print(f\"  Players: {d.get('player_count',0)}/{d.get('max_players',12)}\")" 2>/dev/null || echo "  Error fetching pod"
else
  echo "  No pod created"
fi

# 4. Admin stats
echo -e "\n📊 System Stats:"
curl -s "$API_BASE/admin/stats" \
  -H "x-admin-secret: 8a6baae95882953f91d59e7c1cdece45" 2>/dev/null | \
  python3 -m json.tool 2>/dev/null || echo "  Error fetching stats"

# Cleanup
rm -f /tmp/response_*.json

echo -e "\n═══════════════════════════════════════════════════════════"
[ -n "$POD_ID" ] && echo "  Test Complete: $POD_ID" || echo "  Test Incomplete"
echo "═══════════════════════════════════════════════════════════"
