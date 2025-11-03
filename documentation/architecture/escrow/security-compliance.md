# Security & Compliance

Security architecture, compliance requirements, and access control for the escrow system.

## Security Architecture

### Defense in Depth

**Layers**:

1. **Network**: TLS encryption, firewall rules
2. **Application**: Authentication, authorization, input validation
3. **Data**: Encryption at rest, encryption in transit
4. **Process**: Audit logging, monitoring, incident response

### Authentication

#### API Gateway Authentication

**Method**: JWT tokens via Better Auth

**Flow**:

1. User authenticates via Discord OAuth
2. Better Auth issues JWT token
3. API Gateway validates JWT on each request
4. Token includes user ID and KYC tier

**Token Validation**:

- Signature verification
- Expiration check
- KYC tier validation for protected endpoints

#### Kafka Authentication

**Method**: SASL/SCRAM (Salted Challenge Response Authentication Mechanism)

**Configuration**:

- Username/password authentication
- TLS encryption for broker communication
- ACLs (Access Control Lists) for topic access

**Service Accounts**:

- `escrow-service`: Read `escrow.commands.v1`, write `escrow.events.v1`
- `payments-service`: Read `payments.commands.v1`, write `payments.events.v1`
- `api-gateway`: Write `escrow.commands.v1`, `payments.commands.v1`

### Authorization

#### Role-Based Access Control (RBAC)

**Roles**:

- **Buyer**: Can release funds, raise disputes
- **Seller**: Can mark delivered
- **Admin**: Can resolve disputes, cancel escrows

#### Endpoint Authorization

| Endpoint                              | Method | Required Role                        |
| ------------------------------------- | ------ | ------------------------------------ |
| `POST /api/escrow/:id/mark-delivered` | POST   | Seller (must match escrow.seller_id) |
| `POST /api/escrow/:id/release`        | POST   | Buyer (must match escrow.buyer_id)   |
| `POST /api/escrow/:id/dispute`        | POST   | Buyer or Seller                      |
| `POST /api/disputes/:id/resolve`      | POST   | Admin                                |

**Implementation**:

```typescript
function authorizeEscrowAction(
  userId: string,
  escrowId: string,
  action: 'mark_delivered' | 'release' | 'dispute'
): boolean {
  const escrow = await getEscrow(escrowId);

  switch (action) {
    case 'mark_delivered':
      return userId === escrow.seller_id;
    case 'release':
      return userId === escrow.buyer_id;
    case 'dispute':
      return userId === escrow.buyer_id || userId === escrow.seller_id;
    default:
      return false;
  }
}
```

### Data Protection

#### Encryption in Transit

**Protocol**: TLS 1.3

**Applied To**:

- HTTP requests (API Gateway)
- Kafka broker communication
- Database connections
- External API calls (Stripe, Custodian, TRM, Chainalysis)

**Certificate Management**: Automated certificate rotation via ACM (AWS Certificate Manager) or equivalent

#### Encryption at Rest

**Database**: PostgreSQL encryption at rest via AWS RDS encryption or equivalent

**Kafka**: Kafka log encryption (if supported by broker)

**Secrets**: AWS Secrets Manager or equivalent (encrypted storage)

#### PII Handling

**Never Stored in Events**:

- Email addresses
- Physical addresses
- Phone numbers
- Full names

**Stored (Safe)**:

- User IDs (non-sensitive identifiers)
- Escrow IDs
- Transaction IDs

**Example**:

```protobuf
// ❌ Bad: Includes email
message EscrowCreated {
  string buyer_email = 1;  // Never include PII
}

// ✅ Good: Only IDs
message EscrowCreated {
  string buyer_id = 1;     // Safe identifier
}
```

## PCI Compliance

### Scope Minimization

**PCI DSS Scope**: Payment card data handling

**Compliance Strategy**: Minimize scope by not storing card data

**Implementation**:

- **No PAN Storage**: Payment card numbers never stored in database
- **Stripe Integration**: Use Stripe Elements for card input (PCI scope on Stripe)
- **Tokenization**: Store only Stripe payment intent IDs
- **No Card Data in Logs**: Never log card numbers or CVV

### Data Flow

```
User → Stripe Elements (PCI scope: Stripe)
  ↓
Stripe → PaymentIntent API (PCI scope: Stripe)
  ↓
Our System → Store only payment_intent_id (PCI scope: None)
```

**Result**: Our system is out of PCI scope for card data handling

### Audit Requirements

**Audit Log**: All payment-related operations logged

**Fields Logged**:

- Payment intent ID
- Escrow ID
- Amount
- Currency
- Timestamp
- User ID (no card data)

## KYC/AML Compliance

### KYC Tiers

**TIER_0**: Browse only (no transactions)
**TIER_1**: Create listings, make offers (Roblox account linked)
**TIER_2**: Verified seller status (enhanced verification)

### KYC Gates

**Escrow Creation**:

- Buyer must be TIER_1+
- Seller must be TIER_1+
- Verified via Roblox account linking

**Implementation**:

```typescript
function validateKYCForEscrow(buyerId: string, sellerId: string): void {
  const buyer = await getUser(buyerId);
  const seller = await getUser(sellerId);

  if (buyer.kycTier === 'TIER_0' || seller.kycTier === 'TIER_0') {
    throw new Error('KYC tier insufficient for escrow');
  }

  if (!buyer.kycVerified || !seller.kycVerified) {
    throw new Error('KYC verification required');
  }
}
```

### AML Screening

**USDC Payments**: Wallet screening required before accepting funds

**Providers**:

- TRM Labs: Risk scoring
- Chainalysis: Sanctions screening

**Process**:

1. Receive USDC deposit
2. Screen sender wallet via TRM Labs and Chainalysis
3. If sanctioned or high risk: Automatic refund
4. If clean: Accept funds, proceed with escrow

**Risk Thresholds**:

- **SANCTIONED**: Automatic refund
- **HIGH RISK** (>80): Automatic refund
- **MEDIUM RISK** (50-80): Manual review
- **LOW RISK** (<50): Accept funds

**Implementation**:

```typescript
async function screenWallet(address: string): Promise<WalletRisk> {
  const [trmResult, chainalysisResult] = await Promise.all([
    screenTRM(address),
    screenChainalysis(address),
  ]);

  if (chainalysisResult.isSanctioned) {
    return 'SANCTIONED';
  }

  if (trmResult.riskScore > 80) {
    return 'HIGH';
  }

  if (trmResult.riskScore > 50) {
    return 'MEDIUM';
  }

  return 'LOW';
}
```

## Webhook Security

### Signature Verification

**Stripe Webhooks**:

```typescript
const event = stripe.webhooks.constructEvent(
  req.body,
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET
);
```

**Custodian Webhooks**:

```typescript
function verifyCustodianWebhook(body: Buffer, signature: string): boolean {
  const hmac = crypto.createHmac(
    'sha256',
    process.env.CUSTODIAN_WEBHOOK_SECRET
  );
  const digest = hmac.update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
```

### Idempotency

**Storage**: `WebhookEvent` table with unique `event_id`

**Process**:

1. Extract `event_id` from webhook
2. Check if `event_id` exists in database
3. If exists: Skip processing (already handled)
4. If not: Process webhook + insert event record

**Prevents**: Duplicate processing from webhook retries

## Secrets Management

### Storage

**Service**: AWS Secrets Manager or equivalent

**Stored Secrets**:

- Stripe API keys (secret key, webhook secret)
- Custodian API keys
- TRM Labs API key
- Chainalysis API key
- Database passwords
- Kafka credentials

### Rotation

**Policy**: Rotate secrets every 90 days

**Process**:

1. Generate new secret
2. Update in Secrets Manager
3. Deploy services with new secret (zero downtime)
4. Invalidate old secret after deployment

### Access Control

**Principle**: Least privilege

**Access**: Only services that need secrets can access them

**Example**:

- Payments Service: Can access Stripe and Custodian secrets
- Escrow Service: Cannot access payment provider secrets

## Audit Logging

### Requirements

**All Actions Logged**:

- Escrow state transitions
- Payment operations
- Webhook processing
- Dispute resolution
- Admin actions

### Audit Log Structure

**Storage**: `AuditLog` table

**Fields**:

- `id`: Unique identifier
- `user_id`: User who performed action
- `action`: Action type (e.g., "MARK_DELIVERED", "RELEASE_FUNDS")
- `resource_type`: Resource type (e.g., "ESCROW")
- `resource_id`: Resource identifier
- `metadata`: Additional context (JSON)
- `ip_address`: IP address of request
- `user_agent`: User agent string
- `created_at`: Timestamp

**Immutable**: Audit logs never updated or deleted

### Compliance

**Retention**: 7 years (financial record retention)

**Access**: Admin-only access to audit logs

**Export**: Ability to export audit logs for compliance audits

## Access Control Matrix

| Action          | Buyer                               | Seller                              | Admin |
| --------------- | ----------------------------------- | ----------------------------------- | ----- |
| View Escrow     | Own escrows                         | Own escrows                         | All   |
| Mark Delivered  | ❌                                  | ✅ (own escrows)                    | ✅    |
| Release Funds   | ✅ (own escrows)                    | ❌                                  | ✅    |
| Raise Dispute   | ✅ (own escrows)                    | ✅ (own escrows)                    | ❌    |
| Resolve Dispute | ❌                                  | ❌                                  | ✅    |
| Cancel Escrow   | ✅ (own escrows, before FUNDS_HELD) | ✅ (own escrows, before FUNDS_HELD) | ✅    |

## Security Monitoring

### Threat Detection

**Anomaly Detection**:

- Unusual payment patterns
- Rapid escrow creation/cancellation
- Multiple failed authentication attempts
- Unusual API access patterns

**Alerts**:

- Failed authentication rate > 5% in 5 minutes
- Unusual payment amount (outlier detection)
- Multiple escrows cancelled by same user

### Incident Response

**Process**:

1. Detect security incident (via monitoring or alert)
2. Isolate affected systems
3. Investigate root cause
4. Remediate vulnerability
5. Restore systems
6. Post-mortem and prevention

## Related Documentation

- [Error Handling](./error-handling-retries.md) - Error recovery strategies
- [Observability](./observability.md) - Monitoring and logging
- [Escrow System Architecture](./escrow-system-architecture.md) - Architecture overview
