# API Reference

REST API documentation for Bloxtr8.

## Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://api.bloxtr8.com`

## Authentication

Most endpoints require authentication via JWT token obtained through Better Auth.

```http
Authorization: Bearer <token>
```

### OAuth Providers

- **Discord**: `/api/auth/discord`
- **Roblox**: `/api/oauth/roblox/url`

## Endpoints

### Authentication

#### `POST /api/auth/sign-in/email`

Sign in with email and password.

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response**:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### `POST /api/auth/sign-up/email`

Create a new account.

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

**Response**: `201 Created`

### Users

#### `GET /api/users/:id`

Get user by ID.

**Parameters**:

- `id` (path): User ID

**Response**:

```json
{
  "id": "user_123",
  "name": "John Doe",
  "email": "user@example.com",
  "kycTier": "TIER_1",
  "kycVerified": true,
  "accounts": [
    {
      "providerId": "discord",
      "accountId": "discord_user_id"
    }
  ]
}
```

#### `GET /api/users/verify/:discordId`

Verify user by Discord ID.

**Parameters**:

- `discordId` (path): Discord user ID

**Response**:

```json
{
  "id": "user_123",
  "name": "John Doe",
  "email": "user@example.com",
  "kycVerified": true,
  "kycTier": "TIER_1",
  "accounts": [{ "accountId": "discord_123" }]
}
```

#### `POST /api/users/ensure`

Create user if doesn't exist, or return existing user.

**Request Body**:

```json
{
  "discordId": "discord_user_id",
  "username": "JohnDoe"
}
```

**Response**: User object with all linked accounts

**Performance**: Optimized to eliminate unnecessary database queries by returning transaction results directly.

#### `GET /api/users/:userId/experiences`

Get user's Roblox experiences (public games they own).

**Parameters**:

- `userId` (path): User ID

**Response**:

```json
{
  "success": true,
  "experiences": [
    {
      "id": "123456789",
      "name": "Epic Game",
      "description": "An amazing RPG experience",
      "creator": {
        "id": 789,
        "name": "CreatorName",
        "type": "User"
      },
      "created": "2023-01-01T00:00:00Z",
      "updated": "2024-01-01T00:00:00Z",
      "visits": 1000000,
      "playing": 50,
      "maxPlayers": 100,
      "genre": "RPG",
      "thumbnailUrl": "https://thumbnails.roblox.com/...",
      "universeId": 987654321,
      "placeId": "123456789"
    }
  ]
}
```

**Errors**:

- `400 Bad Request`: User has no linked Roblox account
- `404 Not Found`: User not found

### Listings

#### `POST /api/listings`

Create a new listing with optional thread information.

**Authentication**: Required (TIER_1+)

**Request Body**:

```json
{
  "title": "Epic Roblox Game",
  "summary": "A popular RPG game with 10M+ visits",
  "price": 50000,
  "category": "RPG",
  "sellerId": "user_123",
  "guildId": "discord_guild_id",
  "visibility": "PUBLIC",
  "threadId": "discord_thread_id",
  "channelId": "discord_channel_id",
  "priceRange": "20k-100k"
}
```

**Fields**:

- `title` (required): Listing title (max 255 chars)
- `summary` (required): Description (max 1000 chars)
- `price` (required): Price in cents (int, e.g., 50000 = $500.00)
- `category` (required): Category (max 100 chars)
- `sellerId` (required): User ID of seller
- `guildId` (optional): Discord guild ID where created
- `visibility` (optional): `PUBLIC` (all servers) or `PRIVATE` (guild only)
- `threadId` (optional): Discord thread ID
- `channelId` (optional): Discord channel ID
- `priceRange` (optional): `under-5k`, `5k-20k`, `20k-100k`, or `100k+`

**Response**: `201 Created`

```json
{
  "id": "listing_123"
}
```

**Errors**:

- `400 Bad Request`: Invalid input or validation failed
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Insufficient KYC tier

#### `GET /api/listings`

Get all listings with pagination and filters.

