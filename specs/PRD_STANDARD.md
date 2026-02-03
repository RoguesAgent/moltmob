# PRD Standard - Testable Product Requirements

> **Status:** Active
> **Last Updated:** February 2026
> **Managed By:** Core Team

## Purpose

This standard defines how to write Product Requirements Documents (PRDs) that enable:
1. **Automated test generation** from acceptance criteria
2. **"Grill me" workflows** - Claude challenges implementation completeness
3. **"Prove it works" verification** - Demonstrate behavior with tests
4. **Unambiguous handoff** - Reduce interpretation variance

---

## SPEC vs PRD Hierarchy

```
SPEC (Architecture)                    ← Top-level structure
├── System architecture
├── Program accounts & PDAs
├── Transaction patterns
├── API design
└── Rarely changes after implementation
    │
    └── PRD (Features)                 ← Feature-level implementation
        ├── Acceptance criteria
        ├── Edge cases
        ├── Test matrix
        ├── Git commits tracked        ← Traceability
        └── Updated per sprint
```

| Aspect | SPEC (Architecture) | PRD (Features) |
|--------|---------------------|----------------|
| Focus | How the system works | What features must do |
| Scope | System-wide structure | Individual features |
| Format | Diagrams, schemas | Given/When/Then |
| Changes | Rarely (breaking changes) | Per feature/sprint |
| Validation | Design review | Automated tests |
| Git Tracking | N/A | **Commits linked to PRD** |
| Location | `specs/` folders | `specs/prd/` |

**Both are needed.** SPECs define architecture (stable). PRDs define testable features with git traceability (evolving).

---

## PRD Lifecycle

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           PRD WORKFLOW                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. CREATE → specs/prd/incomplete/                                          │
│     Status: Draft                                                            │
│     - Initial requirements                                                   │
│     - Acceptance criteria                                                    │
│     - Edge cases identified                                                  │
│                                                                              │
│  2. REVIEW → "Grill me" workflow                                            │
│     Status: Ready                                                            │
│     - All ACs have Given/When/Then                                          │
│     - Edge cases enumerated                                                  │
│     - Verification commands defined                                          │
│                                                                              │
│  3. IMPLEMENT → Code + Tests                                                │
│     Status: Implemented                                                      │
│     - Tests written for each AC                                             │
│     - Test files linked in PRD                                              │
│                                                                              │
│  4. VERIFY → "Prove it works" workflow                                      │
│     Status: Verified                                                         │
│     - All tests passing                                                      │
│     - Coverage > 80%                                                         │
│                                                                              │
│  5. MOVE → specs/prd/complete/                                              │
│     - Archive for reference                                                  │
│     - Links from architecture specs                                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Folder Structure

```
specs/prd/
├── README.md           # Workflow documentation
├── incomplete/         # PRDs in progress
│   ├── feature-a.md    # Status: Draft/Ready/Implemented
│   └── feature-b.md
├── complete/           # Verified PRDs
│   ├── feature-x.md    # Status: Verified
│   └── feature-y.md
└── examples/           # Reference examples
    └── token-stake.md
```

---

## PRD File Structure

```markdown
# Feature: [Feature Name]

> **Status:** Draft | Ready | Implemented | Verified
> **Priority:** P0 (Critical) | P1 (High) | P2 (Medium) | P3 (Low)
> **Owner:** [Team/Person]
> **Target:** [Release/Sprint]
> **Test Coverage:** [0-100%] ← Updated by CI
> **Branch:** feature/[feature-name]
> **Network:** Mainnet | Devnet | Both

## Problem Statement
[1-2 sentences: What problem does this solve?]

## Success Metrics
[Measurable outcomes that define success]

## User Stories
[As a X, I want Y, so that Z]

## Acceptance Criteria
[Given/When/Then format - THIS IS THE CORE]

## Edge Cases
[Explicitly enumerate edge cases]

## Out of Scope
[What this feature does NOT do]

## Test Matrix
[Generated from acceptance criteria]

## Verification Commands
[Commands Claude can run to prove it works]

## Git History
[Commits linked to this PRD - updated during implementation]
```

---

## Git Commit Tracking

PRDs track all commits related to the feature. This enables:
- **Traceability** - Link any commit to its requirements
- **Code review** - Verify commit addresses specific AC
- **Rollback** - Know what to revert if feature fails
- **Audit** - Full history of implementation

### Git History Section Format

```markdown
## Git History

| Commit | Date | Author | Description | ACs Addressed |
|--------|------|--------|-------------|---------------|
| `a1b2c3d` | 2026-02-01 | @dev | Add staking instruction | AC-001, AC-002 |
| `e4f5g6h` | 2026-02-02 | @dev | Add PDA derivation | AC-003 |
| `i7j8k9l` | 2026-02-03 | @dev | Handle insufficient balance | AC-004, EC-001 |

**Branch:** `feature/token-staking`
**PR:** #123
**Merged:** 2026-02-05
```

