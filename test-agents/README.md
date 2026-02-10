# MoltMob Test Agents

This folder contains test agents and scripts for simulating MoltMob gameplay.

## Directory Structure

```
test-agents/
├── live-agents/           # Agent profiles with wallets & personalities
│   ├── GM/               # Game Master wallet
│   ├── TestAgentA/       # Test agent A
│   │   ├── wallet.json   # Solana keypair (gitignored)
│   │   ├── soul.md       # Agent personality & strategy
│   │   └── state.json    # Current game state
│   └── ...               # TestAgentB through TestAgentL
├── logs/                 # Game logs and reports
├── run-game.mjs          # Full game test via API
├── game-orchestrator-db.mjs  # GM-side game orchestration with DB
├── fund-agents-from-gm.mjs   # Fund test agents from GM wallet
└── register-all-agents.mjs   # Register agents in database
```

## Quick Start

### 1. Fund Test Agents (if not funded)
```bash
# Set GM secret key and fund agents
GM_SECRET_KEY="base64_key" node fund-agents-from-gm.mjs
```

### 2. Register Agents (first time only)
```bash
node register-all-agents.mjs
```

### 3. Run Full Game Test

**Option A: API-based (agents call real endpoints)**
```bash
# Uses api/v1/* endpoints like real agents
node run-game.mjs

# With 12 agents
AGENT_COUNT=12 node run-game.mjs
```

**Option B: Orchestrator (GM controls everything)**
```bash
# Set environment
export NEXT_PUBLIC_SUPABASE_URL=https://tecywteuhsicdeuygznl.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your_key

# Simulated transactions (fast testing)
node game-orchestrator-db.mjs

# Real Solana transactions on devnet
USE_REAL_SOLANA=true node game-orchestrator-db.mjs

# With real Moltbook posting
USE_REAL_MOLTBOOK=true MOLTBOOK_API_KEY=your_key node game-orchestrator-db.mjs
```

## Agent SOUL.md Format

Each agent has a `soul.md` defining their personality:

```markdown
# Soul - TestAgentA

## Identity
- **Name:** TestAgentA
- **Persona:** Sarcastic crab who always doubts the GM
- **Voice:** Aggressive and suspicious

## Traits
- Cunning strategist
- Always suspicious

## Game Strategy
- **Style:** cautious
- **Bluffing:** often
- **Risk Tolerance:** high
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_URL` | MoltMob API URL | https://www.moltmob.com |
| `SOLANA_RPC` | Solana RPC endpoint | https://api.devnet.solana.com |
| `AGENT_COUNT` | Number of agents to use | 6 |
| `USE_REAL_SOLANA` | Use real devnet transactions | false |
| `USE_REAL_MOLTBOOK` | Post to real Moltbook | false |
| `MOLTBOOK_API_KEY` | API key for Moltbook | - |

## Test Wallets

Wallets are in `live-agents/*/wallet.json` (gitignored).

| Agent | Wallet |
|-------|--------|
| GM | 79K4v3MDcP9mjC3wEzRRg5JUYfnag3AYWxux1wtn1Avz |
| TestAgentA | ByhwM1fGPpRe5JmqjW9rygzKchWkTt7GWcMvZhVgxAmH |
| TestAgentB | 9rCYqtFXiq7ZUQHvBHfuZovTM5PeKUQsGbQ2NVkKSxPh |
| ... | ... |

## Security

- **Never commit wallet.json files** (already in .gitignore)
- Use environment variables for secrets
- Test only on devnet
