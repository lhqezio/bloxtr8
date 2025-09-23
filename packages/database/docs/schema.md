# Database Schema

## Entity Relationship Diagram

```mermaid
erDiagram
    User {
        string id PK
        string discordId UK
        string username
        string email
        string phone
        datetime createdAt
        datetime updatedAt
        enum kycTier
        boolean kycVerified
        string walletAddress
        enum walletRisk
    }

    Guild {
        string id PK
        string discordId UK
        string name
        string description
        datetime createdAt
        datetime updatedAt
    }

    GuildMember {
        string id PK
        enum role
        datetime joinedAt
        string userId FK
        string guildId FK
    }

    Listing {
        string id PK
        string title
        string summary
        int price
        string category
        enum status
        datetime createdAt
        datetime updatedAt
        string userId FK
        string guildId FK
    }

    Offer {
        string id PK
        int amount
        enum currency
        string conditions
        datetime expiry
        enum status
        datetime createdAt
        datetime updatedAt
        string listingId FK
        string buyerId FK
        string sellerId FK
        string parentId FK
    }

    Contract {
        string id PK
        string pdfUrl
        string sha256
        enum status
        datetime createdAt
        datetime updatedAt
        string offerId FK
    }

    Signature {
        string id PK
        datetime signedAt
        string userId FK
        string contractId FK
    }

    Escrow {
        string id PK
        enum rail
        int amount
        enum currency
        enum status
        datetime createdAt
        datetime updatedAt
        string offerId FK
        string contractId FK
    }

    StripeEscrow {
        string id PK
        string paymentIntentId UK
        string transferId
        string refundId
        string escrowId FK
    }

    StablecoinEscrow {
        string id PK
        string chain
        string depositAddr
        string depositTx
        string releaseTx
        string escrowId FK
    }

    MilestoneEscrow {
        string id PK
        string title
        int amountCents
        enum status
        string escrowId FK
    }

    Delivery {
        string id PK
        string title
        string description
        enum status
        datetime deliveredAt
        datetime createdAt
        datetime updatedAt
        string listingId FK
        string offerId FK
        string contractId FK
        string escrowId FK
        string deliveredBy FK
    }

    Dispute {
        string id PK
        string title
        string description
        enum status
        string resolution
        datetime createdAt
        datetime updatedAt
        datetime resolvedAt
        string escrowId FK
        string userId FK
    }

    RobloxSnapshot {
        string id PK
        string groupId
        string owner
        int memberCount
        json metadata
        datetime createdAt
        string listingId FK
    }

    AuditLog {
        string id PK
        string action
        json details
        datetime createdAt
        string userId FK
        string escrowId FK
    }

    WebhookEvent {
        string id PK
        string eventId UK
        string provider
        boolean processed
        datetime createdAt
    }

    %% User Relationships
    User ||--o{ Listing : "creates"
    User ||--o{ Offer : "makes_as_buyer"
    User ||--o{ Offer : "receives_as_seller"
    User ||--o{ Signature : "signs"
    User ||--o{ AuditLog : "performs_action"
    User ||--o{ Delivery : "delivers"
    User ||--o{ Dispute : "initiates"
    User ||--o{ GuildMember : "belongs_to"

    %% Guild Relationships
    Guild ||--o{ GuildMember : "has_members"
    Guild ||--o{ Listing : "hosts"

    %% Listing Relationships
    Listing ||--o{ Offer : "receives"
    Listing ||--o{ RobloxSnapshot : "verified_by"
    Listing ||--o{ Delivery : "delivered_via"

    %% Offer Relationships
    Offer ||--o{ Contract : "becomes"
    Offer ||--o{ Escrow : "funds"
    Offer ||--o{ Delivery : "delivered_via"
    Offer ||--o| Offer : "counters"

    %% Contract Relationships
    Contract ||--o{ Signature : "requires"
    Contract ||--o{ Escrow : "secured_by"
    Contract ||--o{ Delivery : "delivered_via"

    %% Escrow Relationships
    Escrow ||--o| StripeEscrow : "stripe_data"
    Escrow ||--o| StablecoinEscrow : "crypto_data"
    Escrow ||--o{ MilestoneEscrow : "milestones"
    Escrow ||--o{ AuditLog : "logged"
    Escrow ||--o{ Delivery : "delivered_via"
    Escrow ||--o{ Dispute : "disputed"
```

## Core Transaction Flow

```mermaid
flowchart TD
    A[User Creates Listing] --> B[Another User Makes Offer]
    B --> C{Offer Accepted?}
    C -->|Yes| D[Contract Generated]
    C -->|No| E[Offer Declined/Expired]
    D --> F[Both Parties Sign Contract]
    F --> G[Escrow Created]
    G --> H[Funds Deposited]
    H --> I[Delivery Initiated]
    I --> J[Item Delivered]
    J --> K{Delivery Confirmed?}
    K -->|Yes| L[Funds Released]
    K -->|No| M[Dispute Created]
    M --> N[Resolution Process]
    N --> O[Funds Released/Refunded]
    L --> P[Transaction Complete]
    O --> P
```

## Guild Integration Flow

```mermaid
flowchart TD
    A[Discord Server] --> B[Guild Created]
    B --> C[Users Join Guild]
    C --> D[Guild Roles Assigned]
    D --> E[Guild Listings Created]
    E --> F[Community Trading]
    F --> G[Guild Moderation]
```

## Payment Rails

```mermaid
flowchart LR
    A[Escrow Created] --> B{Payment Rail}
    B -->|Stripe| C[StripeEscrow]
    B -->|USDC| D[StablecoinEscrow]
    C --> E[Traditional Payment]
    D --> F[Crypto Payment]
    E --> G[Funds Held]
    F --> G
    G --> H[Release/Refund]
```

## Data Integrity & Audit

```mermaid
flowchart TD
    A[User Action] --> B[AuditLog Created]
    C[Escrow Event] --> B
    D[System Event] --> B
    B --> E[Immutable Record]
    E --> F[Compliance Reporting]
    F --> G[Dispute Resolution]
```

## Key Features Highlighted

### 🔐 Security & Compliance

- KYC tiers and verification
- Wallet risk assessment
- Comprehensive audit logging
- Immutable transaction records

### 💰 Multi-Rail Payments

- Stripe for traditional payments
- USDC on Base blockchain
- Milestone-based releases
- Automatic refund capabilities

### 🏛️ Guild System

- Discord server integration
- Role-based permissions
- Community trading
- Guild-specific listings

### 📦 Delivery Tracking

- Status-based workflow
- Confirmation system
- Dispute integration
- Audit trail

### ⚖️ Dispute Resolution

- Escrow-linked disputes
- Status tracking
- Resolution documentation
- Timeline management

This visual schema shows the complete database structure with all relationships, transaction flows, and key features of the Bloxtr8 platform.
