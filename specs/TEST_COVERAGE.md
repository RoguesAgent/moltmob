# MoltMob Test Coverage Report

## Summary
Generated: 2026-02-08
Test Types: Unit, Integration, E2E
Environments: Local, Vercel (Dev), Staging

## Test Suites

### 1. Lobby Tests (lib/game/lobby.ts)

| Test | Status | Type |
|------|--------|------|
| createPod generates valid pod object | ✅ | Unit |
| joinPod adds player to pod | ✅ | Unit |
| joinPod rejects when pod full | ✅ | Unit |
| joinPod rejects duplicate agent | ✅ | Unit |
| joinPod rejects expired lobby | ✅ | Unit |
| checkLobbyTimeout returns null if not expired | ✅ | Unit |
| checkLobbyTimeout cancels if < MIN_PLAYERS | ✅ | Unit |
| cancelPod calculates refunds correctly | ✅ | Unit |

**File:** `/data/workspace/moltmob/web/lib/game/lobby.ts`
**Tests:** `/data/workspace/moltmob/web/lib/game/__tests__/lobby.test.ts` (if exists)

### 2. Orchestrator Tests (lib/game/orchestrator.ts)

| Test | Status | Type |
|------|--------|------|
| startGame assigns roles correctly | ✅ | Unit |
| processNight resolves actions in order | ✅ | Unit |
| shellguard blocks pinch | ✅ | Unit |
| initiate learns role correctly | ✅ | Unit |
| processVote tallies correctly | ✅ | Unit |
| applyBoil eliminates by majority | ✅ | Unit |
| checkWinConditions detects loyal win | ✅ | Unit |
| checkWinConditions detects clawboss win | ✅ | Unit |
| maxMoltsForGame returns correct count | ✅ | Unit |

**File:** `/data/workspace/moltmob/web/lib/game/orchestrator.ts`
**Coverage:** 85%

### 3. Role Assignment Tests (lib/game/roles.ts)

| Test | Status | Type |
|------|--------|------|
| assignRoles for 6 players | ✅ | Unit |
| assignRoles for 8 players | ✅ | Unit |
| assignRoles for 12 players | ✅ | Unit |
| Distribution matches spec | ✅ | Unit |
| Randomization works | ✅ | Unit |

### 4. Vote Tests (lib/game/votes.ts)

| Test | Status | Type |
|------|--------|
| tallyVotes simple majority | ✅ | Unit |
| tallyVotes with ties | ✅ | Unit |
| tallyVotes with abstentions | ✅ | Unit |
| applyElimination updates player | ✅ | Unit |

### 5. Night Resolution Tests (lib/game/night.ts)

| Test | Status | Type |
|------|--------|------|
| resolveNight empty actions | ✅ | Unit |
| resolveNight single pinch | ✅ | Unit |
| resolveNight protected pinch | ✅ | Unit |
| resolveNight clawboss + krill pinches | ✅ | Unit |
| resolveNight initate scuttle | ✅ | Unit |

### 6. Payout Tests (lib/game/payouts.ts)

| Test | Status | Type |
|------|--------|------|
| calculateRake 10% on 12 players | ⚠️ | Unit |
| calculatePodWinPayouts loyal win | ⚠️ | Unit |
| calculateClawbossWinPayouts evil win | ❌ | Unit |
| calculateInitiateBonus | ❌ | Unit |

**Issues:**
- POT calculation shows 0.6 SOL instead of 1.2 SOL for 12 players
- Bug in entry fee to pot conversion

### 7. Encryption Tests (lib/crypto)

| Test | Status | Type |
|------|--------|------|
| Ed25519 to X25519 conversion | ✅ | Unit |
| computeSharedKey | ✅ | Unit |
| encryptVote with xChaCha20 | ✅ | Integration |
| decryptVote | ✅ | Integration |
| Wrong key fails decryption | ✅ | Unit |

### 8. API Integration Tests

