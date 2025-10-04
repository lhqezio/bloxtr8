# Escrow System Design for Roblox Asset / Game Marketplace

> **Purpose:** design a robust escrow workflow where *Bloxtr8 acts as the neutral third party* for trades of Roblox games & assets. This file gives a practical, implementation-ready initial design and flow (DB mapping, API surface, state machine, webhooks, security, edge cases, testing notes).

---

## 1. Goals & constraints

* Hold buyer payment securely until the seller has delivered the Roblox asset (game transfer, ownership proof or other agreed deliverable).
* Support two rails: **Stripe (fiat card payments)** and **USDC on Base/Solana** (stablecoin). Rails already represented in schema (`Escrow.rail`, `StripeEscrow`, `StablecoinEscrow`).
* Support milestone-based releases (partial releases) - schema supports `MilestoneEscrow`.
* Provide clear dispute and audit trails (`Dispute`, `AuditLog`).
* Comply with KYC tiers (use `User.kycTier` & `kycVerified`) to gate high-value trades.

---

## 2. High-level flow (happy path)

1. Buyer finds listing and submits an **Offer**.
2. Seller accepts the Offer. Offer status -> `ACCEPTED`.
3. Platform creates an **Escrow** record with `status = AWAIT_FUNDS` and `rail` = `STRIPE` or `USDC_BASE`.
4. Platform initiates payment collection:

   * **Stripe:** create a PaymentIntent (or Setup + PaymentIntent for save payment). Insert `StripeEscrow` with `paymentIntentId` and link to `Escrow`.
   * **USDC:** generate a deposit address or custodial subaddress; insert `StablecoinEscrow.depositAddr`.
5. Buyer completes payment on chosen rail.
6. Platform receives provider webhook (e.g., `payment_intent.succeeded` or on-chain deposit observed) -> mark `Escrow.status = FUNDS_HELD` and create `AuditLog`.
7. Platform notifies Seller to deliver (create `Delivery` record, assign `deliveredBy = seller.id`).
8. Seller delivers agreed asset (transfer game ownership, provide API proof, invite buyer as developer/owner, or transfer game group ownership). Record proof in `Delivery` (e.g., `Delivery.status = DELIVERED`, attach proof links in `Delivery.description` or as `metadata`).
9. Buyer confirms receipt OR a timeout/auto-confirmation triggers -> platform releases funds:

   * **Stripe:** create Transfer/Payout to seller (or capture + transfer depending on flow)
   * **USDC:** call custodial release / send tx to buyer. Update `Escrow.status = RELEASED`, log `AuditLog`.
10. Close `Offer`, `Contract` status as `EXECUTED`, mark `Listing` as `SOLD` if applicable.

---

## 3. State machine (Escrow.status)

```
AWAIT_FUNDS --(buyer pays)--> FUNDS_HELD
FUNDS_HELD --(delivery complete + buyer confirm)--> RELEASED
FUNDS_HELD --(buyer requests refund OR seller fails to deliver)--> REFUNDED
ANY --(user opens dispute)--> DISPUTED
DISPUTED --(resolution favor seller)--> RELEASED
DISPUTED --(resolution favor buyer)--> REFUNDED
AWAIT_FUNDS --(offer expired/cancelled)--> CANCELLED
```

Notes:

* Milestones each have their own `EscrowStatus` (so you can hold/ release per milestone).
* Transitions must be atomic (DB tx) and idempotent.

---

## 4. DB usage & recommended small additions

Small tweaks and recommendations for the schema:
* `Escrow`

  * add `expiresAt DateTime?` to automatically expire AWAIT_FUNDS states.
  * add `metadata Json?` for rails-agnostic references (refund reasons, proofs, custodian IDs).

* `StripeEscrow`

  * add `amountCaptured Int?` and `currency Currency?` to record final captured amount.
  * add `lastWebhookAt DateTime?` for idempotency & replay protection.

* `StablecoinEscrow`

  * add `custodyProvider String?` (e.g., `Alchemy`, `Blockdaemon`) and `depositConfirmations Int?`.

* `AuditLog`

  * consider `referenceType` and `referenceId` fields for generic linking to events.

* `Delivery`

  * add `evidence Json?` that stores links to screenshots, roblox API responses, tx hashes, or signed messages.

These are optional but helpful for operations and debugging.

---

## 5. API endpoints (REST)

### Public buyer/seller flows

