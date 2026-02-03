# Solana DApp - Specification Standard

> **Version:** 1.0
> **Last Updated:** February 2026
> **Applies To:** Next.js Solana DApps

## Purpose

This document defines the standard structure, formatting, and conventions for all technical specifications in Solana DApp projects. Consistent specs improve readability, maintainability, and collaboration.

---

## File Structure

### Folder Organization

```
specs/
├── README.md                     # Product overview, tech stack, navigation
├── SPEC_STANDARD.md              # This standard
├── PRD_STANDARD.md               # Product requirements conventions
│
├── prd/                          # Product Requirements Documents
│   ├── README.md                 # PRD workflow
│   ├── incomplete/               # PRDs in progress
│   ├── complete/                 # Verified PRDs
│   └── examples/                 # Reference examples
│
├── architecture/
│   ├── README.md                 # System architecture overview
│   ├── system-architecture.md    # High-level system design
│   ├── wallet-authentication.md  # Wallet connect and SIWS
│   ├── api-architecture.md       # API route structure
│   ├── state-management.md       # Zustand stores and patterns
│   ├── program-integration.md    # Anchor/program interactions
│   ├── transaction-handling.md   # Transaction lifecycle
│   └── rpc-strategy.md           # RPC providers and failover
│
├── programs/
│   ├── overview.md               # Program accounts and PDAs
│   ├── instructions.md           # Instruction definitions
│   ├── accounts.md               # Account data structures
│   └── errors.md                 # Error code definitions
│
├── api/
│   ├── public-api.md             # Public endpoints
│   ├── authenticated-api.md      # Wallet-authenticated endpoints
│   ├── admin-api.md              # Administrative endpoints
│   └── webhooks.md               # Helius webhook patterns
│
├── data-models/
│   ├── entities.md               # Core entity type definitions
│   ├── database-schema.md        # Off-chain database structure
│   └── on-chain-data.md          # Account structures and PDAs
│
├── features/
│   ├── README.md                 # Feature overview
│   ├── wallet-management.md      # Wallet connection
│   ├── token-operations.md       # SPL token handling
│   ├── nft-management.md         # NFT operations
│   ├── staking.md                # Staking mechanics
│   ├── governance.md             # DAO features
│   └── transaction-history.md    # Activity tracking
│
├── components/
│   ├── ui-components.md          # Reusable UI library
│   ├── wallet-components.md      # Wallet UI patterns
│   └── transaction-components.md # Transaction UI
│
└── testing/
    ├── testing-guide.md          # Test patterns and E2E testing
    └── program-testing.md        # Anchor test patterns
```

### File Naming

- Use lowercase with hyphens: `token-operations.md`, `wallet-authentication.md`
- Use `.md` extension for all spec files
- Use `README.md` for folder index files
- Avoid numbers in filenames (use folder structure for organization)

---

## Document Structure

### Required Header Block

Every spec file must begin with this header block:

```markdown
# [Feature/System Name]

> **Status:** [Implementation Status]
> **Last Updated:** [Month Year]
> **Managed By:** [Team/Owner]
> **Network:** [Mainnet | Devnet | Both] (if applicable)
> **Program:** [Program address] (if applicable)
```

#### Status Values

| Status | Description |
|--------|-------------|
| `Planned` | Not yet implemented |
| `In Development` | Currently being built |
| `Implemented` | Complete and in production |
| `Deprecated` | Being phased out |
| `Mainnet` | Deployed to mainnet |
| `Devnet Only` | Only on devnet |

### Standard Sections

Specs should include these sections in order (skip if not applicable):

1. **Overview** - Brief description of the feature/system
2. **Core Concepts** - Key terminology and concepts
3. **Architecture** - System design (with ASCII diagrams)
4. **On-Chain Data** - Account structures and PDAs (Solana-specific)
5. **Instructions** - Program instructions (Solana-specific)
6. **Data Models** - TypeScript interfaces and database schema
7. **API Endpoints** - Request/response documentation
8. **Transaction Flows** - Transaction building patterns (Solana-specific)
9. **Error Handling** - Error scenarios and recovery
10. **Security Considerations** - Security notes
11. **Implementation Checklist** - TODO items (if planned status)
12. **Related Specifications** - Links to related documentation

---

## Formatting Standards

### Markdown Conventions

#### Headers

```markdown
# Document Title (H1 - only one per file)

## Major Section (H2)

### Subsection (H3)

#### Minor Section (H4)
```

#### Tables

Use tables for structured data:

```markdown
| Field | Type | Description |
|-------|------|-------------|
| `pubkey` | PublicKey | Account public key |
| `lamports` | u64 | Account balance in lamports |
```

#### Code Blocks

Always specify the language:

