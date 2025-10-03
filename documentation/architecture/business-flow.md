# Business Flow

Complete transaction flow from signup to payment release.

## User Onboarding

### 1. Signup (Discord Bot)

```
User → /signup command
  ↓
Bot → Show consent modal with TOS
  ↓
User accepts → POST /api/users/ensure
  ↓
API → Create User + Account (Discord provider)
  ↓
User created with TIER_0 (browse only)
```

**Database Changes**:

- Create `User` record
- Create `Account` record (providerId: 'discord')

### 2. Link Roblox Account

```
User → /link command
  ↓
Bot → POST /api/oauth/roblox/url
  ↓
API → Generate OAuth URL + state token (10min expiry)
  ↓
User → Opens URL in browser
  ↓
Roblox → User authenticates
  ↓
Roblox → Redirects to /api/oauth/roblox/callback?code=...&state=...
  ↓
API → Validate OAuth code + state token
  ↓
API → Get Roblox user ID from token
  ↓
API → Create Account (providerId: 'roblox', accountId: robloxUserId)
  ↓
API → Update User.kycTier = TIER_1, kycVerified = true
  ↓
API → Clean up OAuth state token
  ↓
Web App → Show success page
  ↓
Bot → DM user confirmation
```

**Database Changes**:

- Create `Account` record (Roblox)
- Update `User.kycTier` to TIER_1
- Update `User.kycVerified` to true

**Result**: User can now create listings

## Listing Creation

### 3. Create Listing with Game Verification

```
User → /listing create
  ↓
Bot → Check user KYC tier
  ↓
If TIER_0 → Error: "Link Roblox account first"
  ↓
If TIER_1+ → Show listing modal
  ↓
User fills: title, description, price, gameId
  ↓
User submits → POST /api/listings
  ↓
API → Validate input (Zod schema)
  ↓
API → Verify game ownership:
  1. Check AssetVerification cache (24h)
  2. If expired/missing → Call Roblox API
  3. Verify user owns/admins game
  4. Store verification result
  ↓
API → Create Listing
  ↓
API → Create RobloxSnapshot
  ↓
Bot ← Listing ID + details
  ↓
User ← Success embed with listing link
```

**Database Changes**:

- Create `AssetVerification` record (or update if exists)
- Create `Listing` record
- Create `RobloxSnapshot` record

### Asset Verification Details

**API Endpoint**: `POST /api/asset-verification/verify`

**Request**:

```json
{
  "userId": "user_123",
  "gameId": "roblox_game_id",
  "robloxUserId": "roblox_user_id"
}
```

**Process**:

1. Check cache: `AssetVerification.findUnique({ userId, gameId })`
2. If valid (< 24h old, status = VERIFIED) → Return cached
3. Else → Call Roblox API:
   - Get game details
   - Get user's games list
   - Check if user owns/admins game
4. Store/update `AssetVerification`
5. Return result

**Response**:

```json
{
  "verified": true,
  "ownershipType": "Owner",
  "verificationId": "verification_123"
}
```

## Offer & Negotiation

### 4. Make Offer

```
Buyer → Clicks "Make Offer" on listing
  ↓
Bot → Show offer modal
  ↓
Buyer fills: amount, conditions, expiry
  ↓
POST /api/offers
  ↓
API → Validate:
  - Listing exists and ACTIVE
  - Amount <= listing price
  - Buyer != Seller
  ↓
API → Create Offer (status: PENDING)
  ↓
API → Send DM to seller with offer details
  ↓
Seller → Accept | Counter | Decline
```

**Database Changes**:

- Create `Offer` record
- Create `AuditLog` entry

### 5. Offer States

**Accept**:

```
Seller → Clicks "Accept"
  ↓
PATCH /api/offers/:id/accept
  ↓
Update Offer.status = ACCEPTED
  ↓
Trigger contract generation
```

**Counter**:

```
Seller → Clicks "Counter" → Modal
  ↓
Fills new amount/conditions
  ↓
POST /api/offers (with parentId)
  ↓
Create new Offer with parent reference
  ↓
Original offer status = COUNTERED
```

**Decline**:

```
Seller → Clicks "Decline"
  ↓
Update Offer.status = DECLINED
```

## Contract & Escrow

### 6. Contract Generation (Future)

```
Offer ACCEPTED
  ↓
POST /api/contracts
  ↓
API → Generate PDF contract:
  - Listing details from RobloxSnapshot
  - Offer terms
  - Buyer/seller info
  ↓
API → Store PDF in S3
  ↓
API → Calculate SHA-256 hash
  ↓
API → Create Contract (status: PENDING_SIGNATURE)
  ↓
API → Send DocuSign signing requests to both parties
  ↓
Both sign → Webhook updates Contract.status = EXECUTED
  ↓
Trigger escrow creation
```

**Database Changes**:

- Create `Contract` record
- Create `Signature` records (2)

### 7. Escrow Creation

```
Contract EXECUTED
  ↓
API → Determine payment rail:
  if (amount <= 10000) rail = 'STRIPE'
  else rail = 'USDC_BASE'
  ↓
API → Create Escrow (status: AWAIT_FUNDS)
  ↓
Discord → Create private thread for transaction
  ↓
If STRIPE:
  - Create PaymentIntent
  - Send payment link to buyer
If USDC_BASE:
  - Generate deposit address (custodian API)
  - Show QR code + address to buyer
```

**Database Changes**:

- Create `Escrow` record
- Create `StripeEscrow` OR `StablecoinEscrow`

### 8. Payment Flow (Stripe)

```
Buyer → Clicks payment link
  ↓
Stripe → Payment UI
  ↓
Buyer completes payment
  ↓
Stripe → Webhook: payment_intent.succeeded
  ↓
POST /api/webhooks/stripe
  ↓
API → Verify webhook signature
  ↓
API → Check WebhookEvent for idempotency
  ↓
API → Update Escrow.status = FUNDS_HELD
  ↓
API → Update StripeEscrow.paymentIntentId
  ↓
Discord → Update thread: "Funds secured"
  ↓
Seller notified to begin delivery
```

**Database Changes**:

- Create `WebhookEvent` record
- Update `Escrow.status`
- Create `AuditLog` entry

### 9. Payment Flow (USDC on Base)

```
Buyer → Sends USDC to deposit address
  ↓
Base network → Transaction confirmed
  ↓
Custodian → Webhook: deposit.confirmed
  ↓
POST /api/webhooks/custodian
  ↓
API → Verify webhook signature
  ↓
API → Screen wallet (TRM Labs + Chainalysis)
  ↓
If high risk/sanctioned → REFUND
  ↓
API → Update Escrow.status = FUNDS_HELD
  ↓
API → Update StablecoinEscrow.depositTx
  ↓
Discord → Update thread: "Funds secured"
```

**Database Changes**:

- Create `WebhookEvent` record
- Update `Escrow.status`
- Update `StablecoinEscrow.depositTx`
- Create `AuditLog` entry

## Delivery & Release

### 10. Delivery

```
Seller → Transfers game assets to buyer
  ↓
Seller → POST /api/escrow/:id/mark-delivered
  ↓
API → Update Escrow.status = DELIVERED
  ↓
API → Create Delivery record
  ↓
Discord → Notify buyer: "Confirm delivery"
  ↓
Show buttons: [Confirm] [Open Dispute]
```

**Database Changes**:

- Update `Escrow.status`
- Create `Delivery` record

### 11. Release (Stripe)

```
Buyer → Clicks "Confirm"
  ↓
POST /api/escrow/:id/release
  ↓
API → Create Stripe Transfer to seller
  ↓
API → Update Escrow.status = RELEASED
  ↓
API → Update StripeEscrow.transferId
  ↓
Discord → Notify both parties: "Transaction complete"
```

**Database Changes**:

- Update `Escrow.status`
- Update `StripeEscrow.transferId`
- Create `AuditLog` entry

### 12. Release (USDC)

```
Buyer → Clicks "Confirm"
  ↓
POST /api/escrow/:id/release
  ↓
API → Call custodian API to transfer USDC
  ↓
Custodian → Executes transfer
  ↓
Custodian → Webhook: transfer.completed
  ↓
API → Update Escrow.status = RELEASED
  ↓
API → Update StablecoinEscrow.releaseTx
  ↓
Discord → Share transaction hash + confirmation
```

**Database Changes**:

- Update `Escrow.status`
- Update `StablecoinEscrow.releaseTx`
- Create `AuditLog` entry

## Dispute Handling

### 13. Open Dispute

```
Buyer → Clicks "Open Dispute"
  ↓
POST /api/disputes
  ↓
API → Create Dispute (status: OPEN)
  ↓
API → Update Escrow.status = DISPUTED
  ↓
Discord → Notify moderators
  ↓
Moderator reviews:
  - Contract PDF + hash
  - RobloxSnapshots
  - Payment proof
  - Delivery proof
  - Chat logs
  ↓
Moderator decision:
  → Release to seller: Transfer funds
  → Refund to buyer: Refund via Stripe or USDC transfer
  ↓
Update Dispute.status = RESOLVED
Update Escrow.status = RELEASED or REFUNDED
```

**Database Changes**:

- Create `Dispute` record
- Update `Escrow.status`
- Create `AuditLog` entries

## State Diagrams

### Escrow States

```
AWAIT_FUNDS
    ↓
FUNDS_HELD
    ↓
DELIVERED
    ↓
RELEASED (✓ complete)

OR

FUNDS_HELD → DISPUTED → RESOLVED → RELEASED or REFUNDED
FUNDS_HELD → CANCELLED (no delivery)
```

### Offer States

```
PENDING → ACCEPTED → Contract flow
PENDING → COUNTERED → New offer created
PENDING → DECLINED (✗ end)
PENDING → EXPIRED (timeout)
```

## Automation

### Timeouts

- **Offer Expiry**: Default 72h from creation
  - Cron job updates expired offers
- **Contract Signing**: 72h to sign
  - Cron job voids unsigned contracts
- **Delivery Window**: Configurable per listing
  - Auto-cancel if not delivered
- **Auto-Release**: 7 days after DELIVERED
  - Auto-confirm if buyer doesn't respond

### Background Jobs

- Process expired offers
- Void unsigned contracts
- Auto-release escrows
- Send reminder notifications
- Clean up old WebhookEvents

## Security Checks

**Payment**:

- Webhook signature verification (Stripe, Custodian)
- Idempotency via WebhookEvent
- Wallet screening (TRM, Chainalysis)

**Ownership**:

- Game verification via Roblox API
- 24-hour verification cache
- Snapshots at key states

**Audit**:

- All state changes logged to AuditLog
- Complete transaction history
- Immutable contract hashes (SHA-256)
