# End-to-End Flows

## Complete Transaction Flow

This document outlines the complete end-to-end flow of a Bloxtr8 transaction, from initial listing creation to final settlement.

## Flow Overview

```mermaid
flowchart TD
    A[User Creates Listing] --> B[Buyer Makes Offer]
    B --> C{Offer Negotiation}
    C -->|Accepted| D[Contract Generation]
    C -->|Countered| B
    C -->|Declined| E[Offer Expired]

    D --> F[Digital Signatures]
    F --> G[Escrow Creation]
    G --> H{Payment Rail}

    H -->|≤$10k| I[Stripe Payment]
    H -->|>$10k| J[USDC on Base]

    I --> K[Funds Held]
    J --> K

    K --> L[Delivery Process]
    L --> M{Delivery Confirmed?}

    M -->|Yes| N[Funds Released]
    M -->|No| O[Dispute Process]

    O --> P{Dispute Resolution}
    P -->|Seller Wins| N
    P -->|Buyer Wins| Q[Funds Refunded]

    N --> R[Transaction Complete]
    Q --> R
    E --> R
```

## Detailed Step-by-Step Flow

### 1. User Onboarding & Verification

```mermaid
sequenceDiagram
    participant U as User
    participant DB as Discord Bot
    participant API as API Server
    participant DB as Database

    U->>DB: /auth command
    DB->>API: GET /auth/discord
    API->>DB: Discord OAuth URL
    DB->>U: Redirect to Discord OAuth

    U->>DB: Complete OAuth
    DB->>API: POST /auth/callback
    API->>DB: Create/Update User
    API->>DB: JWT Token

    DB->>U: Welcome message
    DB->>U: KYC verification prompt
```

**Key Points:**

- Discord OAuth2 integration
- User profile creation/update
- KYC tier assignment
- Wallet screening (if applicable)

### 2. Listing Creation

```mermaid
sequenceDiagram
    participant U as User
    participant DB as Discord Bot
    participant API as API Server
    participant RL as Roblox API
    participant DB as Database

    U->>DB: /listing create
    DB->>API: Check user KYC status
    API->>DB: User verification status

    alt User not KYC verified
        DB->>U: KYC verification required
    else User verified
        DB->>U: Show listing modal
        U->>DB: Fill listing details
        DB->>API: POST /listings
        API->>RL: Verify Roblox asset
        RL->>API: Asset verification data
        API->>DB: Create listing
        API->>DB: Success response
        DB->>U: Listing created embed
    end
```

**Key Points:**

- KYC verification check
- Roblox asset verification
- Modal form for data collection
- Rich embed responses

### 3. Offer Negotiation

```mermaid
sequenceDiagram
    participant B as Buyer
    participant S as Seller
    participant DB as Discord Bot
    participant API as API Server

    B->>DB: Click "Make Offer" button
    DB->>B: Show offer modal
    B->>DB: Submit offer details
    DB->>API: POST /offers

    API->>DB: Offer created
    DB->>S: DM with offer details

    alt Seller accepts
        S->>DB: Click "Accept" button
        DB->>API: POST /offers/:id/accept
        API->>DB: Offer accepted
        DB->>B: Offer accepted notification
        DB->>S: Offer accepted confirmation
    else Seller counters
        S->>DB: Click "Counter" button
        DB->>S: Show counter-offer modal
        S->>DB: Submit counter-offer
        DB->>API: POST /offers (parentId)
        API->>DB: Counter-offer created
        DB->>B: Counter-offer notification
    else Seller declines
        S->>DB: Click "Decline" button
        DB->>API: POST /offers/:id/decline
        API->>DB: Offer declined
        DB->>B: Offer declined notification
    end
```

**Key Points:**

- Real-time offer notifications
- Counter-offer support
- Automatic expiry handling
- Rich interaction buttons

### 4. Contract Generation & Signing

```mermaid
sequenceDiagram
    participant B as Buyer
    participant S as Seller
    participant API as API Server
    participant DS as DocuSign
    participant S3 as AWS S3

    API->>API: Offer accepted trigger
    API->>S3: Generate contract PDF
    S3->>API: PDF URL
    API->>DS: Create signing session
    DS->>API: Signing URLs

    API->>B: Contract signing DM
    API->>S: Contract signing DM

    B->>DS: Sign contract
    S->>DS: Sign contract

    DS->>API: Signing webhook
    API->>API: Update contract status

    alt Both parties signed
        API->>API: Contract executed
        API->>B: Contract executed notification
        API->>S: Contract executed notification
    else Signing expired
        API->>API: Contract voided
        API->>B: Contract expired notification
        API->>S: Contract expired notification
    end
```

**Key Points:**

- Automated PDF generation
- DocuSign embedded signing
- Webhook-driven status updates
- Automatic expiry handling

### 5. Escrow Creation & Funding

#### Stripe Path (≤$10k)

