# Discord Bot Flow Diagrams

## 🎮 Message-Based Marketplace Architecture

### Listing Creation Flow

```mermaid
flowchart TD
    A[User runs /listing create] --> B[Bot checks user exists in DB]
    B --> C{User exists?}

    C -->|NO| D[Create user record]
    D --> E[User created]
    E --> F[Check KYC verification]

    C -->|YES| G[Check KYC verification]

    F --> H{KYC tier check}
    G --> H
    H -->|TIER_0| I[Show setup message]
    I --> J[User must link Roblox account]

    H -->|TIER_1+| K[Verify game ownership]
    K --> L[Show Discord modal]
    L --> M[User fills: title, price, category]
    M --> N[Validate input]
    N --> O{Valid input?}

    O -->|NO| P[Show validation error]
    P --> Q[End process]

    O -->|YES| R[Determine price range]
    R --> S[Call POST /listings API]
    S --> T{API call successful?}

    T -->|NO| U[Show API error]
    U --> V[End process]

    T -->|YES| W[Create asset snapshot]
    W --> X[Post message in price channel]
    X --> Y[Post rich embed as message]
    Y --> Z[Update listing with message ID]
    Z --> AA[Show success with message link]
    AA --> AB{Visibility PUBLIC?}

    AB -->|YES| AC[Sync to all guilds]
    AB -->|NO| AD[End]
    AC --> AD
```

### Guild Join Flow

```mermaid
flowchart TD
    A[Bot joins guild] --> B[guildCreate event]
    B --> C[Create marketplace category]
    C --> D[Create price channels]
    D --> E[💚 under-5k]
    D --> F[💰 5k-20k]
    D --> G[💎 20k-100k]
    D --> H[👑 100k+]

    E --> I[Post welcome msgs]
    F --> I
    G --> I
    H --> I

    I --> J[Start background sync]
    J --> K[Fetch PUBLIC listings]
    K --> L{More listings?}

    L -->|YES| M[Get next page]
    M --> N[Post messages]
    N --> O[Update with message IDs]
    O --> P[Wait 2s rate limit]
    P --> L

    L -->|NO| Q[Sync complete]
```

### Cross-Guild Sync Flow

```mermaid
flowchart TD
    A[PUBLIC listing created] --> B[Message in origin guild]
    B --> C[Get all guilds]
    C --> D{More guilds?}

    D -->|YES| E[Next guild]
    E --> F{Origin guild?}

    F -->|YES| D
    F -->|NO| G[Get price channel]

    G --> H[Post message]
    H --> I[Post embed]
    I --> J[Add buttons]
    J --> K[Wait 2s]
    K --> D

    D -->|NO| L[Complete]
```

## Key Features

### Price-Range Channels

The bot automatically creates 4 channels based on listing price:

- **💚 bloxtr8-under-5k**: Under $5,000 deals
- **💰 bloxtr8-5k-20k**: $5,000 - $20,000 deals
- **💎 bloxtr8-20k-100k**: $20,000 - $100,000 deals
- **👑 bloxtr8-100k+**: $100,000+ premium deals

### Message Structure

Each listing is displayed as a rich embedded message with:

```
🟢 New Global Listing
├── Rich Embed
│   ├── 🎮 Game Name - Game thumbnail
│   ├── 💰 Price: $15,000
│   ├── ✅ Verified Seller (KYC Badge)
│   ├── 🌍 PUBLIC Listing
│   └── 📊 Game stats (players, visits)
│
└── Action Buttons
    ├── 💸 Make Offer
    ├── 📋 View Offers
    ├── 🌐 View on Web
    └── 👁️ Watch Listing
```

### Visibility System

**PUBLIC Listings:**

- Posted as messages in ALL guilds bot is in
- Synced automatically on guild join
- Cross-server marketplace experience

**PRIVATE Listings:**

- Only visible in origin guild
- Perfect for guild-exclusive deals
- Full marketplace features

## Components

### 1. User Verification

- Ensures user exists in database
- Checks KYC tier (must be TIER_1+)
- Verifies Roblox account linked

### 2. Game Ownership Verification

- Validates user owns/admin of game
- Creates verification record
- Stores game metadata

### 3. Message Creation

- Determines price range from listing price
- Posts message in appropriate channel
- Posts rich embed with all details
- Adds interactive buttons

### 4. Cross-Guild Sync

- Background process for PUBLIC listings
- Rate-limited (2s between messages)
- Updates database with message IDs
- Handles errors gracefully

### 5. Guild Setup

- Auto-creates marketplace category
- Creates 4 price-range channels
- Sets proper permissions
- Posts welcome messages
- Syncs existing PUBLIC listings

### 6. Offer Negotiation

- Button-based offer system in DMs
- Accept/Decline/Counter offer flow
- Private negotiations with sellers
- Real-time notifications

## Error Handling

- **User not found** → Create user record
- **Not TIER_1+** → Show setup message
- **Invalid input** → Validation error
- **API failure** → Error message with retry
- **Message creation fails** → Listing still created
- **Rate limit hit** → Automatic backoff

## Rate Limiting

To respect Discord API limits:

- **2 seconds** between message posts
- **1 second** between pagination pages
- **5 seconds** between guild syncs
- **Max 50 messages** per 10 minutes (Discord limit)

## Database Updates

### Listing Model

```prisma
model Listing {
  // ... existing fields
  messageId   String?   @unique
  channelId   String?
  priceRange  String?
  visibility  ListingVisibility @default(PUBLIC)
}
```

### New Models

```prisma
model MarketplaceChannel {
  id             String
  guildId        String
  channelId      String
  priceRange     String
  activeListings Int
}
```

