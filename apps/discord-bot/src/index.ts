/**
 * Discord Bot with Better Auth Integration
 * 
 * This bot provides Discord OAuth authentication using Better Auth.
 * 
 * Available Commands:
 * - /signin: Initiates Discord OAuth flow
 * - /auth-status: Check current authentication status
 * - /logout: Sign out of the current session
 * - /hello: Basic greeting command
 * - /ping: Check bot latency
 * 
 * Environment Variables Required:
 * - DISCORD_BOT_TOKEN: Your Discord bot token
 * - DISCORD_CLIENT_ID: Your Discord application ID
 * - DISCORD_GUILD_ID: Target guild for command registration
 * - API_BASE_URL: Base URL of your API server (defaults to http://localhost:3000)
 * 
 * How Discord OAuth Works:
 * 1. User runs /signin command
 * 2. Bot generates OAuth URL using Better Auth client
 * 3. User clicks link and authorizes on Discord
 * 4. Discord redirects to your API callback
 * 5. Better Auth handles the OAuth flow and creates user session
 * 6. User can check status with /auth-status
 */

import { config } from '@dotenvx/dotenvx';
import { createAuthClient } from "better-auth/client"
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';

// Load environment variables
config();

type AuthClient = ReturnType<typeof createAuthClient>;

export const authClient: AuthClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: process.env.API_BASE_URL || "http://localhost:3000"
})

const signIn = async (interaction: any) => {
    try {
        // Generate OAuth URL for Discord login
        const { data, error } = await authClient.signIn.social({
            provider: "discord",
            callbackURL: `${process.env.API_BASE_URL || "http://localhost:3000"}/api/auth/callback/discord`
        });

        if (error) {
            console.error('Auth error:', error);
            await interaction.reply({
                content: '❌ Failed to initiate login. Please try again later.',
                ephemeral: true
            });
            return;
        }

        if (data?.url) {
            const embed = new EmbedBuilder()
                .setTitle('🔐 Discord Authentication')
                .setDescription('Click the button below to authenticate with Discord and link your account!')
                .setColor(0x5865F2) // Discord blurple
                .addFields(
                    { name: 'Step 1', value: 'Click the link below', inline: false },
                    { name: 'Step 2', value: 'Authorize the application', inline: false },
                    { name: 'Step 3', value: 'You\'ll be redirected back automatically', inline: false }
                )
                .setFooter({ text: 'This link will expire in 10 minutes' })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                content: `**Authentication Link:**\n${data.url}`,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: '❌ Failed to generate login URL. Please try again later.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Sign in error:', error);
        await interaction.reply({
            content: '❌ An unexpected error occurred. Please try again later.',
            ephemeral: true
        });
    }
}

const checkAuthStatus = async (interaction: any) => {
    try {
        // Note: In a real implementation, you'd need to store and retrieve session tokens
        // This is a simplified version that checks if the user has a valid session
        const { data: session, error } = await authClient.getSession();
        
        if (error) {
            console.error('Session error:', error);
            await interaction.reply({
                content: '❌ Failed to check authentication status. Please try again later.',
                ephemeral: true
            });
            return;
        }
        
        if (session && 'user' in session && session.user) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Authentication Status')
                .setDescription('You are successfully authenticated!')
                .setColor(0x00FF00) // Green
                .addFields(
                    { name: 'Name', value: session.user.name || 'N/A', inline: true },
                    { name: 'Email', value: session.user.email || 'N/A', inline: true },
                    { name: 'User ID', value: session.user.id || 'N/A', inline: true }
                )
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        } else {
            const embed = new EmbedBuilder()
                .setTitle('❌ Not Authenticated')
                .setDescription('You are not currently logged in.')
                .setColor(0xFF0000) // Red
                .addFields(
                    { name: 'How to authenticate', value: 'Use `/signin` to authenticate with Discord', inline: false }
                )
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Auth status check error:', error);
        await interaction.reply({
            content: '❌ Failed to check authentication status. Please try again later.',
            ephemeral: true
        });
    }
}

const logout = async (interaction: any) => {
    try {
        const { error } = await authClient.signOut();
        
        if (error) {
            console.error('Logout error:', error);
            await interaction.reply({
                content: '❌ Failed to sign out. Please try again later.',
                ephemeral: true
            });
            return;
        }

        await interaction.reply({
            content: '✅ **Successfully signed out**\n\nYou have been logged out of your account.',
            ephemeral: true
        });
    } catch (error) {
        console.error('Logout error:', error);
        await interaction.reply({
            content: '❌ An unexpected error occurred during logout. Please try again later.',
            ephemeral: true
        });
    }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  // Register guild slash commands on startup
  const commands = [
    new SlashCommandBuilder()
      .setName('hello')
      .setDescription('Say hello in the channel')
      .addStringOption(opt =>
        opt.setName('name').setDescription('Name to greet').setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Check bot latency')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('signin')
      .setDescription('Sign in with Discord OAuth')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('auth-status')
      .setDescription('Check your authentication status')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('logout')
      .setDescription('Sign out of your account')
      .toJSON(),
  ];

  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID; // Application (bot) ID
  const guildId = process.env.DISCORD_GUILD_ID; // Target guild to register commands

  if (!token || !clientId || !guildId) {
    console.warn(
      'Missing DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID. Skipping command registration.'
    );
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);
  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log('Slash commands registered for guild', guildId);
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

client.on('messageCreate', async message => {
  if (!message.author.bot) {
    message.author.send(`You said: ${message.content}`);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'hello') {
    const provided = interaction.options.getString('name');
    const targetName =
      provided || interaction.user.displayName || interaction.user.username;
    await interaction.reply({ content: `Hello there ${targetName}!` });
  }

  if (interaction.commandName === 'ping') {
    const startTime = Date.now();
    await interaction.reply({ content: 'Pinging...' });
    const latency = Date.now() - startTime;
    const apiLatency = Math.round(client.ws.ping);

    await interaction.editReply({
      content: ` Pong! Latency: ${latency}ms | API Latency: ${apiLatency}ms`,
    });
  }

  if (interaction.commandName === 'signin') {
    await signIn(interaction);
  }

  if (interaction.commandName === 'auth-status') {
    await checkAuthStatus(interaction);
  }

  if (interaction.commandName === 'logout') {
    await logout(interaction);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
