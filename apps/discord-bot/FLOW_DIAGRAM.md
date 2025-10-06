# Discord Bot Listing Commands Flow Diagram

## Listing Creation Flow

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

    H -->|TIER_1+| L[Show Discord modal]
    L --> M[User fills form]
    M --> N[Validate input]
    N --> O{Valid input?}

    O -->|NO| P[Show validation error]
    P --> Q[End process]

    O -->|YES| R[Call POST /listings]
    R --> S{API call successful?}

    S -->|NO| T[Show API error message]
    T --> U[End process]

    S -->|YES| V[Show success embed]
    V --> W[Display listing ID and view link]
    W --> X[End process]
```

## Listing View Flow

```mermaid
flowchart TD
    A[User runs /listing view] --> B[Parse command options]
    B --> C[Build API filters]
    C --> D[Call GET /api/listings]
    D --> E{API call successful?}

    E -->|NO| F[Show error message]
    F --> G[End process]

    E -->|YES| H{Listings found?}
    H -->|NO| I[Show empty state message]
    I --> J[End process]

    H -->|YES| K[Create rich embed]
    K --> L[Add pagination buttons if needed]
    L --> M[Cache pagination state]
    M --> N[Send embed to user]
    N --> O[User clicks pagination button?]

    O -->|NO| P[End process]
    O -->|YES| Q[Handle pagination]
    Q --> R[Update cached state]
    R --> S[Fetch new page]
    S --> T[Update embed]
    T --> U[End process]
```

## Key Components

### Listing Creation
1. **User Verification**: Ensures user exists and is TIER_1+ (can create listings)
2. **Modal Form**: Discord modal for collecting listing details
3. **Input Validation**: Client-side and server-side validation
4. **API Integration**: Calls existing POST /listings endpoint
5. **Success Response**: Rich embed with listing details and link

### Listing View
1. **Filtering**: Support for category and status filters
2. **Pagination**: Button-based navigation with cached state
3. **Rich Embeds**: Formatted display with price, seller, and date info
4. **API Integration**: Calls GET /api/listings with pagination
5. **State Management**: In-memory cache for pagination state (5min TTL)

## Error Handling Points

### Listing Creation
- User not found → Create user record
- User not TIER_1+ → Show account setup message
- Invalid form input → Show validation error
- API failure → Show API error message
- Network error → Show generic error message

### Listing View
- API failure → Show error message with retry suggestion
- Empty results → Show appropriate empty state message
- Pagination timeout → Prompt user to restart command
- Invalid filters → Use default filters and continue
