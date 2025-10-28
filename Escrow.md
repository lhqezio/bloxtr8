# Escrow System Design for Roblox Asset / Game Marketplace

> **Purpose:** design a robust escrow workflow where _Bloxtr8 acts as the neutral third party_ for trades of Roblox games & assets. This file gives a practical, implementation-ready initial design and flow (DB mapping, API surface, state machine, webhooks, security, edge cases, testing notes).

---

## 1. Goals & constraints

- Platform acts as a neutral escrow agent for Roblox game and asset trades. Hold buyer payment securely until the seller has delivered the Roblox asset (game transfer, ownership proof or other agreed deliverable).
- Support two rails: **Stripe Connect (fiat card payments)** and **USDC on Base/Solana** (stablecoin). Rails already represented in schema (`Escrow.rail`, `StripeEscrow`, `StablecoinEscrow`).
- Support milestone-based releases (partial releases) - schema supports `MilestoneEscrow`.
- Allow dual-fee structure (charge both buyer and seller).
- Provide clear dispute and audit trails (`Dispute`, `AuditLog`).
- Comply with KYC tiers (use `User.kycTier` & `kycVerified`) to gate high-value trades.

---

## 2. High-level flow (happy path)

1. Buyer finds listing and submits an **Offer**.
2. Seller accepts the Offer. Offer status -> `ACCEPTED`.
3. Platform creates an **Escrow** record with `status = AWAIT_FUNDS` and `rail` = `STRIPE` or `USDC_BASE`.
4. Platform initiates payment collection:
   - **Stripe:** create a PaymentIntent (or Setup + PaymentIntent for save payment). Insert `StripeEscrow` with `paymentIntentId` and link to `Escrow`.
   - **USDC:** generate a deposit address or custodial subaddress; insert `StablecoinEscrow.depositAddr`.

5. Buyer completes payment on chosen rail.
6. Platform receives provider webhook (e.g., `payment_intent.succeeded` or on-chain deposit observed) -> mark `Escrow.status = FUNDS_HELD` and create `AuditLog`.
7. Platform notifies Seller to deliver (create `Delivery` record, assign `deliveredBy = seller.id`).
8. Seller delivers agreed asset (transfer game ownership, provide API proof, invite buyer as developer/owner, or transfer game group ownership). Record proof in `Delivery` (e.g., `Delivery.status = DELIVERED`, attach proof links in `Delivery.description` or as `metadata`).
9. Buyer confirms receipt OR a timeout/auto-confirmation triggers -> platform releases funds:
   - **Stripe:** create Transfer/Payout to seller (or capture + transfer depending on flow)
   - **USDC:** call custodial release / send tx to buyer. Update `Escrow.status = RELEASED`, log `AuditLog`.

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

- Milestones each have their own `EscrowStatus` (so you can hold/ release per milestone).
- Transitions must be atomic (DB tx) and idempotent.

---

## 4. DB usage & recommended small additions

Small tweaks and recommendations for the schema:

- `Escrow`
  - add `expiresAt DateTime?` to automatically expire AWAIT_FUNDS states.
  - add `metadata Json?` for rails-agnostic references (refund reasons, proofs, custodian IDs).
  - add `expiresAt DateTime?` (auto refund deadline)
  - add `autoRefundAt DataTime?`

- `StripeEscrow`
  - add `amountCaptured Int?` and `currency Currency?` to record final captured amount.
  - add `lastWebhookAt DateTime?` for idempotency & replay protection.

- `StablecoinEscrow`
  - add `custodyProvider String?` (e.g., `coinbase_prime`) and `depositConfirmations Int?`.
  - add `custodianBuyerWalletId String?` (Coinbase wallet id for buyer)
  - add `custodianSellerWalletId String?`
  - add `custodianDepositTxId String?` (provider deposit id)
  - add `onchainSignature String?` ( onchain tx signature for release/refund)
  - add ` providerEven Json?` ( raw webhook payload)
  - add `version Int @default(1)` (optimistic locking)
  - add `mintAddress String` (canonical USDC mint)

- `AuditLog`
  - consider `referenceType` and `referenceId` fields for generic linking to events.

- `Delivery`
  - add `evidence Json?` that stores links to screenshots, roblox API responses, tx hashes, or signed messages.

