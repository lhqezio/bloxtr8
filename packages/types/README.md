# Bloxtr8 Types Package

Shared TypeScript type definitions and interfaces for the Bloxtr8 platform.

## Features

- **Type Safety**: Comprehensive TypeScript type definitions
- **Zod Schemas**: Runtime validation schemas
- **Shared Interfaces**: Common data structures
- **Enum Definitions**: Platform-wide enums
- **API Types**: Request/response type definitions

## Quick Start

```bash
# Install dependencies
pnpm install

# Build package
pnpm build

# Run tests
pnpm test
```

## Usage

```typescript
import {
  User,
  Listing,
  Offer,
  Contract,
  Escrow,
  KycTier,
  WalletRisk,
  Currency,
  ListingStatus,
  OfferStatus,
  EscrowStatus,
  UserSchema,
  ListingSchema,
  OfferSchema,
} from '@bloxtr8/types';

// Use type definitions
const user: User = {
  id: 'user-id',
  discordId: '123456789',
  username: 'example_user',
  email: 'user@example.com',
  kycTier: KycTier.TIER_1,
  kycVerified: false,
  walletAddress: '0x123...',
  walletRisk: WalletRisk.LOW,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Use validation schemas
const validatedUser = UserSchema.parse(userData);
const validatedListing = ListingSchema.parse(listingData);
```

## Core Types

### User Types

```typescript
export interface User {
  id: string;
  discordId: string;
  username: string;
  email?: string;
  phone?: string;
  kycTier: KycTier;
  kycVerified: boolean;
  walletAddress?: string;
  walletRisk: WalletRisk;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  discordId: string;
  username: string;
  email?: string;
  phone?: string;
}

export interface UpdateUserRequest {
  email?: string;
  phone?: string;
  kycTier?: KycTier;
  kycVerified?: boolean;
  walletAddress?: string;
  walletRisk?: WalletRisk;
}
```

### Guild Types

```typescript
export interface Guild {
  id: string;
  discordId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuildMember {
  id: string;
  role: GuildRole;
  joinedAt: Date;
  userId: string;
  guildId: string;
}
```

### Listing Types

```typescript
export interface Listing {
  id: string;
  title: string;
  summary: string;
  price: number; // Price in cents
  category: string;
  status: ListingStatus;
  userId: string;
  guildId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListingRequest {
  title: string;
  summary: string;
  price: number;
  category: string;
  guildId?: string;
}

export interface UpdateListingRequest {
  title?: string;
  summary?: string;
  price?: number;
  category?: string;
  status?: ListingStatus;
}
```

### Offer Types

```typescript
export interface Offer {
  id: string;
  amount: number; // Amount in cents
  currency: Currency;
  conditions: string;
  expiry: Date;
  status: OfferStatus;
  listingId: string;
  buyerId: string;
  sellerId: string;
  parentId?: string; // For counter-offers
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOfferRequest {
  amount: number;
  currency: Currency;
  conditions: string;
  expiry: Date;
  listingId: string;
}

export interface CounterOfferRequest {
  amount: number;
  currency: Currency;
  conditions: string;
  expiry: Date;
  parentId: string;
}
```

### Contract Types

```typescript
export interface Contract {
  id: string;
  pdfUrl: string;
  sha256: string;
  status: ContractStatus;
  offerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Signature {
  id: string;
  signedAt: Date;
  userId: string;
  contractId: string;
}

export interface CreateContractRequest {
  offerId: string;
  pdfContent: string;
}

export interface SignContractRequest {
  contractId: string;
  signature: string;
}
```

### Escrow Types

```typescript
export interface Escrow {
  id: string;
  rail: EscrowRail;
  amount: number;
  currency: Currency;
  status: EscrowStatus;
  offerId: string;
  contractId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StripeEscrow {
  id: string;
  paymentIntentId: string;
  transferId?: string;
  refundId?: string;
  escrowId: string;
}

export interface StablecoinEscrow {
  id: string;
  chain: string;
  depositAddr: string;
  depositTx?: string;
  releaseTx?: string;
  escrowId: string;
}

export interface MilestoneEscrow {
  id: string;
  title: string;
  amountCents: number;
  status: MilestoneStatus;
  escrowId: string;
}
```

### Delivery Types

```typescript
export interface Delivery {
  id: string;
  title: string;
  description: string;
  status: DeliveryStatus;
  deliveredAt?: Date;
  listingId: string;
  offerId: string;
  contractId: string;
  escrowId: string;
  deliveredBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDeliveryRequest {
  title: string;
  description: string;
  listingId: string;
  offerId: string;
  contractId: string;
  escrowId: string;
}
```