```mermaid
sequenceDiagram
    participant B as Buyer
    participant API as API Server
    participant ST as Stripe
    participant DB as Database

    API->>API: Contract executed trigger
    API->>DB: Create escrow record
    API->>ST: Create PaymentIntent
    ST->>API: PaymentIntent + client_secret

    API->>B: Payment link/button
    B->>ST: Complete payment
    ST->>API: payment_intent.succeeded webhook

    API->>DB: Update escrow status
    API->>B: Payment confirmed
    API->>S: Funds held notification
```

#### USDC Path (>$10k)

```mermaid
sequenceDiagram
    participant B as Buyer
    participant API as API Server
    participant CU as Custodian
    participant BC as Base Chain
    participant DB as Database

    API->>API: Contract executed trigger
    API->>DB: Create escrow record
    API->>CU: Create deposit address
    CU->>API: Deposit address + QR

    API->>B: Deposit instructions
    B->>BC: Send USDC to address
    BC->>CU: Transaction confirmed
    CU->>API: Deposit webhook

    API->>DB: Update escrow status
    API->>B: Payment confirmed
    API->>S: Funds held notification
```

**Key Points:**

- Dual payment rail support
- Webhook-driven state management
- Real-time status updates
- Automatic timeout handling

### 6. Delivery Process

```mermaid
sequenceDiagram
    participant S as Seller
    participant B as Buyer
    participant DB as Discord Bot
    participant API as API Server
    participant RL as Roblox API

    API->>S: Delivery notification
    S->>RL: Transfer Roblox asset
    S->>DB: Mark as delivered
    DB->>API: POST /escrow/:id/deliver

    API->>RL: Verify asset transfer
    RL->>API: Transfer confirmation
    API->>DB: Update delivery status

    DB->>B: Delivery confirmation request
    B->>RL: Verify asset ownership
    RL->>B: Ownership confirmed

    alt Buyer confirms
        B->>DB: Click "Confirm" button
        DB->>API: POST /escrow/:id/confirm
        API->>API: Trigger fund release
    else Buyer disputes
        B->>DB: Click "Dispute" button
        DB->>API: POST /disputes
        API->>API: Create dispute record
    else Auto-timeout
        API->>API: Auto-confirm after timeout
    end
```

**Key Points:**

- Roblox asset verification
- Confirmation/dispute options
- Automatic timeout handling
- Asset ownership verification

### 7. Fund Release & Settlement

#### Successful Release

```mermaid
sequenceDiagram
    participant B as Buyer
    participant S as Seller
    participant API as API Server
    participant ST as Stripe/Custodian
    participant DB as Database

    API->>API: Delivery confirmed trigger

    alt Stripe escrow
        API->>ST: Create transfer to seller
        ST->>API: Transfer completed
    else USDC escrow
        API->>ST: Release USDC to seller
        ST->>API: Release completed
    end

    API->>DB: Update escrow status
    API->>S: Funds released notification
    API->>B: Transaction complete
    API->>API: Create audit log
```

#### Dispute Resolution

```mermaid
sequenceDiagram
    participant B as Buyer
    participant S as Seller
    participant M as Moderator
    participant API as API Server

    API->>API: Dispute created trigger
    API->>M: Dispute notification
    M->>API: Review evidence pack

    M->>API: Make resolution decision

    alt Release to seller
        API->>API: Release funds to seller
        API->>S: Funds released
        API->>B: Dispute resolved (seller wins)
    else Refund to buyer
        API->>API: Refund funds to buyer
        API->>B: Funds refunded
        API->>S: Dispute resolved (buyer wins)
    end

    API->>API: Update dispute status
    API->>API: Create audit log
```

**Key Points:**

- Automated fund release
- Dispute resolution workflow
- Comprehensive audit logging
- Multi-rail settlement support

## Error Handling & Edge Cases

### Common Error Scenarios

1. **Payment Failures**
   - Stripe payment declined
   - USDC transaction failed
   - Insufficient funds

2. **Contract Issues**
   - Signing timeout
   - Invalid signatures
   - PDF generation failure

3. **Delivery Problems**
   - Asset transfer failure
   - Ownership verification issues
   - Disputed deliveries

4. **System Failures**
   - API downtime
   - Database issues
   - External service outages

### Recovery Mechanisms

- **Automatic retries** for transient failures
- **Manual intervention** for complex issues
- **Escalation procedures** for critical problems
- **Audit trails** for all actions
- **Rollback capabilities** where appropriate

## Monitoring & Analytics

### Key Metrics

- **Transaction volume** and value
- **Success rates** by payment rail
- **Dispute rates** and resolution times
- **User satisfaction** scores
- **System performance** metrics

### Alerts & Notifications

- **Failed transactions** requiring attention
- **High dispute rates** indicating issues
- **System performance** degradation
- **Security incidents** or anomalies
- **Compliance violations** or risks

This end-to-end flow ensures a robust, secure, and user-friendly escrow platform that handles the complexities of Discord-native trading while maintaining high security and compliance standards.