**Query Parameters**:

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 50)
- `status` (optional): Filter by status (`ACTIVE`, `SOLD`, `CANCELLED`)
- `category` (optional): Filter by category
- `userId` (optional): Filter by seller ID
- `visibility` (optional): Filter by visibility (`PUBLIC` or `PRIVATE`)
- `priceRange` (optional): Filter by range (`under-5k`, `5k-20k`, `20k-100k`, `100k+`)
- `guildId` (optional): Discord guild ID for visibility filtering

**Response**: `200 OK`

```json
{
  "listings": [
    {
      "id": "listing_123",
      "title": "Epic Roblox Game",
      "summary": "A popular RPG game",
      "price": 50000,
      "category": "RPG",
      "status": "ACTIVE",
      "visibility": "PUBLIC",
      "threadId": "thread_id",
      "channelId": "channel_id",
      "priceRange": "20k-100k",
      "userId": "user_123",
      "guildId": "guild_123",
      "user": {
        "name": "John Doe",
        "kycTier": "TIER_1",
        "kycVerified": true
      },
      "guild": {
        "name": "Trading Server",
        "discordId": "guild_123"
      },
      "robloxSnapshots": [
        {
          "gameName": "Epic Game",
          "thumbnailUrl": "https://...",
          "playerCount": 100,
          "visits": 1000000,
          "verifiedOwnership": true
        }
      ],
      "createdAt": "2025-01-02T12:00:00Z",
      "updatedAt": "2025-01-02T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5,
    "hasPrev": false,
    "hasNext": true
  }
}
```

**Visibility Rules**:

- If no `guildId`: Only `PUBLIC` listings returned
- If `guildId` provided: `PUBLIC` + `PRIVATE` listings from that guild
- Enables cross-guild marketplace experience

#### `GET /api/listings/:id`

Get listing details by ID.

**Response**: `200 OK`

```json
{
  "id": "listing_123",
  "title": "Epic Roblox Game",
  "summary": "A popular RPG game with 10M+ visits",
  "price": 50000,
  "category": "RPG",
  "status": "ACTIVE",
  "visibility": "PUBLIC",
  "threadId": "thread_id",
  "channelId": "channel_id",
  "priceRange": "20k-100k",
  "user": {
    "id": "user_123",
    "name": "John Doe",
    "kycTier": "TIER_1",
    "kycVerified": true
  },
  "guild": {
    "name": "Trading Server",
    "discordId": "guild_123"
  },
  "robloxSnapshots": [
    {
      "gameName": "Epic Game",
      "gameDescription": "An RPG",
      "thumbnailUrl": "https://...",
      "playerCount": 100,
      "visits": 1000000,
      "verifiedOwnership": true
    }
  ],
  "createdAt": "2025-01-02T12:00:00Z",
  "updatedAt": "2025-01-02T12:00:00Z"
}
```

**Errors**:

- `404 Not Found`: Listing not found

#### `PATCH /api/listings/:id/thread`

Update listing thread information.

**Request Body**:

```json
{
  "threadId": "discord_thread_id",
  "channelId": "discord_channel_id",
  "priceRange": "20k-100k"
}
```

**Response**: `200 OK`

```json
{
  "success": true
}
```

**Errors**:

- `404 Not Found`: Listing not found
- `400 Bad Request`: Invalid thread data

### Offers

#### `POST /api/offers`

Create an offer on a listing.

**Request Body**:

```json
{
  "listingId": "listing_123",
  "buyerId": "user_456",
  "amount": 45000,
  "conditions": "Optional terms",
  "expiry": "2025-01-09T12:00:00Z"
}
```

**Response**: `201 Created`

```json
{
  "id": "offer_789"
}
```

**Errors**:

- `400 Bad Request`: Amount exceeds listing price
- `404 Not Found`: Listing not found

### Contracts

#### `POST /api/contracts/generate`

Generate a contract from an accepted offer.

**Authentication**: Required

**Request Body**:

```json
{
  "offerId": "offer_123"
}
```

**Response**: `201 Created`

```json
{
  "id": "contract_123",
  "pdfUrl": "https://s3.../contract.pdf",
  "sha256": "abc123...",
  "status": "PENDING_SIGNATURE",
  "offerId": "offer_123",
  "createdAt": "2025-01-02T12:00:00Z"
}
```