### Dispute Types

```typescript
export interface Dispute {
  id: string;
  title: string;
  description: string;
  status: DisputeStatus;
  resolution?: string;
  escrowId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

export interface CreateDisputeRequest {
  title: string;
  description: string;
  escrowId: string;
}

export interface ResolveDisputeRequest {
  resolution: string;
  status: DisputeStatus;
}
```

## Enums

### KYC and Risk

```typescript
export enum KycTier {
  TIER_1 = 'TIER_1',
  TIER_2 = 'TIER_2',
}

export enum WalletRisk {
  UNKNOWN = 'UNKNOWN',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  SANCTIONED = 'SANCTIONED',
}
```

### Status Enums

```typescript
export enum ListingStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SOLD = 'SOLD',
}

export enum OfferStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  COUNTERED = 'COUNTERED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export enum ContractStatus {
  PENDING_SIGNATURE = 'PENDING_SIGNATURE',
  EXECUTED = 'EXECUTED',
  VOID = 'VOID',
}

export enum EscrowStatus {
  AWAIT_FUNDS = 'AWAIT_FUNDS',
  FUNDS_HELD = 'FUNDS_HELD',
  DELIVERED = 'DELIVERED',
  RELEASED = 'RELEASED',
  DISPUTED = 'DISPUTED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

export enum DeliveryStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  DELIVERED = 'DELIVERED',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

export enum DisputeStatus {
  OPEN = 'OPEN',
  IN_REVIEW = 'IN_REVIEW',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}
```

### Payment and Currency

```typescript
export enum Currency {
  USD = 'USD',
  USDC = 'USDC',
}

export enum EscrowRail {
  STRIPE = 'STRIPE',
  USDC_BASE = 'USDC_BASE',
}

export enum MilestoneStatus {
  PENDING = 'PENDING',
  FUNDS_HELD = 'FUNDS_HELD',
  DELIVERED = 'DELIVERED',
  RELEASED = 'RELEASED',
}
```

### Guild Roles

```typescript
export enum GuildRole {
  MEMBER = 'MEMBER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
}
```

## Validation Schemas

### Zod Schemas

```typescript
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  discordId: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  kycTier: z.nativeEnum(KycTier),
  kycVerified: z.boolean(),
  walletAddress: z.string().optional(),
  walletRisk: z.nativeEnum(WalletRisk),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ListingSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1000),
  price: z.number().positive(),
  category: z.string().min(1),
  status: z.nativeEnum(ListingStatus),
  userId: z.string().uuid(),
  guildId: z.string().uuid().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const OfferSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.nativeEnum(Currency),
  conditions: z.string().max(500),
  expiry: z.date().future(),
  status: z.nativeEnum(OfferStatus),
  listingId: z.string().uuid(),
  buyerId: z.string().uuid(),
  sellerId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

## API Types

### Request/Response Types

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  code?: string;
}
```

### Webhook Types

```typescript
export interface WebhookEvent {
  id: string;
  eventId: string;
  provider: string;
  processed: boolean;
  createdAt: Date;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
}

export interface CustodianWebhookEvent {
  id: string;
  type: string;
  data: {
    transactionId: string;
    status: string;
    amount: number;
    currency: string;
  };
  timestamp: number;
}
```

## Development

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Setup

```bash
# Install dependencies
pnpm install

# Build package
pnpm build

# Run tests
pnpm test

# Watch for changes
pnpm dev
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test -- --coverage

# Run specific test file
pnpm test -- user.test.ts
```

## Architecture

### File Structure

```
src/
├── index.ts           # Main exports
├── types/             # TypeScript type definitions
│   ├── user.ts        # User-related types
│   ├── listing.ts     # Listing-related types
│   ├── offer.ts       # Offer-related types
│   ├── contract.ts    # Contract-related types
│   ├── escrow.ts      # Escrow-related types
│   ├── delivery.ts    # Delivery-related types
│   ├── dispute.ts     # Dispute-related types
│   └── api.ts         # API-related types
├── schemas/           # Zod validation schemas
│   ├── user.ts        # User schemas
│   ├── listing.ts     # Listing schemas
│   ├── offer.ts       # Offer schemas
│   └── contract.ts    # Contract schemas
├── enums/             # Enum definitions
│   ├── status.ts      # Status enums
│   ├── currency.ts    # Currency enums
│   └── roles.ts       # Role enums
└── __tests__/         # Test files
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your type definitions
4. Add validation schemas
5. Add tests for new types
6. Run `pnpm lint` and `pnpm test`
7. Submit a pull request

## License

ISC License - see LICENSE file for details
