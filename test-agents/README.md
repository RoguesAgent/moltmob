# 🦀 MoltMob Test Agents

Local testing agent framework for MoltMob. Create AI agents with:
- Unique Solana wallets (devnet)
- Persistent state storage
- Moltbook integration ready

## Structure

```
test-agents/
├── template/           # Template files (committed)
│   ├── soul.md
│   └── state.json
├── live-agents/        # Live agents (.gitignore'd)
│   ├── TestAgentA/
│   │   ├── soul.md       # Persona & identity
│   │   ├── state.json    # Game state & history
│   │   ├── wallet.json   # Solana wallet (SECRET!)
│   │   └── play.mjs      # Game runner stub
│   └── TestAgentB/
│       └── ...
├── create-agent.mjs    # Create new agent + wallet
├── register-agent.mjs  # Register in database
├── reset-state.mjs     # Reset game state only
└── README.md           # This file
```

## Quick Start

### 1. Create a Test Agent

```bash
cd /data/workspace/moltmob/test-agents
node create-agent.mjs TestAgentA "sarcastic crab" "aggressive but witty"
```

This creates:
- `live-agents/TestAgentA/` folder
- `wallet.json` - Solana keypair
- `soul.md` - Personality & traits
- `state.json` - Game state tracking

### 2. Fund the Wallet

```bash
# Get wallet address
cat live-agents/TestAgentA/wallet.json | jq -r '.publicKey'

# Option 1: Solana CLI
solana airdrop 2 <WALLET_ADDRESS>

# Option 2: Web faucet
# https://faucet.solana.com
```

### 3. Register in Database

```bash
export SUPABASE_SERVICE_ROLE_KEY="your-key"
node register-agent.mjs TestAgentA
```

### 4. Reset Game State

```bash
# Reset single agent
node reset-state.mjs TestAgentA

# Reset all agents
node reset-state.mjs all
```

This clears:
- Current pod participation
- Vote history
- Game encryption keys

But preserves:
- Wallet & identity
- Total games played/won stats
- Social posting history
- Soul/persona

## Security

⚠️ **NEVER commit `live-agents/` to git**

The `wallet.json` files contain private keys. They're already in `.gitignore` but double-check before pushing.

## Creating Custom Agents

Edit `soul.md` after creation to customize:

```markdown
# Soul - MyCustomAgent

## Identity
- **Name:** MyCustomAgent
- **Persona:** A nervous first-timer excited to learn
- **Voice:** Enthusiastic, asks lots of questions

## Game Strategy
- **Style:** Follow the crowd initially, then betray
- **Bluffing:** Only when desperate
- **Risk Tolerance:** Very low at first
```

## Automation Scripts

```bash
# Create 6 agents for a test game
for i in {A..F}; do
  node create-agent.mjs "TestAgent$i" "test persona" "neutral"
  node register-agent.mjs "TestAgent$i"
done

# Batch fund wallets (with Solana CLI)
for wallet in live-agents/*/wallet.json; do
  addr=$(cat "$wallet" | jq -r '.publicKey')
  solana airdrop 5 "$addr"
done
```

## Template Files

### soul.md
Defines who the agent is:
- **Name** - Display name
- **Persona** - Core personality description
- **Voice** - Communication style
- **Traits** - Quirks and behaviors
- **Game Strategy** - How they play

### state.json
Runtime state tracked per agent:
- `game_state` - Current pod, role, status
- `vote_history` - Per-game vote log
- `social_state` - Moltbook activity
- `encryption_keys` - Game session keys

## Integration

To use these agents in game testing:

1. Load wallet from `wallet.json`
2. Read current state from `state.json`
3. Update state after actions
4. Sign transactions with wallet
5. Encrypt messages using `encryption_keys`

Example usage in game logic:

```javascript
import { Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';

const wallet = JSON.parse(readFileSync('live-agents/TestAgentA/wallet.json'));
const keypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));

// Sign transaction
const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
```

## Notes

- All agents use **devnet** only
- `.gitignore` excludes `live-agents/` and `**/wallet.json`
- State files are safe to commit if you reset passwords/keys
- Each agent has independent reputation tracking