* `POST /offers/:id/accept` — seller accepts offer => creates `Escrow` (AWAIT_FUNDS) and returns `clientPaymentInfo`.
* `POST /escrows` — internal endpoint to create an escrow (rail chosen). Idempotent (idempotency-key supported).
* `GET /escrows/:id` — returns escrow state, linked contract/offer and delivery info.
* `POST /escrows/:id/confirm-payment` — (optional) manually notify platform that buyer paid off-band (for custodial fiat wires).
* `POST /escrows/:id/delivery` — seller uploads delivery proof; creates `Delivery` record.
* `POST /escrows/:id/confirm` — buyer confirms delivery -> triggers release.
* `POST /escrows/:id/dispute` — open a dispute (creates `Dispute`, sets `Escrow.status = DISPUTED`).

### Admin / ops

* `POST /escrows/:id/release` — admin or dispute resolution engine releases funds.
* `POST /escrows/:id/refund` — admin issues refund.
* `GET /escrows?status=DISPUTED` — list to triage.

### Webhook endpoints

* `POST /webhooks/stripe` — handle PaymentIntent, Charge, Payout, Refund events.
* `POST /webhooks/custodian` — handle on-chain deposit notifications & release confirmations.

Security: validate provider signatures, dedupe events by `webhook_events.eventId`.

---

## 6. Implementation details per rail

### Stripe (card) — recommended flow

1. Create PaymentIntent with `amount` & `metadata: { escrowId, offerId, contractId }`.
2. Save `StripeEscrow.paymentIntentId`.
3. Wait for `payment_intent.succeeded` → set `Escrow.status = FUNDS_HELD` and create `AuditLog`.
4. On release:

   * If using Connect: create a `Transfer` to the seller's connected Stripe account, or create a payout if custodian holds funds.
   * If not using Connect: platform pays out to seller via external transfer (e.g., bank), record `transferId`.
5. On refund: call Stripe Refund API, save `refundId`, set `Escrow.status = REFUNDED`.

Important notes:

* Use Stripe Connect if you want sellers to receive funds directly. Connect reduces your custodial regulatory burden but requires onboarded accounts.
* Use idempotency keys for PaymentIntent/Transfer creation.
* Store webhook events to `WebhookEvent` table to avoid double-processing.

### USDC (Base) — recommended flow

1. Generate a deposit address (or custodian subaddress) and save to `StablecoinEscrow.depositAddr`.
2. Monitor on-chain (or custodian) for incoming tx to that address matching amount.
3. Once deposit observed and confirmed, set `Escrow.status = FUNDS_HELD` and save `StablecoinEscrow.depositTx`.
4. On release: create a release transaction, save `releaseTx`, set `Escrow.status = RELEASED`.
5. If escrow supports self-custody or multisig, include multisig flow and admin sign-offs for release.

---

## 7. Milestones

* When an Offer uses milestones, create `MilestoneEscrow` rows with amounts summing to `Escrow.amount`.
* Each milestone independently progresses through `AWAIT_FUNDS` -> `FUNDS_HELD` -> `RELEASED`.
* API: `POST /escrows/:id/milestones/:mid/release` (buyer confirm / admin release).

---

## 8. Dispute handling

* `POST /escrows/:id/dispute` creates `Dispute` and sets `Escrow.status = DISPUTED`.
* Freeze actions: block automated release/refund while `DISPUTED`.
* Add `Dispute.messages` (or store in `AuditLog`) for evidence.
* Admin flow: gather evidence (Delivery.evidence, RobloxSnapshot verification, on-chain proof), then call `POST /escrows/:id/admin-resolve` with resolution `RELEASE` or `REFUND` and `resolutionReason`.
* On resolution, set `Dispute.status = RESOLVED`, `resolvedAt`, update `Escrow.status` accordingly, and create `AuditLog`.

---

## 9. Security, fraud, and compliance

* **KYC gating:** only allow high-value payments/releases if `user.kycVerified` is true and tier suffices.
* **Wallet screening:** use `User.walletRisk` to block or require manual review for `SANCTIONED` or `HIGH` risk.
* **Webhooks:** verify signatures; persist `WebhookEvent` with `eventId` and `processed` flag; idempotent processing.
* **Transactions:** wrap status transitions in DB transactions to avoid split-brain.
* **Access control:** only permit buyer, seller, or platform/admin to perform operations on an Escrow; verify link to `Offer` & `Contract`.
* **Rate limits & replay protection:** reject duplicate or replayed actions using idempotency keys.
* **Sensitive data:** encrypt PCI-sensitive data or use tokenization through providers (do not store card data yourself).

---

## 10. Auditability & observability

* Use `AuditLog` liberally: record every state transition, user action, webhook received, tx id, signature verification results.
* Add metrics & alerts: #disputes, time-to-release, failed webhooks, escrow aging (AWAIT_FUNDS > 48h), refund rate.
* Provide an admin UI to search `escrows`, `disputes`, `deliveries`, and filter by `createdAt`, `status`, `rail`.

---

## 11. Example sequences (Pseudo-requests)