### Commit Message Convention

Reference the PRD and AC in commit messages:

```
feat(staking): add stake tokens instruction

Implements AC-001 and AC-002 from token-staking PRD.
- Creates user stake PDA
- Validates token balance
- Transfers to vault

PRD: specs/prd/incomplete/token-staking.md
```

---

## Acceptance Criteria Format

Use **Given/When/Then** (Gherkin-style) for all criteria. This format:
- Is unambiguous
- Maps directly to tests
- Enables Claude to verify implementation

### Template

```markdown
### AC-[NUMBER]: [Title]

**Given** [precondition/context]
**When** [action/trigger]
**Then** [expected outcome]

**Test Type:** Unit | Integration | E2E | Program
**Automation:** Auto | Manual | Pending
**Test File:** `path/to/test.spec.ts` (added after implementation)
```

### Example (Solana-Specific)

```markdown
### AC-001: Stake tokens with sufficient balance

**Given** a user wallet with 10 SOL balance
**And** a connected wallet adapter
**When** the user submits a stake transaction for 5 SOL
**Then** the transaction is signed by the wallet
**And** the transaction is confirmed on-chain
**And** the user's stake PDA shows 5 SOL staked
**And** the vault PDA balance increases by 5 SOL

**Test Type:** Integration
**Automation:** Auto
**Test File:** `tests/staking.test.ts`
```

```markdown
### AC-002: Stake instruction creates correct PDA

**Given** a valid authority pubkey
**And** a valid token mint
**When** the stake instruction is called
**Then** the user_stake PDA is derived with seeds ["stake", authority, mint]
**And** the account is initialized with correct data layout
**And** the bump is stored in the account

**Test Type:** Program
**Automation:** Auto
**Test File:** `anchor/tests/staking.ts`
```

---

## Edge Cases Section

Explicitly enumerate edge cases. Claude will "grill you" on these.

```markdown
## Edge Cases

| ID | Scenario | Expected Behavior | Covered By |
|----|----------|-------------------|------------|
| EC-001 | Insufficient SOL balance | Show error, don't submit TX | AC-003 |
| EC-002 | Insufficient token balance | Show balance, suggest swap | AC-004 |
| EC-003 | Wallet disconnected mid-TX | Show reconnect prompt | AC-005 |
| EC-004 | Transaction timeout (blockhash expired) | Rebuild TX, retry | AC-006 |
| EC-005 | Network congestion (TX dropped) | Retry with priority fee | AC-007 |
| EC-006 | RPC node unavailable | Failover to backup RPC | AC-008 |
| EC-007 | Stake PDA already exists | Return existing stake info | AC-009 |
| EC-008 | Concurrent stake attempts | Both succeed if balance allows | AC-010 |
| EC-009 | Program upgrade during TX | Handle gracefully, retry | AC-011 |
```

---

## Test Matrix

Auto-generated from acceptance criteria. Shows coverage gaps.

```markdown
## Test Matrix

| Criteria | Unit | Integration | E2E | Program | Status |
|----------|------|-------------|-----|---------|--------|
| AC-001 | - | ✓ | ✓ | ✓ | ✅ Passing |
| AC-002 | ✓ | - | - | ✓ | ✅ Passing |
| AC-003 | ✓ | ✓ | - | - | ⚠️ Flaky |
| AC-004 | ✓ | ✓ | - | - | ❌ Missing |
| AC-005 | - | ✓ | ✓ | - | 🚧 In Progress |
```

---

## Verification Commands

Commands Claude can run to prove implementation works.

```markdown
## Verification Commands

### Run All Feature Tests
```bash
pnpm test --grep "staking"
```

### Run Anchor Program Tests
```bash
cd anchor && anchor test
```

### Run Specific Test File
```bash
pnpm test tests/staking.test.ts
```

### Verify On-Chain State (Devnet)
```bash
# Check user stake PDA
solana account <STAKE_PDA_ADDRESS> --url devnet

# Check vault balance
spl-token balance <VAULT_ADDRESS> --url devnet
```

### Test API Endpoint
```bash
curl -X POST http://localhost:3000/api/stake \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": "1000000000", "lockPeriod": 30}'
```

### Verify Transaction
```bash
# Check transaction status
solana confirm <SIGNATURE> --url devnet -v
```
```

---

## "Grill Me" Workflow

When you say **"Grill me on these changes"**, Claude should:

### 1. Check Acceptance Criteria Coverage

```
For each AC in the PRD:
  ✓ Is there a corresponding test?
  ✓ Does the test actually verify the AC?
  ✓ Is the test passing?
```

### 2. Challenge Edge Cases

```
For each edge case:
  ? Is this handled in the code?
  ? Is there a test for this?
  ? What happens if [edge case] occurs?
```

### 3. Ask Solana-Specific Questions

