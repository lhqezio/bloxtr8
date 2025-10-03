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

Create a new listing.

**Authentication**: Required (TIER_1+)

**Request Body**:

```json
{
  "title": "Epic Roblox Game",
  "summary": "A popular RPG game with 10M+ visits",
  "price": 50000,
  "category": "RPG",
  "userId": "user_123",
  "gameId": "roblox_game_id"
}
```

**Response**: `201 Created`

```json
{
  "id": "listing_123",
  "title": "Epic Roblox Game",
  "price": 50000,
  "status": "ACTIVE",
  "createdAt": "2025-01-02T12:00:00Z"
}
```

**Errors**:

- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Insufficient KYC tier

#### `GET /api/listings/:id`

Get listing details.

**Response**:

```json
{
  "id": "listing_123",
  "title": "Epic Roblox Game",
  "summary": "A popular RPG game with 10M+ visits",
  "price": 50000,
  "category": "RPG",
  "status": "ACTIVE",
  "user": {
    "id": "user_123",
    "name": "John Doe"
  },
  "robloxSnapshots": [
    {
      "gameId": "123456",
      "gameName": "Epic Game",
      "verifiedOwnership": true
    }
  ]
}
```

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