**Errors**:

- `400 Bad Request`: Offer ID required or invalid
- `404 Not Found`: Offer not found
- `409 Conflict`: Contract already exists for offer

#### `GET /api/contracts/:id`

Get contract details by ID.

**Authentication**: Required

**Parameters**:

- `id` (path): Contract ID

**Response**: `200 OK`

```json
{
  "id": "contract_123",
  "pdfUrl": "https://s3.../contract.pdf",
  "sha256": "abc123...",
  "status": "EXECUTED",
  "templateVersion": "1.0.0",
  "robloxAssetData": {
    "gameName": "Epic Game",
    "gameId": "123456789",
    "verifiedOwnership": true
  },
  "offer": {
    "id": "offer_123",
    "amount": 50000,
    "buyerId": "user_456",
    "sellerId": "user_789",
    "listing": {
      "id": "listing_123",
      "title": "Epic Roblox Game"
    }
  },
  "signatures": [
    {
      "id": "sig_1",
      "userId": "user_456",
      "signedAt": "2025-01-02T12:30:00Z",
      "signatureMethod": "DISCORD_NATIVE"
    },
    {
      "id": "sig_2",
      "userId": "user_789",
      "signedAt": "2025-01-02T13:00:00Z",
      "signatureMethod": "WEB_BASED"
    }
  ],
  "createdAt": "2025-01-02T12:00:00Z",
  "updatedAt": "2025-01-02T13:00:00Z"
}
```

**Errors**:

- `404 Not Found`: Contract not found
- `403 Forbidden`: Not authorized to view this contract

#### `POST /api/contracts/:id/sign`

Sign a contract.

**Authentication**: Required

**Parameters**:

- `id` (path): Contract ID

**Request Body**:

```json
{
  "userId": "user_123",
  "signatureMethod": "DISCORD_NATIVE",
  "ipAddress": "192.168.1.1",
  "userAgent": "Discord/1.0"
}
```

**Fields**:

- `userId` (required): ID of user signing
- `signatureMethod` (required): `DISCORD_NATIVE` or `WEB_BASED`
- `ipAddress` (optional): IP address at time of signing
- `userAgent` (optional): User agent string

**Response**: `200 OK`

```json
{
  "success": true,
  "signature": {
    "id": "sig_123",
    "userId": "user_123",
    "signedAt": "2025-01-02T12:00:00Z",
    "signatureMethod": "DISCORD_NATIVE"
  },
  "contract": {
    "id": "contract_123",
    "status": "EXECUTED"
  },
  "bothPartiesSigned": true
}
```

**Errors**:

- `400 Bad Request`: Already signed or invalid method
- `403 Forbidden`: Not authorized to sign this contract
- `404 Not Found`: Contract not found

#### `POST /api/contracts/:id/sign-token`

Generate a magic link token for web-based contract signing.

**Authentication**: Required

**Parameters**:

- `id` (path): Contract ID

**Request Body**:

```json
{
  "userId": "user_123"
}
```

**Response**: `200 OK`

```json
{
  "token": "secure_token_abc123",
  "signUrl": "https://app.bloxtr8.com/contract/contract_123/sign?token=secure_token_abc123",
  "expiresAt": "2025-01-02T12:15:00Z"
}
```

**Token Details**:

- Valid for 15 minutes
- Single-use only
- Automatically cleaned up after use or expiry

**Errors**:

- `403 Forbidden`: Not authorized for this contract
- `404 Not Found`: Contract not found
- `400 Bad Request`: Contract already fully signed

#### `POST /api/contracts/:id/verify`

Verify contract integrity using SHA-256 hash.

**Authentication**: Required

**Parameters**:

- `id` (path): Contract ID

**Request Body**:

```json
{
  "sha256": "abc123..."
}
```

**Response**: `200 OK`

```json
{
  "valid": true,
  "message": "Contract hash matches stored hash"
}
```

**Errors**:

- `400 Bad Request`: Hash mismatch
- `404 Not Found`: Contract not found

#### `POST /api/contracts/:id/upload`

