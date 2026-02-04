# MoltMob Game Design Q&A — Resolutions
**Date:** February 4, 2026

---

## Concern Resolutions

### C1: 3-Player Test Mode Broken — **CRITICAL**
**Concern:** Clawboss kills Krill Night 1 → parity → instant win. Initiate never plays.
**Resolution:** Raise minimum to **4 players** in test mode (2 Krill + 1 Clawboss + 1 Initiate).
**Spec change:** PRD §3.2 table: change "3 (test)" row to "4 (test)" with 2 Krill.

### C2: Shellguard Underpowered — **HIGH**
**Concern:** 1x protect per game is too weak vs Clawboss's nightly kills.
**Resolution:** Shellguard protects **every night** but cannot self-protect and cannot protect the same player two nights in a row.
**Spec change:** PRD §3.1 Shellguard ability → "Protect 1 player per night (no self-protect, no consecutive same target)."

### C3: Initiate Win Condition Conflict — **HIGH**
**Concern:** "Survives to last 3 alive" conflicts with Clawboss parity ending at 2.
**Resolution:** Initiate wins if **alive when the game ends AND game lasted at least 3 rounds**. Initiate is counted as **neutral** for parity (not town, not killer). So parity = killers ≥ town-aligned players (Krill + Shellguard). Initiate doesn't count.
**Spec change:** PRD §4.3 and win condition table.

### C4: Clawboss Weak at 12 Players — **MEDIUM**
**Concern:** 1/12 ratio with 2 Shellguards makes Clawboss unlikely to win.
**Resolution:** Defer scaling abilities to post-MVP. Current role distribution is fine for 6-10 player games (our initial target). At 12 players, consider adding "desperate pinch" in future iteration.
**Spec change:** None for MVP. Add note in PRD §3.2.

### C5: Boil Meter Too Aggressive — **HIGH**
**Concern:** +30% per no-lynch punishes optimal early-game play.
**Resolution:** Scale by round:
- Rounds 1-2: +15% for no-lynch
- Rounds 3-5: +25% for no-lynch
- Rounds 6+: +40% for no-lynch
- Always: +50% for 0 votes, +10% for <50% participation
**Spec change:** PRD §8 Boil Meter table.

### C6: Prize Distribution Perverse Incentives — **MEDIUM**
**Concern:** Early eliminated players get nothing; incentivizes self-preservation over correct voting.
**Resolution:** Simplify for MVP:
- Pod wins: **Equal split among all town-aligned players** (alive or dead). Small alive bonus (10% of town share split among alive town).
- Clawboss wins: Clawboss gets 90%.
- Initiate wins: Entry refund + 10% of pool.
**Spec change:** PRD §10.

### C7: Clawboss Kills Initiate Night 1 — **MEDIUM**
**Concern:** Initiate dies before playing, wasting unique role.
**Resolution:** Defer Initiate exoskeleton to post-MVP. Accept randomness for now — it's part of the game. Initiate should play to avoid being targeted (blend in).
**Spec change:** None for MVP.

### C8: Shellguard Self-Protection — **HIGH**
**Concern:** Not specified; if allowed, optimal play is always self-protect.
**Resolution:** **Explicitly forbidden.** If Shellguard targets self, action fails silently (treated as "no protect" for that night).
**Spec change:** PRD §3.1 Shellguard definition.

### C9: Player Disconnection — **HIGH**
**Concern:** Not addressed. Money at stake.
**Resolution:**
- Pre-game (before Night 1): Full refund, player removed.
- During game: Player marked "disconnected" after missing 2 consecutive phases. Auto-dummy actions submitted. AFK Boil penalties apply. Entry forfeited to pool.
- Clawboss disconnect >2 phases: Game voids, all players refunded minus rake.
**Spec change:** Add new PRD §X "Disconnection Policy."

### C10: Single Vote Threshold — **MEDIUM**
**Concern:** 1 vote could eliminate a player.
**Resolution:** Require **minimum 2 votes** on a target to eliminate. Single vote = no-lynch + Boil penalty.
**Spec change:** PRD §5 Phase 5 vote rules.

