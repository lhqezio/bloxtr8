# Bloxtr8 Discord Bot

Discord bot for the Bloxtr8 marketplace with thread-based listing management.

## Features

### 🎮 Thread-Based Marketplace
- **Dedicated threads** for each listing with rich embeds
- **Smart organization** by price range ($1k-5k, $5k-25k, $25k-100k, $100k+)
- **Cross-guild visibility** for PUBLIC listings
- **Auto-setup** on guild join

### 💰 Price-Range Channels

The bot automatically creates and manages 4 marketplace channels:

- **📈 marketplace-1k-5k**: $1,000 - $5,000 deals
- **💰 marketplace-5k-25k**: $5,000 - $25,000 deals  
- **💎 marketplace-25k-100k**: $25,000 - $100,000 deals
- **👑 marketplace-100k+**: $100,000+ premium deals

### ✅ Listing Features

Each listing thread includes:
- 🎮 Game thumbnail and details
- 💰 Price and category
- ✅ Seller verification badge (KYC tier)
- 🌍 Visibility indicator (PUBLIC/PRIVATE)
- 📊 Roblox game stats (players, visits)
- 💸 Interactive buttons (Make Offer, View Details, Watch)

## Commands

### `/listing create`
Create a new verified game ownership listing.

**Requirements:**
- Account created (`/signup`)
- Roblox account linked (`/link`)
- KYC tier TIER_1+ (Roblox linked)

**Flow:**
1. Verify game ownership
2. Fill listing details (title, price, category)
3. Thread automatically created in price-range channel
4. If PUBLIC: Synced to all guilds bot is in

### `/listing view` (Coming Soon)
Browse listings with filters and thread links.

### `/signup`
Create a Bloxtr8 account.

### `/link`
Link your Roblox account for verification.

### `/verify`
Check account verification status.

### `/help`
Show available commands and information.

## Guild Setup

When the bot joins a server:

1. **Creates Marketplace Category**
   - Category: `🏪 MARKETPLACE`

2. **Creates Price-Range Channels**
   - 4 channels based on price ranges
   - Proper permissions set
   - Welcome messages posted

3. **Syncs Existing Listings** (Background)
   - Fetches all PUBLIC listings
   - Creates threads for each
   - Rate-limited (2s between threads)
   - Updates database with thread IDs

## Architecture

### Thread Creation Flow

```
User creates listing → 
  API stores in DB → 
  Bot determines price range → 
  Creates thread in correct channel → 
  Posts rich embed + buttons → 
  Updates DB with thread ID → 
  If PUBLIC: Syncs to all guilds
```

### Cross-Guild Sync

PUBLIC listings automatically appear in all servers:

1. Listing created in Server A
2. Thread created in Server A
3. Background job fetches all guilds
4. Creates threads in Server B, C, D, etc.
5. All threads link back to listing

### Rate Limiting

To respect Discord API limits:
- **2 seconds** between thread creations
- **1 second** between page fetches
- **5 seconds** between guild syncs
- Max 50 threads per 10 minutes (Discord limit)

## Development

### Prerequisites

- Node.js 18+
- pnpm
- Discord bot token
- API server running

### Environment Variables

Create `.env.development.local`:

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_test_guild_id
API_BASE_URL=http://localhost:3000
```

### Installation

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run development
pnpm dev

# Run production
pnpm start
```

### Bot Permissions

Required Discord permissions:
- `MANAGE_CHANNELS` - Create marketplace channels
- `MANAGE_THREADS` - Create and manage threads
- `SEND_MESSAGES` - Post in channels/threads
- `EMBED_LINKS` - Rich embeds
- `ATTACH_FILES` - Images
- `USE_EXTERNAL_EMOJIS` - Custom emojis
- `READ_MESSAGE_HISTORY` - Thread management

### Invite Link

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=397552&scope=bot%20applications.commands
```

## Project Structure

```
apps/discord-bot/
├── src/
│   ├── commands/
│   │   ├── listing-enhanced.ts  # Listing creation with verification
│   │   ├── help.ts              # Help command
│   │   ├── signup.ts            # Account creation
│   │   ├── linkRoblox.ts        # Roblox linking
│   │   └── verify.ts            # Verification check
│   ├── utils/
│   │   ├── marketplace.ts       # Channel management
│   │   ├── threadManager.ts     # Thread lifecycle
│   │   ├── listingSync.ts       # Cross-guild sync
│   │   ├── apiClient.ts         # API integration
│   │   └── userVerification.ts  # User/KYC checks
│   └── index.ts                 # Main bot file
├── FLOW_DIAGRAM.md             # Flow diagrams
└── README.md                   # This file
```

## Key Utilities

### `marketplace.ts`
- `setupMarketplaceChannels()` - Create channels on guild join
- `getPriceRangeChannel()` - Get channel for price
- `cleanupMarketplaceChannels()` - Cleanup on guild leave
- `PRICE_RANGES` - Price range configuration

### `threadManager.ts`
- `createListingThread()` - Create thread with embed
- `updateListingThread()` - Update existing thread
- `archiveListingThread()` - Archive thread
- `generateThreadName()` - Create thread name
- `createListingEmbed()` - Rich embed builder

### `listingSync.ts`
- `syncPublicListingsToGuild()` - Sync all listings to one guild
- `syncPublicListingsToAllGuilds()` - Sync across all guilds
- `syncListingToAllGuilds()` - Sync one listing to all

### `apiClient.ts`
- `createListing()` - Create listing via API
- `fetchListings()` - Get listings with filters
- `updateListingThread()` - Update thread data

## Testing

```bash
# Run tests
pnpm test

# Run linter
pnpm lint

# Type check
pnpm build
```

## Deployment

### Production Build

```bash
pnpm build
NODE_ENV=production pnpm start
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
CMD ["pnpm", "start"]
```

## Troubleshooting

### Bot not creating threads
- Check bot has `MANAGE_THREADS` permission
- Verify channels exist in guild
- Check rate limits in logs

### Cross-guild sync not working
- Ensure listings are set to `PUBLIC`
- Check API_BASE_URL is correct
- Verify bot is in multiple guilds

### Thread creation fails
- Check Discord API rate limits
- Verify channel still exists
- Check bot permissions in channel

## Documentation

- [Flow Diagrams](FLOW_DIAGRAM.md) - Visual flow charts
- [API Reference](../../documentation/api/README.md) - API docs
- [System Architecture](../../documentation/architecture/system-overview.md)

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md)

## License

ISC

