# Bloxtr8 Discord Bot

Discord.js bot handling slash commands, interactions, and Discord-specific features for the Bloxtr8 escrow platform.

## Features

- **Slash Commands**: `/listing create` for creating Roblox asset listings
- **Modal Forms**: Rich Discord modals for data collection
- **User Verification**: KYC verification and user management
- **API Integration**: Seamless communication with the Bloxtr8 API
- **Error Handling**: Comprehensive error handling with user-friendly messages

## Quick Start

```bash
# Install dependencies
pnpm install

# Run in development
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## Documentation

- **[Bot Architecture](./docs/architecture.md)** - Complete bot design, commands, and interaction patterns

## Discord Commands

### Listing Management

- `/listing create` - Create a new Roblox asset listing
  - Opens a modal form for title, summary, price, and category
  - Validates user KYC status before allowing creation
  - Integrates with Roblox API for asset verification

## User Flow

### Listing Creation Flow

```mermaid
flowchart TD
    A[User runs /listing create] --> B[Bot checks user exists in DB]
    B --> C{User exists?}
    C -->|NO| D[Create user record]
    D --> E[User created]
    E --> F[Check KYC verification]
    C -->|YES| G[Check KYC verification]
    F --> H{KYC verified?}
    G --> H
    H -->|NO| I[Show error message]
    I --> J[User must complete KYC first]
    J --> K[End process]
    H -->|YES| L[Show Discord modal]
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

## Technology Stack

- **Discord Integration**: Discord.js v14.14.1
- **Runtime**: Node.js with TypeScript
- **Validation**: Zod schema validation
- **Development**: tsx for hot reloading
- **Testing**: Jest

## Environment Variables

```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN="your_discord_bot_token"
DISCORD_CLIENT_ID="your_discord_client_id"
DISCORD_GUILD_ID="your_discord_guild_id"

# API Configuration
API_BASE_URL="http://localhost:3000"
API_KEY="your_api_key"

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/bloxtr8"
```

## Development

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Discord Bot Token
- Access to Bloxtr8 API

### Local Development

```bash
# Install dependencies
pnpm install

# Start development server with hot reload
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

### Testing

The bot includes comprehensive tests for:

- User verification logic
- API client functionality
- Error handling scenarios
- Command processing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test -- --coverage

# Run specific test file
pnpm test -- userVerification.test.ts
```

## Architecture

### File Structure

```
src/
├── index.ts                 # Main bot entry point
├── utils/
│   ├── apiClient.ts         # API communication utilities
│   └── userVerification.ts  # User verification logic
└── commands/               # Slash command handlers (future)
```

### Key Utilities

- **`apiClient.ts`**: Handles all API communication with the Bloxtr8 backend
- **`userVerification.ts`**: Manages user verification and KYC status checks

## Integration Points

### API Endpoints

- `POST /listings` - Create new listings
- `GET /users/:id` - Get user information
- `POST /users` - Create new users

### Discord Features

- Slash commands with modal forms
- Rich embeds for responses
- Button interactions (future)
- Thread management (future)

## Security

- **User Verification**: All commands require verified users
- **KYC Requirements**: Listing creation requires KYC verification
- **API Authentication**: Secure API communication
- **Input Validation**: Comprehensive input sanitization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run `pnpm lint` and `pnpm test`
6. Submit a pull request

## License

ISC License - see LICENSE file for details
