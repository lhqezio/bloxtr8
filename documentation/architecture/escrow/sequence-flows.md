# Sequence Flows

Detailed sequence diagrams for all escrow flows, showing Kafka event interactions between services.

## Contract Executed → Escrow Creation Flow

```mermaid
sequenceDiagram
    participant Contract as Contract Service
    participant Kafka as Kafka
    participant API as API Gateway
    participant Escrow as Escrow Service
    participant Payments as Payments Service

    Contract->>Kafka: ContractExecuted event
    Kafka->>API: Consume ContractExecuted
    API->>API: Validate contract status
    API->>Kafka: CreateEscrow command
    Kafka->>Escrow: Consume CreateEscrow
    Escrow->>Escrow: Create Escrow (AWAIT_FUNDS)
    Escrow->>Kafka: EscrowCreated event
    Escrow->>Kafka: EscrowAwaitFunds event
    Escrow->>Kafka: CreatePaymentIntent command
    Kafka->>Payments: Consume CreatePaymentIntent
    Payments->>Payments: Create PaymentIntent (Stripe) or Deposit Address (Custodian)
    Payments->>Kafka: PaymentIntentCreated event
```

**Key Points**:

- Contract execution triggers escrow creation
- Escrow Service owns escrow state
- Payments Service handles payment provider integration
- All state changes emit events for other services

## Stripe Payment Flow

### Payment Initiation

```mermaid
sequenceDiagram
    participant Buyer
    participant API as API Gateway
    participant Kafka as Kafka
    participant Escrow as Escrow Service
    participant Payments as Payments Service
    participant Stripe

    Buyer->>API: GET /api/escrow/:id (fetch payment intent)
    API->>Escrow: Query escrow status
    Escrow-->>API: Escrow + PaymentIntent data
    API-->>Buyer: Return client_secret
    Buyer->>Stripe: Complete payment (Stripe UI)
    Stripe->>Stripe: Process payment
```

### Payment Completion (Webhook)

```mermaid
sequenceDiagram
    participant Stripe
    participant API as API Gateway
    participant Payments as Payments Service
    participant Kafka as Kafka
    participant Escrow as Escrow Service
    participant Notif as Notifications Service

    Stripe->>API: POST /api/webhooks/stripe (payment_intent.succeeded)
    API->>Payments: Verify webhook signature
    Payments->>Payments: Check idempotency (WebhookEvent table)
    Payments->>Payments: Extract escrow_id from metadata
    Payments->>Kafka: StripeWebhookValidated event
    Payments->>Kafka: PaymentSucceeded event
    Kafka->>Escrow: Consume PaymentSucceeded
    Escrow->>Escrow: Validate guard (status = AWAIT_FUNDS)
    Escrow->>Escrow: Update state to FUNDS_HELD
    Escrow->>Kafka: EscrowFundsHeld event
    Kafka->>Notif: Consume EscrowFundsHeld
    Notif->>Buyer: Send DM: "Funds secured"
    Notif->>Seller: Send DM: "Begin delivery"
```

**Key Points**:

- Webhook signature verification before processing
- Idempotency check prevents duplicate processing
- Escrow state transition triggered by payment event
- Notifications sent asynchronously

## USDC Payment Flow (Custodian)

### Deposit Address Generation

```mermaid
sequenceDiagram
    participant Buyer
    participant API as API Gateway
    participant Kafka as Kafka
    participant Escrow as Escrow Service
    participant Payments as Payments Service
    participant Custodian

    Escrow->>Kafka: EscrowCreated event
    Escrow->>Kafka: CreatePaymentIntent command
    Kafka->>Payments: Consume CreatePaymentIntent
    Payments->>Custodian: POST /addresses (generate deposit address)
    Custodian-->>Payments: Deposit address
    Payments->>Payments: Store deposit address
    Payments->>Kafka: PaymentIntentCreated event
    Kafka->>API: Consume PaymentIntentCreated
    Buyer->>API: GET /api/escrow/:id
    API-->>Buyer: Return deposit address + QR code
```

### Deposit Confirmation

