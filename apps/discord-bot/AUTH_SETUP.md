# Discord Bot Authentication Setup

This Discord bot integrates with Better Auth to provide Discord OAuth authentication through slash commands.

## Environment Variables

Create a `.env` file in the `apps/discord-bot/` directory with the following variables:

```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_id_here
DISCORD_GUILD_ID=your_target_guild_id_here

# API Configuration
API_BASE_URL=http://localhost:3000

# Database (if needed for additional features)
DATABASE_URL=your_database_url_here
```

## Available Commands

- `/signin` - Initiates Discord OAuth flow
- `/auth-status` - Check current authentication status
- `/logout` - Sign out of the current session
- `/hello` - Basic greeting command
- `/ping` - Check bot latency

## How Discord OAuth Works

1. User runs `/signin` command
2. Bot generates OAuth URL using Better Auth client
3. User clicks link and authorizes on Discord
4. Discord redirects to your API callback (`/api/auth/callback/discord`)
5. Better Auth handles the OAuth flow and creates user session
6. User can check status with `/auth-status`

## Setup Steps

1. **Discord Application Setup:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to OAuth2 settings and add redirect URI: `http://localhost:3000/api/auth/callback/discord`
   - Copy Client ID and Client Secret

2. **Bot Setup:**
   - In Discord Developer Portal, go to Bot section
   - Create a bot and copy the token
   - Enable required intents (Guilds, Guild Messages, Message Content, Direct Messages)

3. **Environment Configuration:**
   - Set up your `.env` file with the required variables
   - Make sure your API server is running on the specified `API_BASE_URL`

4. **Run the Bot:**
   ```bash
   cd apps/discord-bot
   npm run dev
   ```

## Important Notes

- The bot uses Better Auth client to communicate with your API server
- Make sure your API server has Better Auth properly configured with Discord OAuth
- The authentication flow requires the user to click a link and complete OAuth in their browser
- Session management is handled by Better Auth on the server side

## Troubleshooting

- **"Failed to initiate login"**: Check that your API server is running and accessible
- **"Failed to generate login URL"**: Verify your Better Auth configuration in the API
- **Commands not appearing**: Make sure `DISCORD_GUILD_ID` is set correctly and the bot has permissions
