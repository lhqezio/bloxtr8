# Listing Creation Flow Diagram

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

## Key Components

1. **User Verification**: Ensures user exists and is TIER_1+ (can create listings)
2. **Modal Form**: Discord modal for collecting listing details
3. **Input Validation**: Client-side and server-side validation
4. **API Integration**: Calls existing POST /listings endpoint
5. **Success Response**: Rich embed with listing details and link

## Error Handling Points

- User not found → Create user record
- User not TIER_1+ → Show account setup message
- Invalid form input → Show validation error
- API failure → Show API error message
- Network error → Show generic error message
