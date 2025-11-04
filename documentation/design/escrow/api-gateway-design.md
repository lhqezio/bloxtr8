# API Gateway Escrow Integration Design Document

## Overview

This document defines the complete API Gateway design for escrow operations in Bloxtr8, serving as the blueprint for implementation. The API Gateway acts as the entry point for all escrow-related operations, handling authentication, authorization, validation, command emission, and read model queries.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [REST API Endpoints Specification](#rest-api-endpoints-specification)
3. [Authentication & Authorization](#authentication--authorization)
4. [Command Emission Patterns](#command-emission-patterns)
5. [Read Model Query Patterns](#read-model-query-patterns)
6. [Error Handling & Validation](#error-handling--validation)
7. [OpenAPI/Swagger Documentation](#openapiswagger-documentation)

## Architecture Overview

### API Gateway Role

The API Gateway serves as:

- **Entry Point**: Single point of entry for all escrow operations
- **Authentication Layer**: Validates JWT tokens and extracts user context
- **Authorization Layer**: Enforces role-based access control (buyer, seller, admin)
- **Validation Layer**: Validates request payloads using Zod schemas
- **Command Emitter**: Publishes commands to Kafka for async processing
- **Query Handler**: Handles read model queries directly via Prisma

### Technology Stack

- **Framework**: Express.js with TypeScript
- **Authentication**: Better Auth (JWT tokens)
- **Validation**: Zod schemas
- **Event Bus**: Apache Kafka (for commands)
- **Database**: PostgreSQL via Prisma ORM
- **Error Format**: RFC 7807 Problem Details

## REST API Endpoints Specification

### Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://api.bloxtr8.com`

### Endpoint Categories

#### 1. Escrow Management

**POST /api/escrow**

- **Purpose**: Create new escrow
- **Authentication**: Required (Bearer token)
- **Authorization**: Buyer or Seller
- **Request Body**:

  ```json
  {
    "offerId": "string",
    "contractId": "string",
    "rail": "STRIPE" | "USDC_BASE",
    "amount": "string (BigInt)",
    "currency": "USD" | "USDC",
    "sellerStripeAccountId": "string (optional)",
    "buyerFee": "number (optional)",
    "sellerFee": "number (optional)",
    "idempotencyKey": "string (optional)"
  }
  ```

- **Response**: `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "escrowId": "string",
      "clientSecret": "string (Stripe only)",
      "paymentIntentId": "string (Stripe only)",
      "depositAddress": "string (USDC only)",
      "status": "AWAIT_FUNDS"
    }
  }
  ```

**GET /api/escrow/:id**

- **Purpose**: Retrieve escrow details
- **Authentication**: Required
- **Authorization**: Buyer, Seller, or Admin
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "id": "string",
      "rail": "STRIPE" | "USDC_BASE",
      "amount": "string",
      "currency": "USD" | "USDC",
      "status": "AWAIT_FUNDS" | "FUNDS_HELD" | "DELIVERED" | "RELEASED" | "DISPUTED" | "REFUNDED" | "CANCELLED",
      "offer": {...},
      "contract": {...},
      "stripeEscrow": {...},
      "stablecoinEscrow": {...},
      "deliveries": [...],
      "disputes": [...],
      "auditLogs": [...]
    }
  }
  ```

**GET /api/escrow**

- **Purpose**: List escrows with filtering
- **Authentication**: Required
- **Authorization**: Buyer, Seller, or Admin
- **Query Parameters**:
  - `status`: Filter by status
  - `rail`: Filter by rail
  - `buyerId`: Filter by buyer
  - `sellerId`: Filter by seller
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 10, max: 50)
- **Response**: `200 OK` with pagination

#### 2. Payment Operations

**POST /api/escrow/:id/confirm-payment**

- **Purpose**: Manually confirm payment (for off-band payments)
- **Authentication**: Required
- **Authorization**: Buyer or Admin
- **Request Body**:

  ```json
  {
    "transactionId": "string",
    "evidence": "string (optional)"
  }
  ```

- **Response**: `200 OK`

**POST /api/escrow/:id/mark-delivered**

- **Purpose**: Mark delivery as complete (seller)
- **Authentication**: Required
- **Authorization**: Seller only
- **Request Body**:

  ```json
  {
    "title": "string",
    "description": "string (optional)",
    "evidence": "object (optional)"
  }
  ```

- **Response**: `200 OK`

**POST /api/escrow/:id/confirm-delivery**

- **Purpose**: Confirm delivery receipt (buyer)
- **Authentication**: Required
- **Authorization**: Buyer only
- **Response**: `200 OK`

#### 3. Dispute Operations

**POST /api/escrow/:id/dispute**

- **Purpose**: Open a dispute
- **Authentication**: Required
- **Authorization**: Buyer or Seller
- **Request Body**:

  ```json
  {
    "reason": "string",
    "description": "string",
    "evidence": "array"
  }
  ```

- **Response**: `201 Created`

**POST /api/escrow/:id/dispute/:disputeId/resolve**

- **Purpose**: Resolve dispute (admin only)
- **Authentication**: Required
- **Authorization**: Admin only
- **Request Body**:

  ```json
  {
    "resolution": "RELEASE" | "REFUND",
    "reason": "string"
  }
  ```

- **Response**: `200 OK`

#### 4. Admin Operations

**POST /api/escrow/:id/release**

- **Purpose**: Release funds to seller (admin)
- **Authentication**: Required
- **Authorization**: Admin only
- **Request Body**:

  ```json
  {
    "reason": "string (optional)"
  }
  ```

- **Response**: `200 OK`

**POST /api/escrow/:id/refund**

- **Purpose**: Refund buyer (admin)
- **Authentication**: Required
- **Authorization**: Admin only
- **Request Body**:

  ```json
  {
    "refundAmount": "number (optional, defaults to full)",
    "reason": "string"
  }
  ```

- **Response**: `200 OK`

#### 5. Milestone Operations

**POST /api/escrow/:id/milestones**

- **Purpose**: Create milestones for escrow
- **Authentication**: Required
- **Authorization**: Buyer or Seller
- **Request Body**:

  ```json
  {
    "milestones": [
      {
        "title": "string",
        "amountCents": "number"
      }
    ]
  }
  ```

- **Response**: `201 Created`

**POST /api/escrow/:id/milestones/:milestoneId/release**

- **Purpose**: Release milestone funds
- **Authentication**: Required
- **Authorization**: Buyer or Admin
- **Response**: `200 OK`

## Authentication & Authorization

### Authentication Flow

#### Web/API Clients

1. **Client obtains JWT token** via Better Auth endpoints:
   - `POST /api/auth/sign-in/email`
   - `POST /api/auth/discord`
   - `POST /api/oauth/roblox/url`

2. **Token format**: `Authorization: Bearer <jwt_token>`

3. **Middleware validates token**:
   - Extract token from `Authorization` header
   - Verify signature using Better Auth
   - Extract user ID and claims
   - Attach user context to `req.user`

#### Discord Bot Authentication

**Problem**: Discord bot interactions don't have user JWT tokens. Users interact via Discord commands, and the bot needs to authenticate on their behalf.

**Solution**: Hybrid authentication using service token + Discord user ID:

1. **Bot Authentication**:
   - Bot includes `X-Service-Token` header with bot service token
   - Bot includes `X-Discord-User-Id` header with Discord user ID
   - API validates service token matches `DISCORD_BOT_SERVICE_TOKEN`

2. **User Resolution**:
   - API looks up user by Discord account ID (`accountId = discordUserId`)
   - If user doesn't exist, auto-creates via `ensureUserExists` pattern
   - Resolves to internal `userId` for authorization

3. **Middleware Flow**:

   ```typescript
   // Discord bot auth middleware
   const discordBotAuth = async (req, res, next) => {
     const serviceToken = req.headers['x-service-token'];
     const discordUserId = req.headers['x-discord-user-id'];

     // Validate service token
     if (serviceToken !== process.env.DISCORD_BOT_SERVICE_TOKEN) {
       throw new AppError('Invalid service token', 401);
     }

     // Resolve user from Discord ID
     const account = await prisma.account.findFirst({
       where: {
         accountId: discordUserId,
         providerId: 'discord',
       },
       include: { user: true },
     });

     if (!account) {
       // Auto-create user if needed (or return 401)
       throw new AppError('User not found. Please sign up first.', 401);
     }

     // Attach user context
     req.user = { id: account.user.id };
     req.discordUserId = discordUserId;
     next();
   };
   ```

4. **Alternative: Short-lived JWT issuance**:
   - Bot calls `POST /api/auth/discord-bot/issue-token` with Discord ID
   - API validates Discord user via Discord API
   - API issues short-lived JWT (15 min expiry)
   - Bot caches and reuses token until expiry

**Recommended Approach**: Service token + Discord ID header (simpler, no token caching needed)

### Authorization Model

**Role-Based Access Control**:

- **Buyer**: Can access escrows where `offer.buyerId === userId`
- **Seller**: Can access escrows where `offer.sellerId === userId`
- **Admin**: Can access all escrows

**Authorization Middleware Pattern**:

```typescript
const escrowAccessControl = (requiredRole: 'buyer' | 'seller' | 'admin') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { escrowId } = req.params;
    const userId = req.user?.id;

    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { offer: true },
    });

    if (!escrow) {
      throw new AppError('Escrow not found', 404);
    }

    const isBuyer = escrow.offer.buyerId === userId;
    const isSeller = escrow.offer.sellerId === userId;
    const isAdmin = req.user?.role === 'ADMIN';

    const hasAccess =
      (requiredRole === 'buyer' && isBuyer) ||
      (requiredRole === 'seller' && isSeller) ||
      (requiredRole === 'admin' && isAdmin) ||
      isAdmin;

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    req.escrow = escrow;
    next();
  };
};
```

### KYC Gating

- **High-value escrows** (>$10k): Require `user.kycVerified === true` and `user.kycTier >= TIER_1`
- **Wallet screening**: Block `SANCTIONED` or `HIGH` risk wallets

## Command Emission Patterns

### Command Emission Strategy

**Pattern**: Synchronous command emission (immediate publish after validation)

**Rationale**:

- Provides immediate feedback to API consumers
- Simpler implementation aligns with existing Kafka usage
- Lower latency for critical operations
- Easier debugging and error tracking

**Flow**:

1. API validates request
2. Command is constructed
3. Command is immediately published to Kafka
4. API returns success response with command ID
5. Command processor handles async processing downstream

### Command Structure

Commands are emitted to Kafka topics for async processing:

**Topic**: `escrow-commands`
**Partition Key**: `escrowId` (ensures ordering per escrow)

**Command Types**:

1. **CreateEscrowCommand**

   ```json
   {
     "commandId": "string (UUID)",
     "commandType": "CREATE_ESCROW",
     "escrowId": "string",
     "timestamp": "ISO8601",
     "payload": {
       "offerId": "string",
       "contractId": "string",
       "rail": "STRIPE" | "USDC_BASE",
       "amount": "string",
       "currency": "USD" | "USDC"
     }
   }
   ```

2. **TransitionEscrowCommand**

   ```json
   {
     "commandId": "string",
     "commandType": "TRANSITION_ESCROW",
     "escrowId": "string",
     "timestamp": "ISO8601",
     "payload": {
       "newStatus": "EscrowStatus",
       "reason": "string",
       "userId": "string"
     }
   }
   ```

3. **ReleaseFundsCommand**

   ```json
   {
     "commandId": "string",
     "commandType": "RELEASE_FUNDS",
     "escrowId": "string",
     "timestamp": "ISO8601",
     "payload": {
       "userId": "string",
       "reason": "string (optional)"
     }
   }
   ```

4. **RefundBuyerCommand**

   ```json
   {
     "commandId": "string",
     "commandType": "REFUND_BUYER",
     "escrowId": "string",
     "timestamp": "ISO8601",
     "payload": {
       "userId": "string",
       "refundAmount": "number (optional)",
       "reason": "string"
     }
   }
   ```

5. **CreateDisputeCommand**
   ```json
   {
     "commandId": "string",
     "commandType": "CREATE_DISPUTE",
     "escrowId": "string",
     "timestamp": "ISO8601",
     "payload": {
       "userId": "string",
       "reason": "string",
       "description": "string",
       "evidence": "array"
     }
   }
   ```

### Command Emission Pattern

```typescript
async function emitCommand(command: EscrowCommand) {
  // 1. Validate command
  validateCommand(command);

  // 2. Check idempotency
  const existing = await checkIdempotency(command.commandId);
  if (existing) {
    return existing.result;
  }

  // 3. Publish to Kafka (synchronous)
  await kafkaProducer.send({
    topic: 'escrow-commands',
    messages: [
      {
        key: command.escrowId,
        value: JSON.stringify(command),
        headers: {
          'command-id': command.commandId,
          'command-type': command.commandType,
        },
      },
    ],
  });

  // 4. Store idempotency record
  await storeIdempotency(command.commandId, { status: 'pending' });

  // 5. Return command ID for tracking
  return { commandId: command.commandId };
}
```

### Idempotency

- **Idempotency Key**: Provided in request header `Idempotency-Key`
- **Storage**: Redis or database table
- **TTL**: 24 hours
- **Behavior**: Return cached response if key exists

## Read Model Query Patterns

### Query Strategy

**Pattern**: Direct Prisma queries (no separate read model projections)

**Rationale**:

- Simpler architecture aligns with current codebase
- Real-time data consistency (always current state)
- Lower operational overhead (no projection maintenance)
- Sufficient performance for current scale

**Note**: This design does NOT use CQRS-style read models or projections. All queries read directly from the source of truth (PostgreSQL tables).

### Direct Prisma Queries

Read operations query PostgreSQL directly via Prisma:

**Single Escrow Query**:

```typescript
const escrow = await prisma.escrow.findUnique({
  where: { id: escrowId },
  include: {
    offer: {
      include: {
        buyer: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
        listing: true,
      },
    },
    contract: true,
    stripeEscrow: true,
    stablecoinEscrow: true,
    deliveries: {
      orderBy: { createdAt: 'desc' },
    },
    disputes: {
      orderBy: { createdAt: 'desc' },
    },
    auditLogs: {
      orderBy: { createdAt: 'desc' },
      take: 20,
    },
  },
});
```

**List Escrows Query**:

```typescript
const escrows = await prisma.escrow.findMany({
  where: {
    status: filterStatus,
    rail: filterRail,
    offer: {
      buyerId: filterBuyerId,
      sellerId: filterSellerId,
    },
  },
  include: {
    offer: {
      include: {
        buyer: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
      },
    },
  },
  orderBy: { createdAt: 'desc' },
  skip: (page - 1) * limit,
  take: limit,
});
```

### Pagination Pattern

```typescript
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
  };
}
```

### Query Optimization

- **Indexes**: Use existing indexes on `offerId`, `contractId`, `status`, `rail`
- **Selective Fields**: Use `select` to fetch only needed fields
- **Connection Pooling**: Prisma connection pool configured for optimal throughput

## Error Handling & Validation

### Validation Schema (Zod)

```typescript
const createEscrowSchema = z.object({
  offerId: z.string().cuid(),
  contractId: z.string().cuid(),
  rail: z.enum(['STRIPE', 'USDC_BASE']),
  amount: z.string().transform(BigInt),
  currency: z.enum(['USD', 'USDC']),
  sellerStripeAccountId: z.string().optional(),
  buyerFee: z.number().min(0).optional(),
  sellerFee: z.number().min(0).optional(),
  idempotencyKey: z.string().uuid().optional(),
});
```

### Error Response Format (RFC 7807)

```json
{
  "type": "https://bloxtr8.com/problems/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "Invalid request payload",
  "instance": "/api/escrow",
  "errors": [
    {
      "field": "amount",
      "message": "Amount must be a positive integer"
    }
  ],
  "timestamp": "2025-01-02T12:00:00.000Z"
}
```

### Error Types

| Status | Type                    | Description                                        |
| ------ | ----------------------- | -------------------------------------------------- |
| 400    | `bad-request`           | Invalid request format                             |
| 401    | `unauthorized`          | Missing or invalid authentication                  |
| 403    | `forbidden`             | Insufficient permissions                           |
| 404    | `not-found`             | Resource not found                                 |
| 409    | `conflict`              | Resource conflict (e.g., invalid state transition) |
| 422    | `validation-error`      | Validation failed                                  |
| 429    | `rate-limit-exceeded`   | Too many requests                                  |
| 500    | `internal-server-error` | Server error                                       |

### State Transition Validation

```typescript
const VALID_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  AWAIT_FUNDS: ['FUNDS_HELD', 'CANCELLED'],
  FUNDS_HELD: ['DELIVERED', 'DISPUTED', 'REFUNDED'],
  DELIVERED: ['RELEASED', 'DISPUTED', 'REFUNDED'],
  DISPUTED: ['RELEASED', 'REFUNDED'],
  RELEASED: [],
  REFUNDED: [],
  CANCELLED: [],
};
```

## OpenAPI/Swagger Documentation

### OpenAPI Specification Location

The complete OpenAPI 3.0 specification is provided in a separate file:

**File**: `documentation/design/escrow/api-gateway-openapi.yaml`

This separate file enables:

- **Tool Integration**: Can be used with Swagger UI, Postman, code generators
- **Client Generation**: Auto-generate client SDKs for various languages
- **Version Control**: Easier to track changes to API contracts
- **Reusability**: Can be referenced by multiple documentation sources

### OpenAPI Specification Overview

The specification includes:

1. **All Endpoints**: Complete coverage of all escrow API endpoints
2. **Request/Response Schemas**: Full type definitions for all payloads
3. **Authentication**: Bearer token security scheme
4. **Error Responses**: RFC 7807 Problem Details format
5. **Validation Rules**: Schema constraints and requirements

### Key Sections in OpenAPI File

- **Servers**: Development and production URLs
- **Security Schemes**: JWT Bearer token authentication
- **Schemas**: Escrow, CreateEscrowRequest, ProblemDetails, PaginatedResponse, etc.
- **Paths**: All endpoint definitions with parameters and responses
- **Components**: Reusable response definitions

### Using the OpenAPI Specification

The specification can be used with:

- **Swagger UI**: Interactive API documentation (`swagger-ui-express`)
- **Postman**: Import for testing and collection generation
- **Code Generators**: Generate TypeScript/JavaScript clients (`openapi-generator`, `swagger-codegen`)
- **API Testing**: Automated test generation
- **Documentation**: Auto-generated API docs

See `documentation/design/escrow/api-gateway-openapi.yaml` for the complete OpenAPI 3.0 specification.

## Implementation Notes

1. **File Structure**:
   - `apps/api/src/routes/escrow.ts` - Route handlers
   - `apps/api/src/lib/escrow-service.ts` - Business logic
   - `apps/api/src/middleware/auth.ts` - Authentication middleware
   - `apps/api/src/middleware/authorization.ts` - Authorization middleware
   - `apps/api/src/lib/kafka-producer.ts` - Command emitter

2. **Dependencies**:
   - `express` - Web framework
   - `zod` - Validation
   - `better-auth` - Authentication
   - `kafkajs` - Kafka client
   - `@prisma/client` - Database ORM

3. **Testing Strategy**:
   - Unit tests for validation schemas
   - Integration tests for API endpoints
   - E2E tests for complete flows
   - Mock Kafka producer for testing

4. **Monitoring**:
   - Log all command emissions
   - Track command processing latency
   - Monitor error rates by endpoint
   - Alert on failed state transitions