- `User`
  - add `StripeAccountId` if the seller has to onboard with stripe to create a Stripe Connect account to receive payout
    These are optional but helpful for operations and debugging.

---

## 5. API endpoints (REST)

### Public buyer/seller flows

- `POST /offers/:id/accept` — seller accepts offer => creates `Escrow` (AWAIT_FUNDS) and returns `clientPaymentInfo`.
- `POST /escrow` — create an escrow (rail chosen). Idempotent (idempotency-key supported).
- `GET /escrow/:id` — returns escrow state, linked contract/offer and delivery info.
- `POST /escrow/:id/confirm-payment` — (optional) manually notify platform that buyer paid off-band (for custodial fiat wires).
- `POST /escrow/:id/delivery` — seller uploads delivery proof; creates `Delivery` record.
- `POST /escrow/:id/confirm` — buyer confirms delivery -> triggers release.
- `POST /escrow/:id/dispute` — open a dispute (creates `Dispute`, sets `Escrow.status = DISPUTED`).

### Admin / ops

- `POST /escrow/:id/release` — admin or dispute resolution engine releases funds.
- `POST /escrow/:id/refund` — admin issues refund.
- `GET /escrow?status=DISPUTED` — list to triage.

### Webhook endpoints

- `POST /webhooks/stripe` — handle PaymentIntent, Charge, Payout, Refund events. Verify webhook signatures with stripe.webhooks.constructEvent
- `POST /webhooks/custodian` — handle on-chain deposit notifications & release confirmations.

Security: validate provider signatures, dedupe events by `webhook_events.eventId`.

- Use idempotency-key for create/release/refund calls
- Always verify sellerAccountId belongs to your platform’s connected accounts
- Log every transition to AuditLog
- Use DB transactions for state transitions (see Section 15 in the doc)

---

## 6. Implementation details per rail

### Stripe (Stripe Connect) — recommended flow

