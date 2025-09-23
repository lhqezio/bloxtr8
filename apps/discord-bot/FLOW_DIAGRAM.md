# Listing Creation Flow Diagram

```
User runs /listing create
         ↓
Bot checks user exists in DB
         ↓
    User exists?
         ↓ NO                    ↓ YES
Create user record         Check KYC verification
         ↓                        ↓
    User created              KYC verified?
         ↓                        ↓ NO                    ↓ YES
Check KYC verification      Show error message      Show Discord modal
         ↓                        ↓                        ↓
    KYC verified?            User must complete      User fills form
         ↓ NO                    KYC first              ↓
Show error message              ↓                    Validate input
         ↓                   End process              ↓
    End process                                    Valid input?
                                                     ↓ NO
                                              Show validation error
                                                     ↓
                                                End process
                                                     ↓ YES
                                              Call POST /listings
                                                     ↓
                                              API call successful?
                                                     ↓ NO                    ↓ YES
                                        Show API error message      Show success embed
                                                     ↓                        ↓
                                              End process              Display listing ID
                                                                      and view link
                                                                           ↓
                                                                      End process
```

## Key Components

1. **User Verification**: Ensures user exists and is KYC verified
2. **Modal Form**: Discord modal for collecting listing details
3. **Input Validation**: Client-side and server-side validation
4. **API Integration**: Calls existing POST /listings endpoint
5. **Success Response**: Rich embed with listing details and link

## Error Handling Points

- User not found → Create user record
- User not KYC verified → Show verification required message
- Invalid form input → Show validation error
- API failure → Show API error message
- Network error → Show generic error message