Get presigned URL for contract PDF upload.

**Authentication**: Required

**Parameters**:

- `id` (path): Contract ID

**Response**: `200 OK`

```json
{
  "uploadUrl": "https://s3.../presigned-put",
  "key": "contracts/contract_123.pdf"
}
```

**Usage**:

1. Get presigned URL
2. PUT PDF to the URL
3. Contract automatically updated with PDF location

#### `GET /api/contracts/:id/pdf`

Get presigned URL for contract PDF download.

**Authentication**: Required

**Parameters**:

- `id` (path): Contract ID

**Response**: `200 OK`

```json
{
  "downloadUrl": "https://s3.../presigned-get",
  "expiresAt": "2025-01-02T13:00:00Z"
}
```

**Errors**:

- `404 Not Found`: Contract or PDF not found
- `403 Forbidden`: Not authorized to download

### Offer Drafts

Temporary storage for in-progress offers to prevent data loss during multi-step Discord interactions.

#### `POST /api/offer-drafts`

Create or update an offer draft.

**Authentication**: Not required (uses Discord ID)

**Request Body**:

```json
{
  "discordUserId": "discord_123",
  "listingId": "listing_456",
  "amount": 45000,
  "conditions": "Optional terms",
  "expiresAt": "2025-01-02T13:00:00Z"
}
```

**Fields**:

- `discordUserId` (required): Discord user ID
- `listingId` (required): Target listing ID
- `amount` (required): Offer amount in cents
- `conditions` (optional): Offer conditions
- `expiresAt` (required): Auto-cleanup time (typically 30 minutes)

**Response**: `201 Created` or `200 OK`

```json
{
  "id": "draft_789",
  "discordUserId": "discord_123",
  "listingId": "listing_456",
  "amount": 45000,
  "conditions": "Optional terms",
  "expiresAt": "2025-01-02T13:00:00Z",
  "createdAt": "2025-01-02T12:30:00Z"
}
```

**Behavior**:

- One draft per user per listing (upserts existing draft)
- Automatically cleaned up after expiry
- Prevents data loss during Discord modal/button flows

#### `GET /api/offer-drafts/:discordUserId/:listingId`

Get an offer draft.

**Authentication**: Not required

**Parameters**:

- `discordUserId` (path): Discord user ID
- `listingId` (path): Listing ID

**Response**: `200 OK`

```json
{
  "id": "draft_789",
  "discordUserId": "discord_123",
  "listingId": "listing_456",
  "amount": 45000,
  "conditions": "Optional terms",
  "expiresAt": "2025-01-02T13:00:00Z",
  "createdAt": "2025-01-02T12:30:00Z"
}
```

**Errors**:

- `404 Not Found`: Draft not found or expired

#### `DELETE /api/offer-drafts/:discordUserId/:listingId`

Delete an offer draft.

**Authentication**: Not required

**Parameters**:

- `discordUserId` (path): Discord user ID
- `listingId` (path): Listing ID

**Response**: `204 No Content`

**Use Case**: Delete draft after successful offer submission

#### `DELETE /api/offer-drafts/cleanup`

Clean up expired offer drafts (internal/cron job).

**Authentication**: Required (admin)

**Response**: `200 OK`

```json
{
  "deleted": 15
}
```

**Scheduled**: Runs automatically every hour to remove expired drafts

### Asset Verification

#### `POST /api/asset-verification/verify`

Verify Roblox game ownership.

**Request Body**:

```json
{
  "userId": "user_123",
  "gameId": "roblox_game_id",
  "robloxUserId": "roblox_user_id"
}
```

**Response**:

```json
{
  "verified": true,
  "gameDetails": {
    "id": "123456",
    "name": "Epic Game",
    "creator": {
      "id": 789,
      "name": "Creator"
    }
  },
  "ownershipType": "Owner",
  "verificationId": "verification_123"
}
```

#### `GET /api/asset-verification/user/:userId/games`

Get user's verified games.

**Response**:

```json
{
  "games": [
    {
      "id": "verification_123",
      "gameId": "123456",
      "verificationStatus": "VERIFIED",
      "ownershipType": "OWNER",
      "verifiedAt": "2025-01-02T12:00:00Z"
    }
  ],
  "count": 1
}
```

