# 4. Multi-Rail Payment System Design

Date: 2025-01-02

## Status

Accepted

## Context

Bloxtr8 handles Roblox game trades ranging from hundreds to hundreds of thousands of dollars. We need a payment system that:

1. Handles both small (≤$10,000) and large (>$10,000) transactions
2. Provides buyer protection through escrow
3. Minimizes transaction fees
4. Complies with financial regulations
5. Supports international users
6. Provides fast settlement
7. Maintains security and fraud prevention

Traditional payment processors like Stripe work well for smaller transactions but have:

- High percentage fees on large transactions
- Slower settlement (2-7 days)
- Geographic restrictions
- Risk of chargebacks

Cryptocurrency offers benefits for larger transactions:

- Lower percentage fees
- Faster settlement
- Global accessibility
- No chargebacks

However, crypto has challenges:

- User experience complexity
- Regulatory uncertainty
- Price volatility (must use stablecoins)
- Integration complexity

## Decision

We will implement a **multi-rail payment system** that automatically routes transactions based on amount:

- **≤$10,000**: Stripe (traditional payment processing)
- **>$10,000**: USDC on Base (L2 blockchain)

### Routing Logic

```typescript
const rail = amount <= 10000 ? 'STRIPE' : 'USDC_BASE';
```

### Payment Rails

#### Stripe Rail (≤$10,000)

- **Flow**: PaymentIntent → webhook confirmation → escrow held
- **Features**:
  - Credit/debit cards
  - Bank transfers
  - Digital wallets (Apple Pay, Google Pay)
  - Built-in fraud detection
  - Buyer disputes via Stripe
- **Fees**: 2.9% + $0.30 per transaction
- **Settlement**: 2-7 days
- **Max**: $10,000 per transaction

#### USDC on Base Rail (>$10,000)

- **Flow**: Deposit address → blockchain confirmation → escrow held
- **Features**:
  - Native USDC on Base (L2, low fees)
  - Fast finality (2-5 minutes)
  - TRM Labs + Chainalysis screening
  - Custodian API for address generation
- **Fees**: ~$0.01-0.10 gas + custodian fee
- **Settlement**: Minutes to hours
- **Max**: Unlimited

### State Management

Both rails share common escrow states:

```typescript
enum EscrowStatus {
  AWAIT_FUNDS = 'AWAIT_FUNDS',
  FUNDS_HELD = 'FUNDS_HELD',
  DELIVERED = 'DELIVERED',
  RELEASED = 'RELEASED',
  DISPUTED = 'DISPUTED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}
```

State transitions driven by webhooks (Stripe) or blockchain events (Base).

## Consequences

### Positive

- **Cost Efficiency**: Large transactions avoid high percentage fees
  - $50,000 transaction: Stripe = $1,450 fee vs. USDC = ~$0.10 gas
- **User Choice**: Small transactions use familiar payment methods

- **Global Access**: USDC rail supports international transactions

- **Fast Settlement**: Crypto rail provides near-instant settlement

- **Scalability**: Can add more rails (e.g., ACH, wire) as needed

- **Flexibility**: Threshold can be adjusted based on fee analysis

### Negative

- **Implementation Complexity**: Must maintain two payment systems

- **User Experience**: Different flows for different transaction sizes
  - May confuse users crossing the threshold
- **Operational Overhead**: Monitor and maintain two systems

- **Support Burden**: Support team must understand both rails

- **Regulatory Risk**: Crypto regulation evolving

- **Testing Complexity**: Must test both payment flows

### Neutral

- **Threshold Selection**: $10,000 chosen based on fee breakeven analysis
  - Can be adjusted based on data

- **Technology Stack**: Different technologies per rail
  - Stripe SDK vs. custodian API

## Alternatives Considered

### 1. Stripe Only

**Pros**:

- Simple implementation
- Familiar to users
- Strong fraud protection

**Cons**:

- Prohibitive fees on large transactions ($50k = $1,450 fee)
- No competitive advantage
- Limited by Stripe's geographic availability