## API Endpoints

### Enhanced Endpoints

- `POST /api/listings` - Now accepts `visibility`, `messageId`, `priceRange`
- `GET /api/listings` - Filters by visibility and cross-guild
- `PATCH /api/listings/:id/message` - Updates message information
- `POST /api/offers` - Create offer on a listing
- `PATCH /api/offers/:id/accept` - Accept an offer
- `PATCH /api/offers/:id/decline` - Decline an offer
- `PATCH /api/offers/:id/counter` - Counter an offer
- `GET /api/offers/listing/:id` - Get all offers for a listing

## Offer Negotiation Flow

```mermaid
flowchart TD
    A[Buyer clicks 'Make Offer'] --> B[Show offer modal]
    B --> C[Enter amount & conditions]
    C --> D[Show confirmation]
    D --> E{Confirm?}

    E -->|NO| F[Cancel]
    E -->|YES| G[Submit to API]

    G --> H[Create offer record]
    H --> I[Notify seller via DM]
    I --> J[Seller sees buttons]

    J --> K{Seller action?}

    K -->|Accept| L[Show confirmation]
    L --> M[Re-verify asset]
    M --> N[Mark as accepted]
    N --> O[Notify buyer]
    O --> P[Begin escrow]

    K -->|Decline| Q[Show confirmation]
    Q --> R[Mark as declined]
    R --> S[Notify buyer]

    K -->|Counter| T[Show counter modal]
    T --> U[Enter counter amount]
    U --> V[Show confirmation]
    V --> W[Create counter offer]
    W --> X[Mark original as countered]
    X --> Y[Notify buyer]
    Y --> Z[Buyer can accept/decline/counter]
```

## Contract Generation & Signing Flow

```mermaid
flowchart TD
    A[Offer Accepted] --> B[API: POST /contracts/generate]
    B --> C[Fetch offer + listing + parties]
    C --> D[Generate contract PDF]
    D --> E[Upload to S3]
    E --> F[Calculate SHA-256 hash]
    F --> G[Create Contract record]
    G --> H[Status: PENDING_SIGNATURE]
    
    H --> I[Send DM to buyer]
    H --> J[Send DM to seller]
    
    I --> K[Buyer sees contract notification]
    J --> L[Seller sees contract notification]
    
    K --> M{Buyer chooses}
    L --> N{Seller chooses}
    
    M -->|Quick Sign| O[Show modal: Type 'I AGREE']
    M -->|Web Sign| P[Generate magic link]
    M -->|Review| Q[Download PDF]
    
    N -->|Quick Sign| O
    N -->|Web Sign| P
    N -->|Review| Q
    
    O --> R[Confirm signature]
    P --> S[Open web app]
    Q --> T[User reviews PDF]
    
    S --> U[Web: Contract signing page]
    U --> V[User confirms signature]
    
    R --> W[POST /contracts/:id/sign]
    V --> W
    
    W --> X{Both signed?}
    
    X -->|NO| Y[Update: Waiting for other party]
    X -->|YES| Z[Status: EXECUTED]
    
    Z --> AA[Notify both parties]
    Z --> AB[Proceed to escrow]
```

### Contract Signing Methods

```mermaid
flowchart TD
    A[Contract Ready] --> B{User Action}
    
    B -->|Quick Sign| C[Click Sign button]
    C --> D[Show confirmation modal]
    D --> E[User types 'I AGREE']
    E --> F[Submit signature]
    F --> G[Method: DISCORD_NATIVE]
    
    B -->|Web Sign| H[Click Web Sign button]
    H --> I[Generate magic link token]
    I --> J[Token expires in 15min]
    J --> K[Open browser]
    K --> L[Load contract preview]
    L --> M[User confirms]
    M --> N[Submit signature]
    N --> O[Method: WEB_BASED]
    
    B -->|Review| P[Click Review button]
    P --> Q[Get presigned PDF URL]
    Q --> R[Download contract]
    R --> S[User reviews locally]
    S --> T[Return to sign]
    
    G --> U[Record signature metadata]
    O --> U
    
    U --> V[Save: userId, timestamp]
    V --> W[Save: IP, user agent]
    W --> X[Save: signature method]
    X --> Y[Check both parties signed]
    
    Y -->|YES| Z[Execute contract]
    Y -->|NO| AA[Wait for counterparty]
```

### Signature Confirmation Flow

```mermaid
flowchart TD
    A[User clicks 'Sign Contract'] --> B{Already signed?}
    
    B -->|YES| C[Show: Already signed]
    B -->|NO| D{Authorized?}
    
    D -->|NO| E[Error: Not authorized]
    D -->|YES| F[Show confirmation modal]
    
    F --> G[Input: 'I AGREE']
    G --> H{Valid input?}
    
    H -->|NO| I[Error: Must type 'I AGREE']
    H -->|YES| J[Submit to API]
    
    J --> K[POST /contracts/:id/sign]
    K --> L[Record signature]
    L --> M{Both parties signed?}
    
    M -->|NO| N[Show: Waiting for other party]
    M -->|YES| O[Show: Contract executed]
    
    O --> P[Update contract status]
    P --> Q[Remove sign buttons]
    Q --> R[Notify both parties]
    R --> S[Begin escrow flow]
```

## Future Enhancements

- [ ] `/listing view` command with message links
- [ ] `/contract list` command full implementation
- [ ] Message activity scoring
- [ ] Rich media from Roblox API
- [x] Offer management via buttons
- [x] Contract generation and signing
- [ ] Analytics dashboard
- [ ] Automated message cleanup
- [ ] Trending listings