```mermaid
sequenceDiagram
    participant Buyer
    participant Blockchain as Base Network
    participant Custodian
    participant API as API Gateway
    participant Payments as Payments Service
    participant TRM as TRM Labs
    participant Chainalysis
    participant Kafka as Kafka
    participant Escrow as Escrow Service

    Buyer->>Blockchain: Send USDC to deposit address
    Blockchain->>Blockchain: Confirm transaction
    Custodian->>API: POST /api/webhooks/custodian (deposit.confirmed)
    API->>Payments: Verify webhook signature
    Payments->>Payments: Check idempotency
    Payments->>TRM: Screen sender wallet
    Payments->>Chainalysis: Sanctions check
    alt High Risk or Sanctioned
        Payments->>Payments: Initiate refund
        Payments->>Kafka: RefundSucceeded event
    else Low Risk
        Payments->>Kafka: CustodianWebhookValidated event
        Payments->>Kafka: PaymentSucceeded event
        Kafka->>Escrow: Consume PaymentSucceeded
        Escrow->>Escrow: Update state to FUNDS_HELD
        Escrow->>Kafka: EscrowFundsHeld event
    end
```

**Key Points**:

- Wallet screening before accepting funds
- Automatic refund for high-risk wallets
- Same event flow as Stripe after screening passes

## Delivery Flow

```mermaid
sequenceDiagram
    participant Seller
    participant API as API Gateway
    participant Kafka as Kafka
    participant Escrow as Escrow Service
    participant Notif as Notifications Service
    participant Buyer

    Seller->>API: POST /api/escrow/:id/mark-delivered
    API->>API: Validate authorization (seller only)
    API->>Kafka: MarkDelivered command
    Kafka->>Escrow: Consume MarkDelivered
    Escrow->>Escrow: Validate guard (status = FUNDS_HELD, actor = seller)
    Escrow->>Escrow: Check idempotency
    Escrow->>Escrow: Update state to DELIVERED
    Escrow->>Kafka: EscrowDelivered event
    Kafka->>Notif: Consume EscrowDelivered
    Notif->>Buyer: Send DM: "Confirm delivery or dispute"
    Notif->>Seller: Send DM: "Waiting for buyer confirmation"
```

**Key Points**:

- Authorization check: Only seller can mark delivered
- State guard: Must be FUNDS_HELD
- Notification sent to buyer with action buttons

## Release Flow (Stripe)

```mermaid
sequenceDiagram
    participant Buyer
    participant API as API Gateway
    participant Kafka as Kafka
    participant Escrow as Escrow Service
    participant Payments as Payments Service
    participant Stripe
    participant Notif as Notifications Service

    Buyer->>API: POST /api/escrow/:id/release
    API->>API: Validate authorization (buyer only)
    API->>Kafka: ReleaseFunds command
    Kafka->>Escrow: Consume ReleaseFunds
    Escrow->>Escrow: Validate guard (status = DELIVERED, actor = buyer)
    Escrow->>Escrow: Update state to RELEASING (intermediate)
    Escrow->>Kafka: TransferToSeller command
    Kafka->>Payments: Consume TransferToSeller
    Payments->>Stripe: POST /transfers (create transfer)
    Stripe-->>Payments: Transfer ID
    Payments->>Payments: Store transfer_id
    Payments->>Kafka: TransferSucceeded event
    Kafka->>Escrow: Consume TransferSucceeded
    Escrow->>Escrow: Update state to RELEASED
    Escrow->>Kafka: EscrowReleased event
    Kafka->>Notif: Consume EscrowReleased
    Notif->>Buyer: Send DM: "Transaction complete"
    Notif->>Seller: Send DM: "Funds released"
```

**Key Points**:

- Authorization check: Only buyer can release
- Two-step process: Release command → Transfer command → Transfer succeeded
- Notifications sent to both parties

## Release Flow (USDC)