**Why Rejected**: Not viable for large transactions, our target market.

### 2. Crypto Only

**Pros**:

- Low fees at all transaction sizes
- Fast settlement
- Global access

**Cons**:

- Steep learning curve for non-crypto users
- Would exclude majority of potential users
- Regulatory uncertainty

**Why Rejected**: Too high friction for mainstream adoption.

### 3. Wire Transfers for Large Transactions

**Pros**:

- Traditional, trusted method
- Low percentage fees

**Cons**:

- Slow (3-5 business days)
- High fixed fees ($20-50)
- Manual reconciliation required
- No automatic settlement
- International complications

**Why Rejected**: Slow settlement incompatible with marketplace dynamics.

### 4. ACH for Domestic, Wire for International

**Pros**:

- Covers both domestic and international
- Traditional methods

**Cons**:

- ACH reversible (chargebacks)
- Wire requires manual processing
- Both slower than crypto
- Geographic complexity

**Why Rejected**: Speed and automation requirements favor crypto.

## Implementation Details

### Database Schema

```prisma
model Escrow {
  id     String      @id @default(cuid())
  rail   EscrowRail  // STRIPE | USDC_BASE
  amount Int
  status EscrowStatus

  // Rail-specific data
  stripeEscrow     StripeEscrow?
  stablecoinEscrow StablecoinEscrow?
}

model StripeEscrow {
  id              String @id
  paymentIntentId String @unique
  transferId      String?
  escrowId        String @unique
  escrow          Escrow @relation(fields: [escrowId])
}

model StablecoinEscrow {
  id          String @id
  chain       String // "BASE"
  depositAddr String
  depositTx   String?
  releaseTx   String?
  escrowId    String @unique
  escrow      Escrow @relation(fields: [escrowId])
}
```

### Routing Logic

```typescript
function determinePaymentRail(amount: number): 'STRIPE' | 'USDC_BASE' {
  const THRESHOLD = 10000; // $10,000
  return amount <= THRESHOLD ? 'STRIPE' : 'USDC_BASE';
}
```

### Security Measures

**Both Rails**:

- Webhook signature verification
- Idempotency checks
- Audit logging

**Stripe**:

- Built-in fraud detection
- 3D Secure for cards

**USDC**:

- TRM Labs wallet screening
- Chainalysis sanctions screening
- Transaction monitoring

## Migration Path

1. **Phase 1**: Implement Stripe rail (completed)
2. **Phase 2**: Implement USDC rail (in progress)
3. **Phase 3**: Test both rails in staging
4. **Phase 4**: Gradual rollout with $10k threshold
5. **Phase 5**: Monitor and adjust threshold based on data

## Success Metrics

- **Fee Savings**: Measure actual fee savings vs. Stripe-only
- **Conversion Rate**: Compare between payment rails
- **Settlement Time**: Track time from payment to release
- **Support Tickets**: Monitor payment-related support volume
- **User Adoption**: Track USDC rail usage over time

## Rollout Plan

1. **Beta**: Invite select users to test USDC rail
2. **Soft Launch**: Enable for transactions >$25k
3. **Full Launch**: Enable for transactions >$10k
4. **Monitoring**: Track metrics for 3 months
5. **Optimization**: Adjust threshold if needed

## Risk Mitigation

- **Regulatory**: Consult legal counsel on crypto regulations
- **UX**: Provide clear education on both payment methods
- **Technical**: Comprehensive testing of both rails
- **Operational**: Train support team on both systems
- **Financial**: Start with conservative limits, increase gradually

## References

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Base Network Documentation](https://docs.base.org/)
- [USDC on Base](https://www.circle.com/en/usdc)
- [TRM Labs Wallet Screening](https://www.trmlabs.com/products/wallet-screening)
- [Chainalysis API](https://www.chainalysis.com/free-cryptocurrency-sanctions-screening-tools/)

## Related

- ADR-005: Webhook-Driven State Management