**Seller accepts offer (server-side)**

```http
POST /offers/:offerId/accept
Authorization: Bearer <seller-token>

# server logic
- verify seller owns the listing
- update Offer.status = ACCEPTED
- create Contract row and Signatures if needed
- create Escrow row (status=AWAIT_FUNDS)
- if rail=STRIPE -> create PaymentIntent and create StripeEscrow
- return payment client details to buyer
```

**Stripe webhook (payment succeeded)**

```http
POST /webhooks/stripe
# verify signature
# if event.id not in webhook_events -> persist
# find escrow by paymentIntentId
# if escrow.status == AWAIT_FUNDS -> set FUNDS_HELD, create audit log, notify seller
```

**Buyer confirms delivery**

```http
POST /escrows/:id/confirm
Authorization: Bearer <buyer-token>
# verify buyer is linked to the offer
# verify escrow.status == FUNDS_HELD
# create DB tx: call payment provider to release -> update escrow.status = RELEASED -> AuditLog
```

---

## 12. Edge cases & notes

* **Partial payments:** allow partial payments for milestones; only mark milestone FUNDS_HELD when corresponding amount confirmed.
* **Expired offers:** if buyer never pays, close `Escrow` -> `CANCELLED` after expiry and notify parties.
* **Seller never delivers:** allow buyer to open dispute and request refund; platform can auto-refund if deadlines exceeded.
* **Double spends / fraud on-chain:** use confirmations threshold.
* **Chargebacks:** for card payments, maintain risk reserve for chargebacks; treat `RELEASED` as final but consider liability window for disputes and chargebacks.

---

## 13. Tests & rollout

* Unit-tests for state transitions, idempotency of webhook processing, db transaction atomicity.
* Integration tests with Stripe (test keys) and your chosen custody/custodian for USDC.
* Simulate dispute flow and ensure funds don't release while DISPUTED.
* Start with low-value trades and increase caps as monitoring and processes stabilize.

---

## 14. Next steps (actionable)

1. Add recommended DB fields (optional) and run migrations.
2. Implement API endpoints above in a dedicated `escrow` service/module.
3. Integrate Stripe Connect (or your chosen model) and webhook processor.
4. Implement on-chain watcher for USDC deposits + confirm flows.
5. Build admin dashboard for dispute triage and escrow monitoring.
6. Create runbooks for manual release/refund and chargeback handling.

---

## 15. Appendix, Useful constants & patterns

* Use an **idempotency-key** header for: PaymentIntent creation, Transfers, Refunds.

* Webhook processing pattern:

  1. validate signature
  2. insert `WebhookEvent` with `eventId`, provider, raw payload
  3. if `processed` false -> process and mark `processed = true`

* DB transaction pattern pseudocode:

```js
await prisma.$transaction(async (tx) => {
  const escrow = await tx.escrow.update({ where: { id }, data: { status: 'FUNDS_HELD' } })
  await tx.auditLog.create({ data: { action: 'escrow.funds_held', details: { escrowId: id } } })
})
```

## 16. Things to look out for
- No timeout mechanism for AWAIT_FUNDS state yet
- Missing validation for state transitions
- No protection against race conditions in concurrent operations -> use prisma tx
- Verification that only buyer/seller can perform escrow operations
- Admin role for disputing resolution
- KYC tier enforcement in escrow creation
- WebHook replay attack protection
- Rate limit on webhook endpoints
- Error handling for failed webhook
- Evidence validation in disputes
- Dispute escalation timeline
- Dispute spam protection
- Automated dispute resolution for clear cases
```ts
// Add to Escrow model
expiresAt: DateTime?
autoReleaseAt: DateTime? // For automatic release after delivery
```
```ts
// From your payment-system.md - this is incomplete
if (riskScore === 'SANCTIONED' || riskScore === 'HIGH') {
  // Missing: What happens here?
}
```