```mermaid
sequenceDiagram
    participant Buyer
    participant API as API Gateway
    participant Kafka as Kafka
    participant Escrow as Escrow Service
    participant Payments as Payments Service
    participant Custodian
    participant Blockchain as Base Network
    participant Notif as Notifications Service

    Buyer->>API: POST /api/escrow/:id/release
    API->>API: Validate authorization
    API->>Kafka: ReleaseFunds command
    Kafka->>Escrow: Consume ReleaseFunds
    Escrow->>Escrow: Validate guard
    Escrow->>Kafka: TransferToSeller command
    Kafka->>Payments: Consume TransferToSeller
    Payments->>Custodian: POST /transfers (transfer USDC)
    Custodian->>Blockchain: Execute transfer
    Blockchain-->>Custodian: Transaction hash
    Custodian->>Payments: Webhook (transfer.completed)
    Payments->>Payments: Verify webhook signature
    Payments->>Kafka: TransferSucceeded event
    Kafka->>Escrow: Consume TransferSucceeded
    Escrow->>Escrow: Update state to RELEASED
    Escrow->>Kafka: EscrowReleased event
    Kafka->>Notif: Consume EscrowReleased
    Notif->>Buyer: Send DM with transaction hash
    Notif->>Seller: Send DM with transaction hash
```

**Key Points**:

- Similar flow to Stripe but uses blockchain
- Transaction hash included in notifications
- Webhook confirms blockchain confirmation

## Refund Flow

### Timeout Refund

```mermaid
sequenceDiagram
    participant Cron as Scheduled Job
    participant Kafka as Kafka
    participant Escrow as Escrow Service
    participant Payments as Payments Service
    participant Provider as Stripe/Custodian
    participant Notif as Notifications Service

    Cron->>Escrow: Query escrows in AWAIT_FUNDS > 72h
    Cron->>Kafka: CancelEscrow command (for each)
    Kafka->>Escrow: Consume CancelEscrow
    Escrow->>Escrow: Update state to CANCELLED
    Escrow->>Kafka: EscrowCancelled event
    Note over Escrow: If FUNDS_HELD, initiate refund
    Escrow->>Kafka: InitiateRefund command
    Kafka->>Payments: Consume InitiateRefund
    Payments->>Provider: Create refund
    Provider-->>Payments: Refund ID
    Payments->>Kafka: RefundSucceeded event
    Kafka->>Escrow: Consume RefundSucceeded
    Escrow->>Escrow: Update state to REFUNDED
    Escrow->>Kafka: EscrowRefunded event
    Kafka->>Notif: Consume EscrowRefunded
    Notif->>Buyer: Send DM: "Refund processed"
```

### Dispute Refund

```mermaid
sequenceDiagram
    participant Buyer
    participant API as API Gateway
    participant Kafka as Kafka
    participant Escrow as Escrow Service
    participant Admin
    participant Payments as Payments Service
    participant Provider as Stripe/Custodian

    Buyer->>API: POST /api/escrow/:id/dispute
    API->>Kafka: RaiseDispute command
    Kafka->>Escrow: Consume RaiseDispute
    Escrow->>Escrow: Update state to DISPUTED
    Escrow->>Kafka: EscrowDisputed event

    Note over Admin: Admin reviews dispute

    Admin->>API: POST /api/disputes/:id/resolve (favor buyer)
    API->>Kafka: ResolveDispute command
    Kafka->>Escrow: Consume ResolveDispute
    Escrow->>Kafka: InitiateRefund command
    Kafka->>Payments: Consume InitiateRefund
    Payments->>Provider: Create refund
    Provider-->>Payments: Refund ID
    Payments->>Kafka: RefundSucceeded event
    Kafka->>Escrow: Consume RefundSucceeded
    Escrow->>Escrow: Update state to REFUNDED
    Escrow->>Kafka: EscrowRefunded event
```

**Key Points**:

- Refunds can be triggered by timeout, cancellation, or dispute resolution
- Payments Service handles provider-specific refund logic
- Escrow Service coordinates state transitions

## Dispute Flow