```markdown
```rust
// Anchor program instruction
pub fn initialize(ctx: Context<Initialize>, amount: u64) -> Result<()> {
    let user = &mut ctx.accounts.user;
    user.balance = amount;
    Ok(())
}
```

```typescript
// TypeScript client
const tx = await program.methods
  .initialize(new BN(1000))
  .accounts({ user: userPda })
  .rpc();
```

```json
{
  "pubkey": "base58...",
  "lamports": 1000000000
}
```
```

#### API Documentation

Use this format for endpoints:

```markdown
#### [METHOD] /api/path/to/endpoint
Description of what this endpoint does.

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Path Parameters:**
- `address` - Wallet address (base58)

**Query Parameters:**
- `network` - solana network (mainnet-beta, devnet)

**Request:**
```json
{
  "amount": "1000000000"
}
```

**Response (200 OK):**
```json
{
  "signature": "base58...",
  "slot": 123456789
}
```

**Errors:**
| Code | Description |
|------|-------------|
| 400 | Invalid request data |
| 401 | Wallet not authenticated |
| 402 | Insufficient balance |
| 404 | Account not found |
```

#### ASCII Diagrams

Use ASCII art for architecture and flow diagrams:

```markdown
```
┌─────────────────────────────────────────────────────────────┐
│  Component Name                                      [Actions]│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Content here                                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
```

### Solana-Specific Standards

#### Account Structures (Anchor/Borsh)

```rust
// Use Anchor account macro
#[account]
pub struct UserAccount {
    /// The wallet that owns this account
    pub authority: Pubkey,       // 32 bytes
    /// User's token balance
    pub balance: u64,            // 8 bytes
    /// Account creation timestamp
    pub created_at: i64,         // 8 bytes
    /// Bump seed for PDA
    pub bump: u8,                // 1 byte
}

// Document account size
impl UserAccount {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 1; // discriminator + fields
}
```

#### PDA Documentation

```markdown
### User Account PDA

**Seeds:** `["user", authority.key().as_ref()]`
**Bump:** Stored in account

```rust
let (user_pda, bump) = Pubkey::find_program_address(
    &[b"user", authority.key().as_ref()],
    program_id,
);
```

| Seed | Type | Description |
|------|------|-------------|
| `"user"` | &[u8] | Static prefix |
| `authority` | Pubkey | User's wallet address |
```

#### Instruction Documentation

```markdown
### Initialize User

Creates a new user account.

**Accounts:**
| Account | Signer | Writable | Description |
|---------|--------|----------|-------------|
| `authority` | ✓ | ✗ | User's wallet |
| `user` | ✗ | ✓ | User PDA (created) |
| `system_program` | ✗ | ✗ | System program |

**Arguments:**
| Arg | Type | Description |
|-----|------|-------------|
| `initial_balance` | u64 | Starting balance |

**Errors:**
| Code | Name | Description |
|------|------|-------------|
| 6000 | `AlreadyInitialized` | User account exists |
| 6001 | `InvalidAmount` | Amount must be > 0 |
```

#### Transaction Flow Documentation

```markdown
### Token Transfer Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │     │    RPC      │     │   Program   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  1. Build TX      │                   │
       ├──────────────────>│                   │
       │                   │                   │
       │  2. Simulate      │                   │
       │<─ ─ ─ ─ ─ ─ ─ ─ ─>│                   │
       │                   │                   │
       │  3. Sign (wallet) │                   │
       │                   │                   │
       │  4. Send TX       │                   │
       ├──────────────────>│  5. Execute      │
       │                   ├──────────────────>│
       │                   │                   │
       │  6. Confirm       │<──────────────────┤
       │<──────────────────┤                   │
       │                   │                   │
```
```

### TypeScript Standards

```typescript
// Use PascalCase for interfaces and types
interface TokenTransferParams {
  mint: PublicKey;
  amount: BN;
  recipient: PublicKey;
}

// Use camelCase for functions and variables
async function transferTokens(params: TokenTransferParams): Promise<string>

// Document complex types
/**
 * Parameters for token transfer instruction
 */
interface TokenTransferParams {
  /** SPL token mint address */
  mint: PublicKey;
  /** Amount in smallest units (e.g., lamports for SOL) */
  amount: BN;
  /** Recipient wallet address */
  recipient: PublicKey;
}

// Use BN for on-chain numeric types
import { BN } from '@coral-xyz/anchor';
const amount = new BN(1_000_000_000); // 1 SOL in lamports
```

### Database Standards (Off-Chain)

```sql
-- Use lowercase with underscores for table/column names
CREATE TABLE user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Always index wallet addresses
CREATE INDEX idx_user_profiles_wallet ON user_profiles(wallet_address);

-- Store signatures and pubkeys as TEXT (base58)
-- Store amounts as NUMERIC for precision
```

---

## API Scopes

Solana DApps typically have these API surfaces:

| Scope | Path | Auth | Purpose |
|-------|------|------|---------|
| **Public** | `/api/public/` | None | Prices, metadata, public data |
| **Authenticated** | `/api/` | JWT (SIWS) | User-specific operations |
| **Admin** | `/api/admin/` | JWT + Admin | System administration |
| **Webhooks** | `/api/webhooks/` | Signature | Helius/external webhooks |

---

## Transaction Types

| Type | Description | Confirmation |
|------|-------------|--------------|
| `transfer` | SOL or token transfer | confirmed |
| `swap` | Token swap via DEX | confirmed |
| `stake` | Stake tokens | finalized |
| `unstake` | Unstake tokens | finalized |
| `mint` | Mint NFT/token | confirmed |
| `burn` | Burn NFT/token | confirmed |
| `governance` | DAO vote/proposal | finalized |

---

## Cross-References

### Internal Links

Use relative paths for internal links:

```markdown
See [Token Operations](./features/token-operations.md) for transfer details.
See [Program Instructions](./programs/instructions.md) for on-chain logic.
```

### Related Specifications Section

End each spec with a Related Specifications section:

```markdown
---

## Related Specifications

- [Token Operations](./features/token-operations.md)
- [Transaction Handling](./architecture/transaction-handling.md)
- [Program Instructions](./programs/instructions.md)
```

---

## Solana-Specific Terminology

Use consistent terminology throughout specs:

| Term | Definition |
|------|------------|
| **Wallet** | User's keypair/address (not "account" for user identity) |
| **Account** | On-chain data storage (Solana account model) |
| **PDA** | Program Derived Address |
| **Instruction** | Single operation in a transaction |
| **Transaction** | Bundle of instructions, atomically executed |
| **Signature** | Transaction signature (base58 string) |
| **Slot** | Solana's time unit (~400ms) |
| **Lamports** | Smallest SOL unit (1 SOL = 1B lamports) |
| **Rent** | Storage cost for on-chain accounts |
| **CU** | Compute Units (transaction compute budget) |

---

## Checklist for New Specs

When creating a new spec:

- [ ] Header block with status, date, network, and managed-by
- [ ] Overview section explaining the feature
- [ ] On-chain data structures (if applicable)
- [ ] Program instructions (if applicable)
- [ ] Data models (TypeScript interfaces)
- [ ] Database schema (if applicable)
- [ ] API endpoints (if applicable)
- [ ] Transaction flows (if applicable)
- [ ] Error handling patterns
- [ ] Related specifications section
- [ ] Added to folder README.md navigation
- [ ] Cross-references use relative paths
- [ ] Code blocks have language specified
- [ ] PDAs documented with seeds and bump

---

## Versioning

Spec changes should:
- Update the "Last Updated" date
- Use clear commit messages describing the change
- Update related specs if cross-references change
- Note network-specific changes (mainnet vs devnet)

---

## Examples

### Good Spec Header

```markdown
# Token Staking

> **Status:** Mainnet
> **Last Updated:** February 2026
> **Managed By:** Core Team
> **Network:** Both
> **Program:** `STAKE...abc123`

## Overview

The staking system allows users to lock tokens for rewards...
```

### Good API Documentation

```markdown
#### POST /api/stake

Prepare a staking transaction for the user to sign.

**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**Request:**
```json
{
  "amount": "1000000000",
  "lockPeriod": 30
}
```

**Response (200 OK):**
```json
{
  "transaction": "base64...",
  "message": "Stake 1 SOL for 30 days",
  "estimatedReward": "50000000"
}
```

**Errors:**
| Code | Description |
|------|-------------|
| 400 | Invalid staking parameters |
| 401 | Wallet not authenticated |
| 402 | Insufficient token balance |
| 429 | Rate limited |
```

### Good Instruction Documentation

```markdown
### Stake Tokens

Stakes user tokens into the protocol vault.

**Accounts:**
| Account | Signer | Writable | Description |
|---------|--------|----------|-------------|
| `authority` | ✓ | ✗ | User's wallet |
| `user_stake` | ✗ | ✓ | User stake PDA |
| `user_token_account` | ✗ | ✓ | User's token ATA |
| `vault` | ✗ | ✓ | Protocol vault PDA |
| `token_program` | ✗ | ✗ | SPL Token program |

**Arguments:**
| Arg | Type | Description |
|-----|------|-------------|
| `amount` | u64 | Amount to stake (in smallest units) |
| `lock_period` | u32 | Lock period in days |

**PDA Seeds:**
- `user_stake`: `["stake", authority, mint]`
- `vault`: `["vault", mint]`

**Errors:**
| Code | Name | Description |
|------|------|-------------|
| 6000 | `InsufficientBalance` | Not enough tokens |
| 6001 | `InvalidLockPeriod` | Lock period out of range |
| 6002 | `StakeAlreadyActive` | Existing stake not yet unlocked |
```

---

## Maintenance

This standard is maintained by the project team. Suggestions for improvements should be discussed before implementation.