[Why Stripe Connect and not Stripe](https://www.preczn.com/blog/stripe-vs-stripeconnect-everything-you-need-to-know)

#### Recommended Settings

- Use Express Connect accounts for sellers ([Stripe Connect Account Types](https://docs.stripe.com/connect/accounts))
- Enable manual payouts to contorl when sellers can withdraw funds
- Enable KYC verification for connected accounts.
- Use test mode and test cards during integration

#### Step-by-Step Flow

1. **Buyer initiates trade**: Creates an Offer → Seller accepts → Escrow record created with `status = AWAIT_FUNDS`.
2. **Payment Intent created (Stripe Connect)**:
   - Platform creates a `PaymentIntent` with `application_fee_amount` (buyer fee).
   - Funds are collected into platform’s balance, pending transfer.
3. **Buyer pays** via Stripe Checkout or client SDK → `payment_intent.succeeded` event triggers.
4. **Platform marks escrow FUNDS_HELD** and waits for delivery.
5. **Seller delivers asset** → buyer confirms or timeout auto-releases funds.
6. **Platform releases funds** to the seller’s connected account via `stripe.transfers.create()` minus seller fee.
7. **If dispute occurs**, freeze escrow → mark `DISPUTED` until resolved.
8. **Refunds** are handled through `stripe.refunds.create()` when applicable.

#### Stripe Docs References

- [Design a Connect Integration](https://docs.stripe.com/connect/design-an-integration)
- [Separate Charges and Transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [Application Fees](https://docs.stripe.com/connect/direct-charges#collect-fees)
- [Manual Payouts / Delayed Transfers](https://docs.stripe.com/connect/manual-payouts)
- [Stripe Connect Overview](https://stripe.com/docs/connect)
- [Seperate Charges and Transfers](https://stripe.com/docs/connect/separate-charges-and-transfers)
- [Transfers to connected accounts](https://stripe.com/docs/connect/payouts)
- [Charging connected accounts](https://stripe.com/docs/connect/charges-on-behalf-of)
- [Charge SaaS fees to your connected accountsPublic preview](https://docs.stripe.com/connect/accounts-v2/integrate-billing-connect)
- [Testing cards](https://docs.stripe.com/testing#cards)

#### Sample Code

```ts
import express from 'express';
import Stripe from 'stripe';
import bodyParser from 'body-parser';

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
app.use(bodyParser.json());

/**
 * 1️⃣ Buyer initiates purchase — funds held in platform account
 * Buyer is charged total amount including platform fee
 */
app.post('/api/escrow/stripe', async (req, res) => {
  try {
    const { amount, currency, buyerEmail, sellerAccountId, buyerFee } =
      req.body;
    // create Escrow object in prisma
    // await prisma.Escrow.create(); -> Escrow.status=AWAIT_FUNDS

    const paymentIntent = await stripe.paymentIntents.create({
      amount, // total buyer payment (e.g., price + buyer fee)
      currency,
      receipt_email: buyerEmail,
      application_fee_amount: buyerFee, // bloxtr8 fee from buyer
      transfer_data: {
        destination: sellerAccountId, // funds route to seller later
      },
      metadata: { escrow: true },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      escrowId: paymentIntent.id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// to learn more https://docs.stripe.com/api/include_dependent_response_values?api-version=2025-09-30.preview

/**
 * 2️⃣ Platform releases funds — minus seller fee (bloxtr8's fee)
 */
app.post('/api/escrow/release/stripe', async (req, res) => {
  try {
    const { escrowId, sellerAccountId, releaseAmount, sellerFee } = req.body;

    const pi = await stripe.paymentIntents.retrieve(escrowId);
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment not completed yet.' });
    }

    // Transfer amount to seller minus seller fee
    const netAmount = releaseAmount - sellerFee;
    const transfer = await stripe.transfers.create({
      amount: netAmount,
      currency: pi.currency,
      destination: sellerAccountId,
      source_transaction: pi.charges.data[0].id,
      metadata: { escrowId, sellerFee },
    });

    // Log release & update escrow DB status
    // prisma.escrow.update({ where: { id: escrowId }, data: { status: 'RELEASED' } });

    res.json({ success: true, transfer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3️⃣ Refund buyer — if dispute or failure
 */
app.post('/api/escrow/refund/stripe', async (req, res) => {
  try {
    const { escrowId, refundAmount } = req.body;

    const pi = await stripe.paymentIntents.retrieve(escrowId);
    const chargeId = pi.charges.data[0].id;

    const refund = await stripe.refunds.create({
      charge: chargeId,
      amount: refundAmount,
    });
    // update escrow DB -> REFUNDED
    res.json({ success: true, refund });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4️⃣ Optional: Listen for Stripe webhooks (payment confirmation)
 */
app.post(
  '/api/webhooks/stripe',
  bodyParser.raw({ type: 'application/json' }),
  (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      console.log(
        `Payment ${paymentIntent.id} succeeded. Funds held in platform.`
      );
      // update escrow DB -> FUNDS_HELD
    }

    res.json({ received: true });
  }
);

app.listen(3001, () => console.log('Server running on port 3001'));
```

#### Important notes:

- Using Stripe Connect if you want sellers to receive funds directly. Connect reduces your custodial regulatory burden but requires onboarded accounts (only for sellers).
- The fund can only be hold for 90 days in Stripe Connect Custodial account.
- Use idempotency keys for PaymentIntent/Transfer creation.
- Store webhook events to `WebhookEvent` table to avoid double-processing.
- Stripe Connect automatically handle platform(bloxtr8) fee.

```ts
const paymentIntent = await stripe.paymentIntents.create({
  amount: 10000, // $100.00 total
  currency: 'usd',
  transfer_data: {
    destination: sellerAccountId, // Seller’s connected account
  },
  application_fee_amount: 500, // $5.00 platform fee
});
//Stripe will:
//Charge the buyer $100.00
//Transfer $95.00 to the seller (minus Stripe’s 2.9% + $0.30)
//Deposit your $5.00 into bloxtr8 platform Stripe balance
```

### USDC (Base) — recommended flow

1. Generate a deposit address (or custodian subaddress) and save to `StablecoinEscrow.depositAddr`.
2. Monitor on-chain (or custodian) for incoming tx to that address matching amount.
3. Once deposit observed and confirmed, set `Escrow.status = FUNDS_HELD` and save `StablecoinEscrow.depositTx`.
4. On release: create a release transaction, save `releaseTx`, set `Escrow.status = RELEASED`.
5. **Important notes:**
   Coinbase Prime API endpoints & exact request shapes may require contract/production docs and specific API scopes. The code below is practical pseudocode using the Prime REST surface (create wallet, create transaction, webhooks). Replace endpoints & auth headers with the exact values from your Coinbase Prime docs/account.

#### Coinbase Docs References

- [Coinbase Prime API Docs (for actual api endpoints, the endpoints in the above examples are illustrative)](https://docs.cdp.coinbase.com/prime/introduction/welcome)
- [Coinbase SDK](https://github.com/coinbase-samples/prime-sdk-ts)
- [Coinbase Prime Onchain Wallet overview](https://help.coinbase.com/en/prime/onchain-wallet/introduction-to-coinbase-prime-onchain-wallet)
- [Solana support in Prime Onchain Wallet](https://help.coinbase.com/en/prime/onchain-wallet/prime-onchain-solana)

#### Sample Code

```ts
// coinbase-client.ts
import axios from 'axios';

const COINBASE_BASE =
  process.env.COINBASE_PRIME_API_BASE || 'https://api.cdp.coinbase.com';
const API_KEY = process.env.COINBASE_PRIME_API_KEY;
const API_SECRET = process.env.COINBASE_PRIME_API_SECRET; // or use OAuth/jwt as Coinbase requires
const PASSPHRASE = process.env.COINBASE_PRIME_API_PASSPHRASE;

// Simple axios instance - you will need to sign requests per Coinbase Prime auth requirements
export const coinbaseClient = axios.create({
  baseURL: COINBASE_BASE,
  headers: {
    'Content-Type': 'application/json',
    'CB-ACCESS-KEY': API_KEY,
    // other auth headers (timestamp, signature) - follow Coinbase Prime docs
  },
});

/**
 * 2️⃣ Create custodial wallet/sub-account for buyer (provision deposit address)
 */
// createWalletForUser.ts
import { coinbaseClient } from './coinbase-client';

export async function createBuyerCustodialWallet(appUserId: string) {
  // NOTE: exact endpoint and body will depend on Coinbase Prime API
  const body = {
    name: `escrow-buyer-${appUserId}`,
    network: 'solana', // for Solana USDC
    asset: 'USDC', // or use mintAddress param
    metadata: { escrowFor: appUserId },
  };

  const res = await coinbaseClient.post('/prime/v1/wallets', body);
  // res.data -> { walletId, address, depositAddress, publicKey } (example)
  return res.data;
}

/**
 * 3️⃣ Watcher / webhook handler for deposit confirmation (webhook style)
 */
// webhooks/coinbase.ts
import express from 'express';
import bodyParser from 'body-parser';
import { verifyCoinbaseSignature } from './utils';
import prisma from './prisma';

const router = express.Router();
router.use(bodyParser.json());

router.post('/coinbase/prime', async (req, res) => {
  const sig = req.headers['cb-signature'] as string;
  if (!verifyCoinbaseSignature(req.rawBody || JSON.stringify(req.body), sig)) {
    return res.status(401).send('invalid signature');
  }

  const event = req.body;
  // persist raw webhook for idempotency
  const existing = await prisma.webhookEvent.findUnique({
    where: { providerEventId: event.id },
  });
  if (existing) return res.status(200).send({ received: true });

  await prisma.webhookEvent.create({
    data: {
      provider: 'coinbase_prime',
      providerEventId: event.id,
      payload: event,
      processed: false,
    },
  });

  // handle deposit notification type
  if (
    event.type === 'wallet.deposit' ||
    event.type === 'onchain.transaction.created'
  ) {
    const data = event.data;
    const depositAddress = data.address;
    const amount = Number(data.amount);
    const mint = data.asset || data.token;
    const txSig = data.txHash || data.signature;

    // Find escrow by deposit address
    const escrow = await prisma.escrow.findFirst({
      where: { custodianBuyerWalletId: depositAddress, status: 'AWAIT_FUNDS' },
    });
    if (!escrow) {
      // optionally log unknown deposit
      await prisma.auditLog.create({
        data: {
          action: 'unknown.deposit',
          details: { depositAddress, amount, txSig },
        },
      });
      return res.status(200).send({ received: true });
    }

    // Validate mint & amount
    if (mint !== process.env.USDC_MINT) {
      await prisma.auditLog.create({
        data: {
          action: 'deposit.invalid_mint',
          details: { mint, escrowId: escrow.id },
        },
      });
      return res.status(400).send({ error: 'invalid mint' });
    }
    // Optionally wait for confirmations depending on risk tolerance

    // Mark FUNDS_HELD atomically
    await prisma.$transaction(async tx => {
      await tx.escrow.update({
        where: { id: escrow.id },
        data: {
          status: 'FUNDS_HELD',
          custodianDepositTxId: txSig,
          providerEvent: event,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'escrow.funds_held',
          details: { escrowId: escrow.id, providerTx: txSig },
        },
      });
    });
  }

  // mark webhook processed
  await prisma.webhookEvent.update({
    where: { providerEventId: event.id },
    data: { processed: true },
  });
  return res.status(200).send({ received: true });
});

export default router;
/**
 * 4️⃣ Release funds to seller (platform approves release → custodian executes transfer)
 */
// releaseFunds.ts
import { coinbaseClient } from './coinbase-client';
import prisma from './prisma';

export async function releaseEscrowToSeller(
  escrowId: string,
  operatorUserId: string
) {
  const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
  if (!escrow) throw new Error('Escrow not found');
  if (escrow.status !== 'FUNDS_HELD') throw new Error('Not in FUNDS_HELD');

  // Optionally require multi-admin approvals here...
  // Build transfer payload for Coinbase Prime: from buyer sub-wallet -> seller external address
  const transferPayload = {
    fromWalletId: escrow.custodianBuyerWalletId,
    toAddress: escrow.custodianSellerWalletId || escrow.sellerOnchainAddress, // whichever the seller wants
    amount: escrow.amount.toString(),
    asset: escrow.currency || 'USDC',
    metadata: { escrowId: escrow.id, initiatedBy: operatorUserId },
  };

  // Submit transaction to Coinbase Prime
  const res = await coinbaseClient.post(
    '/prime/v1/transactions',
    transferPayload
  );
  // res.data -> { transactionId, status, onchainSignature: ... }

  // Update DB
  await prisma.$transaction(async tx => {
    await tx.escrow.update({
      where: { id: escrow.id },
      data: {
        status: 'RELEASE_PENDING',
        custodianReleaseTxId: res.data.transactionId,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'escrow.release.initiated',
        details: {
          escrowId: escrow.id,
          txId: res.data.transactionId,
          operatorUserId,
        },
      },
    });
  });

  return res.data;
}
```

---

## 7. Milestones

- When an Offer uses milestones, create `MilestoneEscrow` rows with amounts summing to `Escrow.amount`.
- Each milestone independently progresses through `AWAIT_FUNDS` -> `FUNDS_HELD` -> `RELEASED`.
- API: `POST /escrow/:id/milestones/:mid/release` (buyer confirm / admin release).

---

## 8. Dispute handling

- `POST /escrow/:id/dispute` creates `Dispute` and sets `Escrow.status = DISPUTED`.
- Freeze actions: block automated release/refund while `DISPUTED`.
- Add `Dispute.messages` (or store in `AuditLog`) for evidence.
- Admin flow: gather evidence (Delivery.evidence, RobloxSnapshot verification, on-chain proof), then call `POST /escrow/:id/admin-resolve` with resolution `RELEASE` or `REFUND` and `resolutionReason`.
- On resolution, set `Dispute.status = RESOLVED`, `resolvedAt`, update `Escrow.status` accordingly, and create `AuditLog`.

---

## 9. Security, fraud, and compliance

- **KYC gating:** only allow high-value payments/releases if `user.kycVerified` is true and tier suffices.
- **Wallet screening:** use `User.walletRisk` to block or require manual review for `SANCTIONED` or `HIGH` risk.
- **Webhooks:** verify signatures; persist `WebhookEvent` with `eventId` and `processed` flag; idempotent processing.
- **Transactions:** wrap status transitions in DB transactions to avoid split-brain.
- **Access control:** only permit buyer, seller, or platform/admin to perform operations on an Escrow; verify link to `Offer` & `Contract`.
- **Rate limits & replay protection:** reject duplicate or replayed actions using idempotency keys.
- **Sensitive data:** encrypt PCI-sensitive data or use tokenization through providers (do not store card data yourself).

---

## 10. Auditability & observability

- Use `AuditLog` liberally: record every state transition, user action, webhook received, tx id, signature verification results.
- Add metrics & alerts: #disputes, time-to-release, failed webhooks, escrow aging (AWAIT_FUNDS > 48h), refund rate.
- Provide an admin UI to search `escrows`, `disputes`, `deliveries`, and filter by `createdAt`, `status`, `rail`.

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
POST /escrow/:id/confirm
Authorization: Bearer <buyer-token>
# verify buyer is linked to the offer
# verify escrow.status == FUNDS_HELD
# create DB tx: call payment provider to release -> update escrow.status = RELEASED -> AuditLog
```

---

## 12. Edge cases & notes

- **Partial payments:** allow partial payments for milestones; only mark milestone FUNDS_HELD when corresponding amount confirmed.
- **Expired offers:** if buyer never pays, close `Escrow` -> `CANCELLED` after expiry and notify parties.
- **Seller never delivers:** allow buyer to open dispute and request refund; platform can auto-refund if deadlines exceeded.
- **Double spends / fraud on-chain:** use confirmations threshold.
- **Chargebacks:** for card payments, maintain risk reserve for chargebacks; treat `RELEASED` as final but consider liability window for disputes and chargebacks.

---

## 13. Tests & rollout

- Unit-tests for state transitions, idempotency of webhook processing, db transaction atomicity.
- Integration tests with Stripe (test keys) and your chosen custody/custodian for USDC.
- Simulate dispute flow and ensure funds don't release while DISPUTED.
- Start with low-value trades and increase caps as monitoring and processes stabilize.

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

- Use an **idempotency-key** header for: PaymentIntent creation, Transfers, Refunds.

- Webhook processing pattern:
  1. validate signature
  2. insert `WebhookEvent` with `eventId`, provider, raw payload
  3. if `processed` false -> process and mark `processed = true`

- DB transaction pattern pseudocode:

```js
await prisma.$transaction(async tx => {
  const escrow = await tx.escrow.update({
    where: { id },
    data: { status: 'FUNDS_HELD' },
  });
  await tx.auditLog.create({
    data: { action: 'escrow.funds_held', details: { escrowId: id } },
  });
});
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
    return await prisma.$transaction(async tx => {
      // Optimistic locking
      const current = await tx.escrow.findUnique({
        where: { id: escrowId },
        select: { status: true, version: true },
      });

      if (!current) throw new AppError('Escrow not found', 404);

      if (!this.VALID_TRANSITIONS[current.status]?.includes(newStatus)) {
        throw new AppError('Invalid state transition', 400);
      }

      // Update with version check
      const updated = await tx.escrow.update({
        where: {
          id: escrowId,
          version: current.version, // Optimistic locking
        },
        data: {
          status: newStatus,
          lastModifiedBy: userId,
          version: { increment: 1 },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: `escrow.${newStatus.toLowerCase()}`,
          details: { escrowId, reason, previousStatus: current.status },
          userId,
          escrowId,
        },
      });

      return updated;
    });
  }
}
```

#### Enhanced Authorization Middleware

```ts
export const escrowAccessControl = (
  requiredRole: 'buyer' | 'seller' | 'admin'
) => {
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
      const signature =
        req.headers[provider === 'stripe' ? 'stripe-signature' : 'x-signature'];
      const isValid = await verifyWebhookSignature(
        req.body,
        signature,
        provider
      );

      if (!isValid) {
        throw new AppError('Invalid webhook signature', 401);
      }

      // Check idempotency with timeout
      const eventId = req.body.id;
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventId },
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
    return await prisma.$transaction(async tx => {
      // Check if user is party to escrow
      const escrow = await tx.escrow.findUnique({
        where: { id: escrowId },
        include: { offer: true },
      });

      if (!escrow) throw new AppError('Escrow not found', 404);

      const isParty =
        escrow.offer.buyerId === userId || escrow.offer.sellerId === userId;
      if (!isParty) throw new AppError('Not authorized to dispute', 403);

      // Check for existing disputes
      const existingDispute = await tx.dispute.findFirst({
        where: { escrowId, status: { in: ['OPEN', 'IN_REVIEW'] } },
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
          status: 'OPEN',
        },
      });

      // Freeze escrow
      await tx.escrow.update({
        where: { id: escrowId },
        data: { status: 'DISPUTED' },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'dispute.created',
          details: { disputeId: dispute.id, evidence: validatedEvidence },
          userId,
          escrowId,
        },
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
        userId: details.userId,
      },
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
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
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