### OAuth

#### `POST /api/oauth/roblox/url`

Generate Roblox OAuth URL.

**Request Body**:

```json
{
  "discordId": "discord_user_id",
  "redirectUri": "http://localhost:3000/api/oauth/roblox/callback"
}
```

**Response**:

```json
{
  "url": "https://apis.roblox.com/oauth/v1/authorize?client_id=...&state=..."
}
```

#### `GET /api/oauth/roblox/callback`

Roblox OAuth callback handler.

**Query Parameters**:

- `code`: OAuth authorization code
- `state`: State parameter for CSRF protection (validated against stored token)

**Process**:

1. Validates OAuth code with Roblox
2. Verifies state parameter (prevents CSRF attacks)
3. Links Roblox account to Discord user
4. Upgrades user KYC tier to TIER_1
5. Cleans up OAuth state token
6. Redirects to success/error page

**Response**: Redirects to web app with success/error

**Security Features**:

- State token validation with 10-minute expiration
- Automatic cleanup of used tokens
- Race condition protection via atomic token validation
- Memory leak prevention
- Atomic updateMany operation prevents concurrent access issues

### Health

#### `GET /health`

Health check endpoint.

**Response**:

```json
{
  "status": "ok",
  "timestamp": "2025-01-02T12:00:00.000Z",
  "database": "connected",
  "uptime": 12345
}
```

## Error Responses

All errors follow RFC 7807 Problem Details format:

```json
{
  "type": "https://bloxtr8.com/problems/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "The requested resource /api/users/invalid was not found",
  "instance": "/api/users/invalid",
  "timestamp": "2025-01-02T12:00:00.000Z"
}
```

### Error Types

| Status | Type                    | Description                       |
| ------ | ----------------------- | --------------------------------- |
| 400    | `bad-request`           | Invalid request format            |
| 401    | `unauthorized`          | Missing or invalid authentication |
| 403    | `forbidden`             | Insufficient permissions          |
| 404    | `not-found`             | Resource not found                |
| 409    | `conflict`              | Resource conflict                 |
| 422    | `validation-error`      | Validation failed                 |
| 429    | `rate-limit-exceeded`   | Too many requests                 |
| 500    | `internal-server-error` | Server error                      |

## Rate Limiting

- **Window**: 15 minutes
- **Limit**: 100 requests per IP
- **Headers**:
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp

## Pagination

List endpoints support pagination:

```http
GET /api/listings?page=1&limit=20
```

**Response**:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

## Webhooks

### Stripe Webhooks

**Endpoint**: `/api/webhooks/stripe`

**Events**:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `transfer.created`

**Verification**: HMAC signature in `Stripe-Signature` header

### Custodian Webhooks

**Endpoint**: `/api/webhooks/custodian`

**Events**:

- `deposit.confirmed`
- `transfer.completed`

**Verification**: HMAC signature in `X-Signature` header

## SDK Examples

### JavaScript/TypeScript

```typescript
const API_URL = 'http://localhost:3000';

// Authenticate
const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password',
  }),
});

const { token } = await response.json();

// Create listing
const listing = await fetch(`${API_URL}/api/listings`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    title: 'My Game',
    price: 50000,
    userId: 'user_123',
  }),
});
```

### Python

```python
import requests

API_URL = 'http://localhost:3000'

# Authenticate
auth = requests.post(f'{API_URL}/api/auth/sign-in/email', json={
    'email': 'user@example.com',
    'password': 'password'
})
token = auth.json()['token']

# Create listing
listing = requests.post(
    f'{API_URL}/api/listings',
    headers={'Authorization': f'Bearer {token}'},
    json={
        'title': 'My Game',
        'price': 50000,
        'userId': 'user_123'
    }
)
```

## Testing

```bash
# Health check
curl http://localhost:3000/health

# Create user
curl -X POST http://localhost:3000/api/users/ensure \
  -H "Content-Type: application/json" \
  -d '{"discordId":"123","username":"TestUser"}'
```
