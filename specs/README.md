# Solana DApp - Technical Specifications

> **Product:** [Your DApp Name]
> **Network:** Solana (Mainnet-Beta / Devnet)
> **Status:** Development
> **Last Updated:** February 2026

## Overview

This is a Next.js 15 application built on Solana, providing [describe your DApp's purpose]. The platform integrates with Solana programs, supports wallet authentication, and handles on-chain transactions for [tokens/NFTs/DeFi/etc.].

---

## Documentation Types

| Type | Purpose | Format | Location |
|------|---------|--------|----------|
| **SPEC** | Architecture, how it works | Diagrams, schemas | `specs/` folders |
| **PRD** | Features, what it must do | Given/When/Then | `specs/prd/` |

See:
- [SPEC_STANDARD.md](./SPEC_STANDARD.md) - Architecture spec format
- [PRD_STANDARD.md](./PRD_STANDARD.md) - Product requirements format

---

## Specification Index

### Product Requirements (PRDs)

| Document | Description |
|----------|-------------|
| [PRD README](./prd/README.md) | PRD workflow and status tracking |
| [PRD Examples](./prd/examples/) | Reference PRD examples |

### Architecture

| Specification | Description |
|---------------|-------------|
| [System Architecture](./architecture/system-architecture.md) | High-level system architecture and component overview |
| [Wallet Authentication](./architecture/wallet-authentication.md) | Wallet connect flows, SIWS, and session management |
| [State Management](./architecture/state-management.md) | Zustand stores and client-side state patterns |
| [API Architecture](./architecture/api-architecture.md) | API route structure and middleware patterns |
| [Program Integration](./architecture/program-integration.md) | Solana program interactions and Anchor integration |
| [Transaction Handling](./architecture/transaction-handling.md) | Transaction building, signing, and confirmation patterns |
| [RPC Strategy](./architecture/rpc-strategy.md) | RPC providers, failover, and rate limiting |
| [Supabase Integration](./architecture/supabase-integration.md) | Database, Realtime subscriptions, and Storage architecture |

### Core Features

| Specification | Description |
|---------------|-------------|
| [Wallet Management](./features/wallet-management.md) | Wallet connection, multi-wallet support |
| [Token Operations](./features/token-operations.md) | SPL token transfers, swaps, and balances |
| [NFT Management](./features/nft-management.md) | NFT minting, listing, and metadata |
| [Staking](./features/staking.md) | Token staking and reward distribution |
| [Governance](./features/governance.md) | DAO voting and proposals |
| [Transaction History](./features/transaction-history.md) | On-chain activity tracking and display |
| [Notifications](./features/notifications.md) | Transaction confirmations and alerts |

### Program Specifications

| Specification | Description |
|---------------|-------------|
| [Program Overview](./programs/overview.md) | Deployed program accounts and PDAs |
| [Instruction Set](./programs/instructions.md) | Program instruction definitions |
| [Account Structures](./programs/accounts.md) | On-chain account data layouts |
| [Error Codes](./programs/errors.md) | Program error definitions |

### API Specifications

| Specification | Description |
|---------------|-------------|
| [Public API](./api/public-api.md) | Public endpoints (prices, metadata) |
| [Authenticated API](./api/authenticated-api.md) | Wallet-authenticated endpoints |
| [Admin API](./api/admin-api.md) | Administrative endpoints |
| [Webhooks](./api/webhooks.md) | Helius/webhook integration patterns |

### Data Models

| Specification | Description |
|---------------|-------------|
| [Entity Models](./data-models/entities.md) | Core entity type definitions |
| [Database Schema](./data-models/database-schema.md) | Off-chain database structure |
| [On-Chain Data](./data-models/on-chain-data.md) | Account data structures and PDAs |

### Components

| Specification | Description |
|---------------|-------------|
| [UI Components](./components/ui-components.md) | Reusable UI component library |
| [Wallet Components](./components/wallet-components.md) | Wallet connection UI patterns |
| [Transaction Components](./components/transaction-components.md) | Transaction signing and status UI |

### Testing

| Specification | Description |
|---------------|-------------|
| [Testing Guide](./testing/testing-guide.md) | Test harness, patterns, mocks, and E2E testing |
| [Program Testing](./testing/program-testing.md) | Anchor test patterns and localnet setup |
| [E2E Playwright](./testing/e2e-playwright.md) | Playwright E2E testing with wallet mocking |

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, React 19, TypeScript |
| **Styling** | Tailwind CSS, Radix UI, shadcn/ui |
| **State** | Zustand, TanStack Query |
| **Blockchain** | Solana Web3.js, Anchor, SPL Token |
| **Wallet** | Solana Wallet Adapter |
| **Database** | Supabase (PostgreSQL) / Prisma |
| **RPC** | Helius / QuickNode / Triton |
| **Indexing** | Helius DAS API / Custom Indexer |
| **Validation** | Zod |
| **Forms** | React Hook Form |
| **E2E Testing** | Playwright |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── auth/          # Wallet authentication
│   │   ├── actions/       # Server actions
│   │   ├── webhooks/      # Helius webhooks
│   │   └── public/        # Public endpoints
│   ├── (auth)/            # Authenticated routes
│   └── (public)/          # Public routes
├── components/            # React components
│   ├── ui/                # Reusable UI components
│   ├── wallet/            # Wallet connection components
│   ├── transaction/       # Transaction UI components
│   └── [feature]/         # Feature-specific components
├── lib/                   # Utilities and business logic
│   ├── solana/            # Solana client utilities
│   │   ├── programs/      # Program IDL and clients
│   │   ├── transactions/  # Transaction builders
│   │   └── accounts/      # Account fetching utilities
│   ├── stores/            # Zustand stores
│   ├── hooks/             # Custom React hooks
│   └── utils/             # Utility functions
├── types/                 # TypeScript type definitions
└── anchor/                # Anchor program (if monorepo)
    ├── programs/          # Rust programs
    ├── tests/             # Anchor tests
    └── target/            # Build artifacts
e2e/                       # Playwright E2E tests
├── fixtures/              # Test fixtures (wallet mock, etc.)
├── helpers/               # Test helpers and utilities
└── [feature].spec.ts      # Feature E2E test files
specs/                     # Technical specifications
├── prd/                   # Product requirements
├── architecture/          # Architecture specs
├── programs/              # Program specs
└── testing/               # Testing specs
```

## Key Concepts

### Wallet Authentication
Users authenticate by signing a message with their wallet (Sign-In With Solana). Sessions are managed via JWT tokens stored in HTTP-only cookies. The wallet address serves as the user identifier.

### Program Derived Addresses (PDAs)
The application uses PDAs for deterministic account addresses:

```
┌─────────────────────────────────────────────────────────────┐
│  PDA STRUCTURE                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User Profile PDA                                           │
│  Seeds: ["user", wallet_pubkey]                             │
│                                                             │
│  User Token Account PDA                                     │
│  Seeds: ["vault", wallet_pubkey, mint]                      │
│                                                             │
│  Global State PDA                                           │
│  Seeds: ["global"]                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Transaction Flow

```
┌─────────────────────────────────────────────────────────────┐
│  TRANSACTION LIFECYCLE                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. BUILD → Construct transaction with instructions         │
│  2. SIMULATE → Verify transaction will succeed              │
│  3. SIGN → User approves in wallet                          │
│  4. SEND → Submit to RPC                                    │
│  5. CONFIRM → Wait for confirmation (processed/confirmed)   │
│  6. FINALIZE → Transaction is finalized on-chain            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### RPC Strategy

The application uses a tiered RPC approach:

| Priority | Provider | Use Case |
|----------|----------|----------|
| Primary | Helius | All operations, DAS API |
| Fallback | QuickNode | Failover for sends |
| Backup | Public RPC | Emergency fallback |

### Off-Chain Data

While core state lives on-chain, the application maintains off-chain data for:
- **User preferences** - UI settings, notification preferences
- **Transaction metadata** - Labels, categories, notes
- **Cached data** - Token prices, NFT metadata
- **Analytics** - Usage tracking (anonymized)

### Error Handling

Transactions can fail for various reasons:

| Error Type | Handling |
|------------|----------|
| Insufficient SOL | Show balance, suggest deposit |
| Insufficient tokens | Show balance, suggest swap |
| Slippage exceeded | Retry with higher slippage |
| Blockhash expired | Rebuild and retry transaction |
| Program error | Parse error code, show message |
| Network congestion | Retry with priority fee |

---

## Quick Links

- [Getting Started](./architecture/system-architecture.md#getting-started)
- [API Reference](./api/authenticated-api.md)
- [Program Documentation](./programs/overview.md)
- [Environment Variables](#environment-variables)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SOLANA_NETWORK` | Network: mainnet-beta, devnet, localnet |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Primary RPC endpoint |
| `HELIUS_API_KEY` | Helius API key for DAS and webhooks |
| `HELIUS_WEBHOOK_SECRET` | Helius webhook signing secret |
| `QUICKNODE_RPC_URL` | QuickNode fallback RPC |
| `NEXT_PUBLIC_APP_URL` | Application base URL |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `JWT_SECRET` | JWT signing secret for sessions |
| `NEXT_PUBLIC_PROGRAM_ID` | Deployed program address |

## Networks

| Network | RPC | Explorer |
|---------|-----|----------|
| Mainnet | `https://api.mainnet-beta.solana.com` | [Solscan](https://solscan.io) |
| Devnet | `https://api.devnet.solana.com` | [Solscan Devnet](https://solscan.io/?cluster=devnet) |
| Localnet | `http://localhost:8899` | N/A |

## Program Addresses

| Program | Mainnet | Devnet |
|---------|---------|--------|
| Main Program | `PROG...` | `PROG...` |
| Token Mint | `MINT...` | `MINT...` |