```
- "What happens when the RPC returns stale data?"
- "How do you handle transaction confirmation timeouts?"
- "What if the blockhash expires before signing completes?"
- "How does this behave with wallet disconnection?"
- "What's the retry strategy for dropped transactions?"
- "How do you handle priority fees during congestion?"
- "What if the PDA already exists?"
- "Is there a race condition with concurrent transactions?"
```

### 4. Verify Claims

```
- "Run the Anchor tests and show me results"
- "Show me the PDA derivation is correct"
- "Prove the transaction simulation passes"
- "Show me the account data after the instruction"
```

---

## "Prove It Works" Workflow

When you say **"Prove to me this works"**, Claude should:

### 1. Run Verification Commands

Execute all commands in the Verification Commands section.

### 2. Show Before/After (On-Chain)

```markdown
### Before (baseline)
- User SOL balance: 10.5 SOL
- User stake PDA: Does not exist
- Vault balance: 1000 tokens

### After (stake submitted)
- User SOL balance: 5.49 SOL (5 staked + 0.01 TX fee)
- User stake PDA: Created, shows 5 SOL staked
- Vault balance: 1005 tokens
```

### 3. Demonstrate Edge Cases

```markdown
### Edge Case: Insufficient Balance
Action: Attempt to stake 20 SOL with only 10 SOL balance
Expected: Transaction simulation fails, error shown to user
Actual: ✅ "Insufficient balance. You have 10 SOL, need 20 SOL"

### Edge Case: Blockhash Expired
Action: Delay signing for 2 minutes
Expected: Transaction rebuilt with fresh blockhash
Actual: ✅ New transaction created, signed, confirmed
```

### 4. Show Test Results

```markdown
### Test Results
  ✓ AC-001: Stake tokens with valid balance (2.3s)
  ✓ AC-002: PDA derived correctly (1.1s)
  ✓ AC-003: Insufficient balance shows error (0.8s)
  ✓ EC-001: Blockhash expired triggers rebuild (3.2s)
  ✓ EC-002: RPC failover works (1.5s)

  5 passed (8.9s)
```

---

## PRD Checklist

Before marking a PRD as "Ready":

```markdown
## PRD Readiness Checklist

- [ ] Problem statement is clear (1-2 sentences)
- [ ] Success metrics are measurable
- [ ] All user stories follow "As a X, I want Y, so that Z"
- [ ] All acceptance criteria use Given/When/Then
- [ ] Each AC specifies test type (Unit/Integration/E2E/Program)
- [ ] Edge cases are explicitly enumerated
- [ ] Solana-specific edge cases included (RPC, blockhash, confirmation)
- [ ] Out of scope is defined
- [ ] Verification commands are provided
- [ ] Network specified (Mainnet/Devnet/Both)
- [ ] No ambiguous terms (define any domain-specific language)
```

---

## Example PRD

See: [Example: Token Staking](./prd/examples/token-staking.md)

---

## Integration with Claude Code

Add to your CLAUDE.md:

```markdown
## PRD Workflow Commands

When I say:
- **"Grill me"** → Challenge my implementation against the PRD
- **"Prove it works"** → Run verification commands and show results
- **"Elegant solution"** → Refactor while maintaining all ACs
- **"Test coverage?"** → Show the test matrix status
- **"What's missing?"** → List uncovered acceptance criteria
- **"Check on-chain"** → Verify state on devnet/localnet
```

---

## Solana-Specific Verification Patterns

### Verify PDA Derivation

```typescript
// In tests, verify PDA matches expected derivation
const [expectedPda, expectedBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("stake"), authority.toBuffer(), mint.toBuffer()],
  program.programId
);

expect(actualPda.toBase58()).toBe(expectedPda.toBase58());
expect(accountData.bump).toBe(expectedBump);
```

### Verify Account Data

```typescript
// Fetch and verify account data
const stakeAccount = await program.account.userStake.fetch(stakePda);

expect(stakeAccount.authority.toBase58()).toBe(wallet.publicKey.toBase58());
expect(stakeAccount.amount.toNumber()).toBe(5_000_000_000); // 5 SOL
expect(stakeAccount.lockPeriod).toBe(30);
```

### Verify Transaction Effects

```typescript
// Check balances changed correctly
const balanceBefore = await connection.getBalance(wallet.publicKey);
await stakeTokens(5);
const balanceAfter = await connection.getBalance(wallet.publicKey);

// Account for rent + TX fee
expect(balanceBefore - balanceAfter).toBeGreaterThan(5_000_000_000);
expect(balanceBefore - balanceAfter).toBeLessThan(5_010_000_000);
```

---

## Related Specs

- [SPEC_STANDARD.md](./SPEC_STANDARD.md) - Architecture spec format
- [Transaction Handling](./architecture/transaction-handling.md) - TX patterns
- [Program Instructions](./programs/instructions.md) - Instruction specs
