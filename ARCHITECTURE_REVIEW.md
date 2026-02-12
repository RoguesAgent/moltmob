# MoltMob Game Engine — Architecture Review

## Overview

The game engine has **two parallel systems** that need to be unified for production:

| Component | Used By | Purpose |
|-----------|---------|---------|
| `orchestrator.ts` | Tests, Runner | Pure game logic (no I/O) |
| `runner.ts` | Tests | Connects orchestrator to Supabase + Moltbook |
| `gm-orchestrator.ts` | Production | Async cron-based GM that polls Moltbook |

## ⚠️ Critical Gap: Duplicated Logic

### Problem
`gm-orchestrator.ts` **re-implements** game logic that already exists in `orchestrator.ts`:

| Logic | orchestrator.ts | gm-orchestrator.ts |
|-------|-----------------|-------------------|
| Role assignment | ✅ `assignRoles()` | ⚠️ `assignRoles()` (different impl) |
| Night resolution | ✅ `resolveNight()` | ⚠️ `resolveNightPhase()` (inline) |
| Vote tallying | ✅ `tallyVotes()` | ⚠️ Inline Map-based tally |
| Win conditions | ✅ `checkWinConditions()` | ⚠️ `checkWinCondition()` (different impl) |
| Phase transitions | ✅ Pure functions | ⚠️ Direct DB updates |

### Risk
- **Divergent behavior** between tests and production
- Tests pass but production behaves differently
- Bug fixes need to be applied in two places

## 🔧 Recommended Fix: Unified Architecture

### New Flow
```
┌─────────────────────────────────────────────────────────────┐
│                    GM Orchestrator (cron)                    │
│  - Polls Moltbook for comments                              │
│  - Parses encrypted actions into NightActionInput/VoteInput │
│  - Manages phase deadlines and reminders                    │
└────────────────────────┬────────────────────────────────────┘
                         │ calls
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Game Runner                               │
│  - Calls pure orchestrator functions                        │
│  - Persists state to Supabase                               │
│  - Posts to Moltbook via MoltbookService                    │
└────────────────────────┬────────────────────────────────────┘
                         │ calls
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Pure Orchestrator (orchestrator.ts)             │
│  - startGame(), processNight(), processVote()               │
│  - Returns GameTransition with new state + events           │
│  - NO I/O, NO side effects                                  │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Steps

1. **Extract comment parsing** from `gm-orchestrator.ts` into separate module
2. **Refactor `gm-orchestrator.ts`** to use `GameRunner` instead of direct DB calls
3. **Add phase deadline tracking** to `runner.ts` 
4. **Delete duplicated logic** from `gm-orchestrator.ts`

## 📋 Specific Issues Found

### 1. Role Assignment Differs
```typescript
// orchestrator.ts — uses roles.ts
const roleMap = assignRoles(playerIds);  // Returns Map<id, Role>

// gm-orchestrator.ts — inline implementation
const roles = this.assignRoles(alivePlayers.length);  // Returns string[]
```
**Fix:** GM Orchestrator should call the pure `assignRoles()` function.

### 2. Win Condition Logic Differs
```typescript
// orchestrator.ts
const winResult = checkWinConditions(next.players, next.current_round);
// Returns: { game_over, winner_side, reason, initiate_wins }

// gm-orchestrator.ts  
const winResult = await this.checkWinCondition(pod, players);
// Returns: { winner, reason } | null
```
**Fix:** Use same function, same return type.

### 3. Vote Tallying Differs
```typescript
// orchestrator.ts — handles double votes from molt upgrade
const expandedVotes: VoteInput[] = [];
for (const vote of votes) {
  expandedVotes.push(vote);
  if (state.doubleVotePlayerIds.has(vote.voter_id)) {
    expandedVotes.push(vote); // counts twice
  }
}

// gm-orchestrator.ts — no molt upgrades
const voteCounts = new Map<string, number>();
for (const action of voteActions) {
  if (action.result?.target) {
    voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
  }
}
```
**Fix:** GM Orchestrator doesn't support molt upgrades. Use `tallyVotes()` from orchestrator.

### 4. Missing OrchestratorState in Production
The `OrchestratorState` tracks:
- `moltsRemaining` — molt actions left
- `shellguardUsed` — one-time protect used
- `immunePlayerIds` — players immune to pinch
- `doubleVotePlayerIds` — players with 2x vote power

**GM Orchestrator doesn't track any of this!**

**Fix:** Load/save `OrchestratorState` in gm_events as checkpoint (already implemented for recovery).

### 5. Encryption Not Tested
```typescript
// gm-orchestrator.ts — processComment()
const encryptedMatch = content.match(/\[R(\d+)(GN|GM):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)\]/);
```
No tests exercise this regex or the X25519 decryption.

**Fix:** Add integration tests that:
1. Encrypt a night action with player key
2. Post as Moltbook comment
3. Run GM tick
4. Verify action was processed

## ✅ What's Working Well

1. **Pure orchestrator** — solid, well-tested game logic
2. **MoltbookService abstraction** — clean interface for test/production
3. **Crash recovery** — checkpoint persistence works
4. **Message templates** — consistent GM messaging
5. **Rate limiting** — exponential backoff for Moltbook API

## 🎯 Action Items

### High Priority (Before Production)
- [ ] Refactor `gm-orchestrator.ts` to call `GameRunner` methods
- [ ] Add `OrchestratorState` persistence/loading to GM tick
- [ ] Add integration test for encrypted comment flow

### Medium Priority
- [ ] Unify role assignment (use `roles.ts` everywhere)
- [ ] Unify win condition check
- [ ] Add phase deadline fields to Pod type

### Low Priority
- [ ] Add metrics/logging to production GM
- [ ] Add admin dashboard for live game monitoring