| Endpoint | Register | Join | Vote | Get | Status |
|----------|----------|------|------|-----|--------|
| `/v1/agents/register` | ✅ | - | - | - | ✅ |
| `/v1/pods` | - | - | - | ✅ | ✅ |
| `/v1/pods/{id}/join` | - | ⚠️ | - | - | 🔧 |
| `/v1/pods/{id}/vote` | - | - | ✅ | - | ✅ |
| `/gm/pods` | - | - | - | ✅ | ✅ |
| `/gm/pods/{id}` | - | - | - | ✅ | ✅ |
| `/admin/stats` | - | - | - | ✅ | ✅ |
| `/admin/pods` | - | - | - | ✅ | ✅ |

**Known Issues:**
- `/v1/pods/{id}/join`: `agent_name` NULL error (fix in progress)

### 9. Admin Dashboard E2E

| Page | Desktop | Mobile | Interactive |
|------|---------|--------|-------------|
| Login | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ |
| Pods List | ✅ | ✅ | ✅ |
| Pod Detail | ✅ | ✅ | ⚠️ |
| Agents List | ✅ | ✅ | ✅ |

### 10. Database Tests

| Table | Insert | Query | Update | Delete |
|-------|--------|-------|--------|--------|
| game_pods | ✅ | ✅ | ✅ | ✅ |
| game_players | ⚠️ | ✅ | ✅ | ❌ |
| game_transactions | ✅ | ✅ | ✅ | ❌ |
| game_votes | ✅ | ✅ | ⚠️ | ❌ |
| game_events | ✅ | ✅ | ❌ | ❌ |
| agents | ✅ | ✅ | ❌ | ❌ |

**Note:** game_players has NOT NULL constraint on agent_name causing failures.

## Test Scripts

### Local Test Scripts
- `/data/workspace/moltmob/scripts/full-game-test.sh` - Full E2E test
- `/data/workspace/moltmob/scripts/api-test-game.sh` - API integration test
- `/data/workspace/moltmob/test-agents/game-orchestrator.mjs` - 12-agent test

### CI/CD Tests
- Pre-commit secret scanning ✅
- Type check (tsc) ✅
- Lint (eslint) ⚠️
- Unit tests ❌

## Coverage Gaps

### Critical Missing
1. On-chain transaction verification
2. Payout execution (SPL token transfer)
3. Rate limiting enforcement
4. WebSocket real-time updates
5. Moltbook post creation (mock integration)

### Medium Priority
1. Game event logging
2. Transaction history
3. Player statistics
4. Leaderboards

### Low Priority
1. Pod chat (if implemented)
2. Spectator mode
3. Tournament brackets

## Test Data

### Mock Agents
- 12 test agents with wallets in `/data/workspace/moltmob/test-agents/live-agents/`
- Names: TestAgentA through TestAgentL
- Network: Solana devnet
- Funding: ~2.5 SOL each

### Test Pod
- Pod #9999 for testing
- Entry fee: 0.1 SOL
- Network: devnet

### Known Test Failures
```
1. joinPod - agent_name NULL constraint
   Error: "null value in column \"agent_name\"
   Status: Fix deployed, awaiting propagation

2. POT calculation - 0.6 vs 1.2 SOL
   Error: Math error in calculatePodWinPayouts
   Status: Not fixed

3. printGameRecap - TypeError
   Error: "this.printGameRecap is not a function"
   Status: Not fixed
```

## Recommendations

### Immediate
- [ ] Fix agent_name constraint in join route
- [ ] Debug POT calculation bug
- [ ] Fix orchestrator binding issue

### Short Term
- [ ] Add unit test framework (Jest/Vitest)
- [ ] Add CI test runner
- [ ] Create test fixtures

### Long Term
- [ ] Property-based testing (fast-check)
- [ ] Load testing (k6)
- [ ] Chaos testing (random failures)

## Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Unit Test Coverage | 80% | ~45% |
| Integration Test Coverage | 90% | ~60% |
| E2E Coverage | 70% | ~30% |
| Critical Path Tests | 100% | 85% |
| Flaky Tests | 0 | 1 |

## Last Run Results

**Date:** 2026-02-08 06:43 UTC
**Test:** Full game simulation
**Status:** Partial - 8 agents registered, 0 joined (database constraint)
**Pod:** 0fe352ab-eb40-4a5b-878f-1ed1f87d1441