```mermaid
sequenceDiagram
    participant Buyer
    participant API as API Gateway
    participant Kafka as Kafka
    participant Escrow as Escrow Service
    participant Admin
    participant Payments as Payments Service

    Buyer->>API: POST /api/escrow/:id/dispute
    API->>API: Validate authorization (buyer or seller)
    API->>Kafka: RaiseDispute command
    Kafka->>Escrow: Consume RaiseDispute
    Escrow->>Escrow: Validate guard (status = FUNDS_HELD or DELIVERED)
    Escrow->>Escrow: Update state to DISPUTED
    Escrow->>Kafka: EscrowDisputed event
    Kafka->>Admin: Notify moderators (via Notifications Service)

    Note over Admin: Admin reviews evidence

    alt Favor Seller
        Admin->>API: POST /api/disputes/:id/resolve (favor seller)
        API->>Kafka: ResolveDispute command
        Kafka->>Escrow: Consume ResolveDispute
        Escrow->>Kafka: ReleaseFunds command
        Note over Escrow: Proceeds to release flow
    else Favor Buyer
        Admin->>API: POST /api/disputes/:id/resolve (favor buyer)
        API->>Kafka: ResolveDispute command
        Kafka->>Escrow: Consume ResolveDispute
        Escrow->>Kafka: InitiateRefund command
        Note over Escrow: Proceeds to refund flow
    end
```

**Key Points**:

- Disputes can be raised by buyer or seller
- Admin resolution triggers either release or refund
- State transition depends on resolution outcome

## Error Handling Flow

### Payment Failure

```mermaid
sequenceDiagram
    participant Stripe
    participant API as API Gateway
    participant Payments as Payments Service
    participant Kafka as Kafka
    participant Escrow as Escrow Service
    participant Notif as Notifications Service

    Stripe->>API: POST /api/webhooks/stripe (payment_intent.payment_failed)
    API->>Payments: Verify webhook signature
    Payments->>Kafka: PaymentFailed event
    Kafka->>Escrow: Consume PaymentFailed
    Escrow->>Escrow: Log failure (status remains AWAIT_FUNDS)
    Escrow->>Escrow: Increment retry count
    alt Retry Count < Max
        Escrow->>Kafka: CreatePaymentIntent command (retry)
    else Retry Count >= Max
        Escrow->>Kafka: CancelEscrow command
        Escrow->>Kafka: EscrowCancelled event
        Kafka->>Notif: Consume EscrowCancelled
        Notif->>Buyer: Send DM: "Payment failed, escrow cancelled"
    end
```

### Transfer Failure

```mermaid
sequenceDiagram
    participant Stripe
    participant API as API Gateway
    participant Payments as Payments Service
    participant Kafka as Kafka
    participant Escrow as Escrow Service

    Stripe->>API: POST /api/webhooks/stripe (transfer.failed)
    API->>Payments: Verify webhook signature
    Payments->>Kafka: TransferFailed event
    Kafka->>Escrow: Consume TransferFailed
    Escrow->>Escrow: Update state back to DELIVERED
    Escrow->>Escrow: Increment retry count
    alt Retry Count < Max
        Escrow->>Kafka: TransferToSeller command (retry)
    else Retry Count >= Max
        Escrow->>Escrow: Alert admin (manual intervention required)
    end
```

**Key Points**:

- Failures trigger retries with exponential backoff
- Maximum retry count prevents infinite loops
- Manual intervention required for persistent failures

## Complete Flow Summary

### Happy Path (Stripe)

```
ContractExecuted
  → CreateEscrow
  → EscrowCreated + EscrowAwaitFunds
  → CreatePaymentIntent
  → PaymentIntentCreated
  → [User pays via Stripe UI]
  → StripeWebhookValidated
  → PaymentSucceeded
  → EscrowFundsHeld
  → MarkDelivered
  → EscrowDelivered
  → ReleaseFunds
  → TransferToSeller
  → TransferSucceeded
  → EscrowReleased
```

### Happy Path (USDC)

```
ContractExecuted
  → CreateEscrow
  → EscrowCreated + EscrowAwaitFunds
  → CreatePaymentIntent
  → PaymentIntentCreated (deposit address)
  → [User sends USDC]
  → CustodianWebhookValidated
  → Wallet Screening (TRM + Chainalysis)
  → PaymentSucceeded
  → EscrowFundsHeld
  → MarkDelivered
  → EscrowDelivered
  → ReleaseFunds
  → TransferToSeller
  → TransferSucceeded
  → EscrowReleased
```

## Related Documentation

- [State Machine](./state-machine.md) - State transition definitions
- [Event Schemas](./event-schemas.md) - Event structure details
- [Error Handling](./error-handling-retries.md) - Retry and recovery strategies
