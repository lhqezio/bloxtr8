# Bloxtr8 Shared Package

Shared utilities, constants, and helper functions used across the Bloxtr8 platform.

## Features

- **Common Utilities**: Reusable helper functions
- **Constants**: Shared configuration values
- **Validation**: Zod schema validation helpers
- **Type Definitions**: Shared TypeScript types
- **Helper Functions**: Platform-specific utilities

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
  validateEmail, 
  formatCurrency, 
  generateId,
  API_ENDPOINTS,
  CURRENCY_TYPES 
} from '@bloxtr8/shared';

// Validate email address
const isValid = validateEmail('user@example.com');

// Format currency for display
const formatted = formatCurrency(50000, 'USD'); // "$500.00"

// Generate unique ID
const id = generateId();

// Use shared constants
const endpoint = API_ENDPOINTS.LISTINGS;
const currency = CURRENCY_TYPES.USD;
```

## Available Utilities

### Validation Helpers

- `validateEmail(email: string)` - Email validation
- `validatePhone(phone: string)` - Phone number validation
- `validateWalletAddress(address: string)` - Crypto wallet validation
- `validateDiscordId(id: string)` - Discord ID validation

### Formatting Functions

- `formatCurrency(amount: number, currency: string)` - Currency formatting
- `formatDate(date: Date)` - Date formatting
- `formatTimestamp(timestamp: number)` - Timestamp formatting
- `truncateText(text: string, maxLength: number)` - Text truncation

### ID Generation

- `generateId()` - Generate unique ID
- `generateContractId()` - Generate contract-specific ID
- `generateEscrowId()` - Generate escrow-specific ID

### Validation Schemas

- `UserSchema` - User validation schema
- `ListingSchema` - Listing validation schema
- `OfferSchema` - Offer validation schema
- `ContractSchema` - Contract validation schema

## Constants

### API Endpoints

```typescript
export const API_ENDPOINTS = {
  USERS: '/api/users',
  LISTINGS: '/api/listings',
  OFFERS: '/api/offers',
  CONTRACTS: '/api/contracts',
  ESCROWS: '/api/escrows',
  DISPUTES: '/api/disputes',
} as const;
```

### Currency Types

```typescript
export const CURRENCY_TYPES = {
  USD: 'USD',
  USDC: 'USDC',
} as const;
```

### Status Enums

```typescript
export const LISTING_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SOLD: 'SOLD',
} as const;

export const OFFER_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  COUNTERED: 'COUNTERED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
} as const;
```

### KYC Tiers

```typescript
export const KYC_TIERS = {
  TIER_1: 'TIER_1',
  TIER_2: 'TIER_2',
} as const;
```

## Type Definitions

### Common Types

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

export interface Listing {
  id: string;
  title: string;
  summary: string;
  price: number;
  category: string;
  status: ListingStatus;
  userId: string;
  guildId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Offer {
  id: string;
  amount: number;
  currency: Currency;
  conditions: string;
  expiry: Date;
  status: OfferStatus;
  listingId: string;
  buyerId: string;
  sellerId: string;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Enums

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

export enum Currency {
  USD = 'USD',
  USDC = 'USDC',
}
```

## Validation Schemas

### Zod Schemas

```typescript
import { z } from 'zod';

export const UserSchema = z.object({
  discordId: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  kycTier: z.nativeEnum(KycTier),
  kycVerified: z.boolean(),
  walletAddress: z.string().optional(),
  walletRisk: z.nativeEnum(WalletRisk),
});

export const ListingSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1000),
  price: z.number().positive(),
  category: z.string().min(1),
  status: z.nativeEnum(ListingStatus),
  userId: z.string().uuid(),
  guildId: z.string().uuid().optional(),
});

export const OfferSchema = z.object({
  amount: z.number().positive(),
  currency: z.nativeEnum(Currency),
  conditions: z.string().max(500),
  expiry: z.date().future(),
  listingId: z.string().uuid(),
  buyerId: z.string().uuid(),
  sellerId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
});
```

## Helper Functions

### Discord Integration

```typescript
export function formatDiscordUser(user: User): string {
  return `${user.username} (${user.discordId})`;
}

export function validateDiscordId(id: string): boolean {
  return /^\d{17,19}$/.test(id);
}
```

### Currency Handling

```typescript
export function formatCurrency(amount: number, currency: Currency): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'USDC' ? 'USD' : currency,
  });
  return formatter.format(amount / 100); // Convert cents to dollars
}

export function parseCurrency(amount: string): number {
  return Math.round(parseFloat(amount) * 100); // Convert dollars to cents
}
```

### Date Utilities

```typescript
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
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
pnpm test -- validation.test.ts
```

## Architecture

### File Structure

```
src/
├── index.ts           # Main exports
├── constants/         # Shared constants
│   ├── api.ts        # API endpoints
│   ├── currency.ts   # Currency types
│   └── status.ts     # Status enums
├── schemas/          # Zod validation schemas
│   ├── user.ts       # User schemas
│   ├── listing.ts    # Listing schemas
│   └── offer.ts      # Offer schemas
├── types/            # TypeScript type definitions
│   ├── user.ts       # User types
│   ├── listing.ts    # Listing types
│   └── offer.ts      # Offer types
├── utils/             # Utility functions
│   ├── validation.ts # Validation helpers
│   ├── formatting.ts # Formatting functions
│   └── id.ts         # ID generation
└── __tests__/        # Test files
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your utility functions
4. Add tests for new functionality
5. Run `pnpm lint` and `pnpm test`
6. Submit a pull request

## License

ISC License - see LICENSE file for details