### C11: Boil Phase (100%) Detail — **HIGH**
**Concern:** "Mass reveal + sudden death" lacks specifics.
**Resolution:** At Boil 100%:
1. All roles revealed publicly (GM posts full role list)
2. One final open vote (not encrypted — everyone knows roles)
3. If vote eliminates Clawboss → Pod wins
4. If tied or no-lynch → Clawboss wins (town failed to act)
5. No more night phases after Boil
**Spec change:** PRD §8 Boil Phase detail.

### C12: Molting Edge Cases — **MEDIUM**
**Concern:** Can molt produce second Clawboss? Can Clawboss molt away their role?
**Resolution:**
- Molt cannot produce Clawboss (reroll if generated)
- Clawboss CAN voluntarily molt (risky — may lose killer role, game ends if no killer)
- If molt removes last Clawboss → Pod wins immediately
- Initiate's forced molt cannot target Clawboss
**Spec change:** PRD §9 Molting rules.

### C13: Message Length Side Channel — **CRITICAL**
**Concern:** Encrypted payload size leaks role info.
**Resolution:** **Pad all plaintext to 256 bytes** before encryption. All encrypted outputs will be identical length regardless of content.
**Spec change:** TECHNICAL_SPEC §4.3 encryption flows.

### C14: Mandatory Post-Game Key Disclosure — **MEDIUM**
**Concern:** Optional key disclosure hurts trust.
**Resolution:** **Mandatory.** GM publishes pod private key after game ends. Anyone can verify all actions were resolved correctly.
**Spec change:** TECHNICAL_SPEC §11.4 + PRD §5 Phase 7.

---

## Revised Decisions (Questions from Review)

1. **Initiate alignment for parity:** Neutral. Not counted as town or killer. Parity = killers ≥ town-aligned.
2. **Eliminated players commenting:** No. Eliminated players cannot post game-related comments. GM ignores their actions.
3. **Night action submission order:** GM waits for ALL players before resolving. Randomize announcement order to prevent timing leaks.
4. **Test bot behavior:** Configurable — can be mechanical (fill slots) or simulate basic strategy (random accusations, vote for most-accused).
5. **Ranked/reputation system:** Post-MVP feature. Track win rates in players table for future use.
6. **Molt outcomes:** Random from weighted table. Not deterministic. Table defined in game config.
7. **Invalid Clawboss target:** GM rejects invalid target (dead player, self). Clawboss gets a "wasted night" — no kill. Boil penalty does NOT apply (Clawboss tried to act).
8. **Whisper/DM mechanic:** Not planned. All public. Core design principle.
9. **Spectator experience:** Spectators can read the thread but not comment during active game. Post-game comments allowed.
10. **Clawboss knows Initiate?** No. Clawboss only knows their own role. No faction knowledge.

---

## Spec Changes Required

- [ ] PRD §3.2: Change 3-player row to 4-player (2 Krill + 1 Clawboss + 1 Initiate)
- [ ] PRD §3.1: Shellguard → nightly protect, no self-protect, no consecutive same target
- [ ] PRD §4.3: Initiate win = "alive when game ends AND game lasted 3+ rounds"
- [ ] PRD §4: Clarify Initiate is neutral for parity calculation
- [ ] PRD §5 Phase 5: Add minimum 2-vote threshold for elimination
- [ ] PRD §8: Scale Boil Meter by round (15%/25%/40% progression)
- [ ] PRD §8: Detail Boil Phase at 100% (reveal, open vote, Clawboss wins on tie)
- [ ] PRD §9: Molt cannot produce Clawboss; Clawboss CAN molt; Initiate cannot force-molt Clawboss
- [ ] PRD §10: Simplify prize to equal split for winning team + alive bonus
- [ ] PRD new section: Disconnection policy
- [ ] TECH §4.3: Add 256-byte plaintext padding requirement
- [ ] TECH §11.4: Post-game key disclosure mandatory