#### Enhanced State Machine with Security
```ts
// Add to escrow service
export class EscrowStateMachine {
  private static readonly VALID_TRANSITIONS = {
    AWAIT_FUNDS: ['FUNDS_HELD', 'CANCELLED', 'EXPIRED'],
    FUNDS_HELD: ['DELIVERED', 'DISPUTED', 'REFUNDED'],
    DELIVERED: ['RELEASED', 'DISPUTED', 'REFUNDED'],
    DISPUTED: ['RELEASED', 'REFUNDED'],
    // ... other states
  };

  static async transition(
    escrowId: string, 
    newStatus: EscrowStatus, 
    userId: string,
    reason?: string
  ) {
    return await prisma.$transaction(async (tx) => {
      // Optimistic locking
      const current = await tx.escrow.findUnique({
        where: { id: escrowId },
        select: { status: true, version: true }
      });

      if (!current) throw new AppError('Escrow not found', 404);
      
      if (!this.VALID_TRANSITIONS[current.status]?.includes(newStatus)) {
        throw new AppError('Invalid state transition', 400);
      }

      // Update with version check
      const updated = await tx.escrow.update({
        where: { 
          id: escrowId,
          version: current.version // Optimistic locking
        },
        data: {
          status: newStatus,
          lastModifiedBy: userId,
          version: { increment: 1 }
        }
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: `escrow.${newStatus.toLowerCase()}`,
          details: { escrowId, reason, previousStatus: current.status },
          userId,
          escrowId
        }
      });

      return updated;
    });
  }
}
```
#### Enhanced Authorization Middleware
```ts
export const escrowAccessControl = (requiredRole: 'buyer' | 'seller' | 'admin') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { escrowId } = req.params;
    const userId = req.user?.id;

    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { offer: true }
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
      isAdmin; // Admins can always access

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    req.escrow = escrow;
    next();
  };
};
```
#### Enhanced Webhook security
```ts
export const secureWebhookHandler = (provider: 'stripe' | 'custodian') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Rate limiting per IP
      const clientIP = req.ip;
      const rateLimitKey = `webhook:${provider}:${clientIP}`;
      
      // Verify signature
      const signature = req.headers[provider === 'stripe' ? 'stripe-signature' : 'x-signature'];
      const isValid = await verifyWebhookSignature(req.body, signature, provider);
      
      if (!isValid) {
        throw new AppError('Invalid webhook signature', 401);
      }

      // Check idempotency with timeout
      const eventId = req.body.id;
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventId }
      });

      if (existing) {
        return res.json({ received: true, status: 'duplicate' });
      }

      // Process with timeout
      const timeout = setTimeout(() => {
        throw new AppError('Webhook processing timeout', 408);
      }, 30000); // 30 second timeout

      try {
        await processWebhookEvent(req.body, provider);
        clearTimeout(timeout);
        res.json({ received: true, status: 'processed' });
      } catch (error) {
        clearTimeout(timeout);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  };
};
```
#### Enhanced Dispute Resolution
```ts
export class DisputeManager {
  static async createDispute(
    escrowId: string, 
    userId: string, 
    evidence: any[]
  ) {
    return await prisma.$transaction(async (tx) => {
      // Check if user is party to escrow
      const escrow = await tx.escrow.findUnique({
        where: { id: escrowId },
        include: { offer: true }
      });

      if (!escrow) throw new AppError('Escrow not found', 404);
      
      const isParty = escrow.offer.buyerId === userId || escrow.offer.sellerId === userId;
      if (!isParty) throw new AppError('Not authorized to dispute', 403);

      // Check for existing disputes
      const existingDispute = await tx.dispute.findFirst({
        where: { escrowId, status: { in: ['OPEN', 'IN_REVIEW'] } }
      });

      if (existingDispute) {
        throw new AppError('Dispute already exists', 409);
      }

      // Validate evidence
      const validatedEvidence = await this.validateEvidence(evidence);

      // Create dispute
      const dispute = await tx.dispute.create({
        data: {
          escrowId,
          userId,
          title: 'Escrow Dispute',
          description: 'Dispute over escrow transaction',
          status: 'OPEN'
        }
      });

      // Freeze escrow
      await tx.escrow.update({
        where: { id: escrowId },
        data: { status: 'DISPUTED' }
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'dispute.created',
          details: { disputeId: dispute.id, evidence: validatedEvidence },
          userId,
          escrowId
        }
      });

      return dispute;
    });
  }
}
```
#### Enhanced Monitoring and Alerting
```ts
export class SecurityMonitor {
  static async logSecurityEvent(
    event: string,
    details: any,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ) {
    await prisma.auditLog.create({
      data: {
        action: `security.${event}`,
        details: { ...details, severity },
        userId: details.userId
      }
    });

    // Alert on high severity events
    if (severity === 'HIGH' || severity === 'CRITICAL') {
      await this.sendSecurityAlert(event, details, severity);
    }
  }

  static async checkAnomalousActivity(userId: string) {
    // Check for unusual patterns
    const recentActivity = await prisma.auditLog.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });

    // Implement anomaly detection logic
    // Alert if suspicious patterns detected
  }
}
```
## Priority Implementation Order
## 1. Immediate (Week 1):
- Add missing database fields
- Implement proper authorization middleware
- Add webhook timeout and error handling

## 2.Short-term (Week 2-3):
- Implement enhanced state machine with optimistic locking
- Add dispute evidence validation
- Implement security monitoring

## 3.Medium-term (Month 1):
- Add automated dispute resolution
- Implement comprehensive audit trails
- Add anomaly detection
---