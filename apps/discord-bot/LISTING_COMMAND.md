# Discord Bot - Listing Creation Command

## Overview

The Discord bot now supports creating listings through a verified user-only command `/listing create`. This implementation follows the requirements specified in the issue:

- ✅ Command usable by verified users only
- ✅ Parse title and price from Discord modal
- ✅ Call POST /listings API endpoint
- ✅ Reply with listing ID and link

## Implementation Details

### User Verification

The bot implements a comprehensive user verification system:

1. **User Registration**: Automatically creates users in the database when they first interact with the bot
2. **KYC Verification Check**: Verifies that users have completed KYC verification before allowing listing creation
3. **Error Handling**: Provides clear error messages for unverified users with next steps

### Command Structure

```
/listing create
```

This slash command:
1. Checks if the user exists in the database (creates if not)
2. Verifies the user has completed KYC verification
3. Shows a Discord modal for listing creation if verified
4. Handles modal submission and API calls
5. Returns success with listing ID and link

### Modal Form

The Discord modal includes the following fields:
- **Title**: Listing title (max 255 characters)
- **Description**: Detailed description (max 1000 characters)  
- **Price**: Price in cents (e.g., 1000 for $10.00)
- **Category**: Category classification (max 100 characters)

### API Integration

The bot integrates with the existing API:
- **Endpoint**: `POST /api/listings`
- **Validation**: Uses Zod schema validation
- **Error Handling**: Displays API validation errors to users
- **Response**: Returns listing ID and view link

### Error Handling

Comprehensive error handling for:
- User not found/not registered
- KYC verification not completed
- Invalid form input (price validation)
- API failures and validation errors
- Network errors

### Success Response

On successful listing creation, users receive:
- ✅ Success confirmation embed
- 📋 Listing ID
- 🔗 Direct link to view the listing
- 📊 Listing details (title, price, category)
- 👤 Creator attribution

## Files Created/Modified

### New Files
- `src/utils/userVerification.ts` - User verification and database operations
- `src/utils/apiClient.ts` - HTTP client for API communication

### Modified Files
- `src/index.ts` - Main bot file with command and modal handling
- `package.json` - Added node-fetch dependency

## Usage Example

1. User runs `/listing create`
2. Bot checks user verification status
3. If verified, shows modal form
4. User fills out listing details
5. Bot calls API to create listing
6. Bot responds with success message including listing ID and link

## Technical Requirements Met

- ✅ **Verified Users Only**: KYC verification check implemented
- ✅ **Title and Price Parsing**: Modal form extracts and validates input
- ✅ **POST /listings Call**: API integration with proper error handling
- ✅ **Listing ID and Link**: Success response includes both

## Development Notes

- Uses Discord.js v14 with modern interaction handling
- Implements proper TypeScript types
- Follows existing codebase patterns and error handling
- Includes comprehensive logging for debugging
- Uses Prisma for database operations
- Implements proper validation with Zod schemas
