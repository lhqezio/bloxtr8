import { config } from '@dotenvx/dotenvx';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

import { createListing, getApiBaseUrl } from './utils/apiClient.js';
import {
  checkProviderAccount,
  ensureUserExists,
  verify,
  verifyUserForListing,
} from './utils/userVerification.js';
import type { Account } from './utils/userVerification.ts';

// Load environment variables
config();

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
      .setName('listing')
      .setDescription('Create a new listing')
      .addSubcommand(subcommand =>
        subcommand
          .setName('create')
          .setDescription('Create a new listing for sale')
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Verify a Discord profile')
      .addStringOption(opt =>
        opt
          .setName('id')
          .setDescription('Any linked account ID (defaults to your Discord ID)')
          .setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('signup')
      .setDescription('Sign up for a Bloxtr8 account')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('linkrblx')
      .setDescription('Link your Roblox account to Bloxtr8')
      .toJSON(),
    // new SlashCommandBuilder()
    //   .setName('signin')
    //   .setDescription('Get a sign-in link for your Bloxtr8 account')
    //   .toJSON(),
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
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'hello') {
      const provided = interaction.options.getString('name');
      const targetName =
        provided || interaction.user.displayName || interaction.user.username;
      
      const helloEmbed = new EmbedBuilder()
        .setColor(0x00d4aa) // Bloxtr8 brand color
        .setTitle('👋 Hello there!')
        .setDescription(`**Welcome to Bloxtr8, ${targetName}!**\n\n` +
          'I\'m here to help you with secure Roblox trading. ' +
          'Use `/signup` to get started or `/verify` to check your account status.')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🚀 Quick Commands',
          value: '• `/signup` - Create your Bloxtr8 account\n' +
                 '• `/verify` - Check your account status\n' +
                 '• `/linkrblx` - Connect your Roblox account\n' +
                 '• `/listing create` - Create a new listing',
        })
        .setFooter({
          text: 'Ready to start trading? Let\'s go! 🎯',
          iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [helloEmbed],
        ephemeral: true,
      });
    }
    if (interaction.commandName === 'verify') {
      const id = interaction.options.getString('id') || interaction.user.id;
      const result = await verify(id);
      if (result.success) {
        const { embeds } = buildVerificationEmbeds(result.data);
        await interaction.reply({
          embeds,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `❌ Verification failed: ${result.error.message}`,
          ephemeral: true,
        });
      }
    }

    if (interaction.commandName === 'ping') {
      const startTime = Date.now();
      await interaction.reply({ content: '🏓 Pinging...' });
      const latency = Date.now() - startTime;
      const apiLatency = Math.round(client.ws.ping);

      const pingEmbed = new EmbedBuilder()
        .setColor(0x00d4aa) // Bloxtr8 brand color
        .setTitle('🏓 Pong!')
        .setDescription('**Bloxtr8 Bot is online and responsive**')
        .addFields(
          {
            name: '⚡ Response Time',
            value: `**Bot Latency:** ${latency}ms\n**API Latency:** ${apiLatency}ms`,
            inline: true,
          },
          {
            name: '📊 Status',
            value: `**Uptime:** ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n**Memory:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
            inline: true,
          }
        )
        .setFooter({
          text: 'Bloxtr8 Bot • Always here to help! 🚀',
          iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
        })
        .setTimestamp();

      await interaction.editReply({
        content: '',
        embeds: [pingEmbed],
      });
    }
    // if (interaction.commandName === 'signin') {
    //   await signIn(interaction);
    // }
    if (
      interaction.commandName === 'listing' &&
      interaction.options.getSubcommand() === 'create'
    ) {
      await handleListingCreate(interaction);
    }
    if (interaction.commandName === 'signup') {
      await handleSignup(interaction);
    }
    if (interaction.commandName === 'linkrblx') {
      await handleLinkRoblox(interaction);
    }
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'listing_create_modal') {
      await handleListingModalSubmit(interaction);
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    if (interaction.customId === 'consent_accept') {
      await handleConsentAccept(interaction);
    }
    if (interaction.customId === 'consent_decline') {
      await handleConsentDecline(interaction);
    }
  }
});

/**
 * Handles the /listing create slash command
 * Shows verification check and opens modal if user is verified
 */
async function handleListingCreate(interaction: ChatInputCommandInteraction) {
  try {
    // Ensure user exists in database
    const userResult = await ensureUserExists(
      interaction.user.id,
      interaction.user.username
    );

    if (!userResult.user) {
      await interaction.reply({
        content: `❌ ${userResult.error}`,
        ephemeral: true,
      });
      return;
    }

    // Check if user is verified
    const verificationResult = await verifyUserForListing(interaction.user.id);

    if (!verificationResult.isVerified) {
      const embed = new EmbedBuilder()
        .setColor(0xf59e0b) // Amber color for warning
        .setTitle('🔒 Verification Required')
        .setDescription(
          '**KYC verification needed to create listings**\n\n' +
          'To ensure the safety of all traders, we require identity verification before you can create listings.'
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '📋 What is KYC?',
            value: '**Know Your Customer** verification helps us:\n' +
                   '• Verify your identity and age\n' +
                   '• Prevent fraud and scams\n' +
                   '• Build trust in the community\n' +
                   '• Comply with financial regulations',
            inline: true,
          },
          {
            name: '🚀 How to Get Verified',
            value: '**Step 1:** Visit our web app\n' +
                   '**Step 2:** Go to your account settings\n' +
                   '**Step 3:** Complete the verification form\n' +
                   '**Step 4:** Upload required documents\n\n' +
                   '**Processing time:** 1-3 business days',
            inline: true,
          },
          {
            name: '💡 Need Help?',
            value: '• Join our support Discord server\n' +
                   '• Check our verification guide\n' +
                   '• Contact our support team\n' +
                   '• All verification is 100% secure',
            inline: false,
          }
        )
        .setFooter({
          text: 'Verification protects you and other traders! 🛡️',
          iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
      return;
    }

    // User is verified, show the listing creation modal
    const modal = new ModalBuilder()
      .setCustomId('listing_create_modal')
      .setTitle('Create New Listing');

    // Title input
    const titleInput = new TextInputBuilder()
      .setCustomId('listing_title')
      .setLabel('Listing Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter a descriptive title for your listing')
      .setRequired(true)
      .setMaxLength(255);

    // Summary input
    const summaryInput = new TextInputBuilder()
      .setCustomId('listing_summary')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Describe what you are selling in detail')
      .setRequired(true)
      .setMaxLength(1000);

    // Price input
    const priceInput = new TextInputBuilder()
      .setCustomId('listing_price')
      .setLabel('Price (in cents)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter price in cents (e.g., 1000 for $10.00)')
      .setRequired(true);

    // Category input
    const categoryInput = new TextInputBuilder()
      .setCustomId('listing_category')
      .setLabel('Category')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Game Pass, Developer Products, Virtual Items')
      .setRequired(true)
      .setMaxLength(100);

    // Add inputs to action rows
    const titleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      titleInput
    );
    const summaryRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      summaryInput
    );
    const priceRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      priceInput
    );
    const categoryRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      categoryInput
    );

    modal.addComponents(titleRow, summaryRow, priceRow, categoryRow);

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error handling listing create:', error);
    await interaction.reply({
      content:
        '❌ An error occurred while processing your request. Please try again later.',
      ephemeral: true,
    });
  }
}
interface ProviderConfig {
  id: 'roblox' | 'discord' | 'credential';
  label: string;
  // eslint-disable-next-line no-unused-vars
  buildUrl: (accountId: string) => string;
}

/**
 * Gets the base URL for the web app based on environment
 */
function getWebAppBaseUrl(): string {
  // Use environment variable if set, otherwise determine based on NODE_ENV
  if (process.env.WEB_APP_BASE_URL) {
    return process.env.WEB_APP_BASE_URL;
  }

  // Default to localhost for development, production domain for production
  return process.env.NODE_ENV === 'production'
    ? 'https://web.bloxtr8.com'
    : 'http://localhost:5173';
}

// define all providers here
const providers: ProviderConfig[] = [
  {
    id: 'roblox',
    label: 'Roblox',
    buildUrl: id => `https://www.roblox.com/users/${id}/profile`,
  },
  {
    id: 'discord',
    label: 'Discord',
    buildUrl: id => `https://discord.com/users/${id}`,
  },
  {
    id: 'credential',
    label: 'Bloxtr8',
    buildUrl: id => `${getWebAppBaseUrl()}/user/${id}`,
  },
];
function buildVerificationEmbeds(accounts: Account[]) {
  const embeds: EmbedBuilder[] = [];

  for (const provider of providers) {
    const account = accounts.find(a => a.providerId === provider.id);

    const embed = new EmbedBuilder()
      .setTitle(`${provider.label} Account Status`)
      .setColor(account ? 0x10b981 : 0xef4444) // Green for verified, red for not linked
      .setThumbnail(
        provider.id === 'roblox' 
          ? 'https://cdn.discordapp.com/attachments/1234567890/1234567890/roblox-icon.png'
          : provider.id === 'discord'
          ? 'https://cdn.discordapp.com/attachments/1234567890/1234567890/discord-icon.png'
          : 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png'
      )
      .addFields({
        name: account
          ? `✅ ${provider.label} Connected`
          : `❌ ${provider.label} Not Linked`,
        value: account
          ? `**Account ID:** \`${account.accountId}\`\n` +
            `**Status:** Connected\n` +
            `[🔗 View Profile](${provider.buildUrl(account.accountId)})`
          : `**Status:** Not connected\n` +
            `**Action:** Use the appropriate command to link your ${provider.label} account`,
      })
      .setFooter({
        text: account ? 'Verified and secure' : 'Link to unlock features',
        iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
      })
      .setTimestamp();

    embeds.push(embed);
  }

  return { embeds };
}

/**
 * Handles the modal submission for listing creation
 * Validates input and calls API to create listing
 */
async function handleListingModalSubmit(interaction: ModalSubmitInteraction) {
  try {
    // Extract form data
    const title = interaction.fields.getTextInputValue('listing_title');
    const summary = interaction.fields.getTextInputValue('listing_summary');
    const priceText = interaction.fields.getTextInputValue('listing_price');
    const category = interaction.fields.getTextInputValue('listing_category');

    // Validate price
    const price = parseInt(priceText, 10);
    if (isNaN(price) || price <= 0) {
      await interaction.reply({
        content: '❌ Invalid price. Please enter a positive number in cents.',
        ephemeral: true,
      });
      return;
    }

    // Get user info
    const userResult = await ensureUserExists(
      interaction.user.id,
      interaction.user.username
    );

    if (!userResult.user) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xef4444) // Red color for error
        .setTitle('❌ Account Error')
        .setDescription(
          '**Unable to access your account**\n\n' +
          'There was an issue with your account. Please try again or contact support.'
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🔧 Troubleshooting',
          value: '• Try using `/signup` to create a new account\n' +
                 '• Check your internet connection\n' +
                 '• Contact our support team if the issue persists\n' +
                 '• Join our Discord server for help',
        })
        .setFooter({
          text: 'We\'re here to help! 🛠️',
          iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      });
      return;
    }

    // Show loading message
    const loadingEmbed = new EmbedBuilder()
      .setColor(0x00d4aa) // Bloxtr8 brand color
      .setTitle('⏳ Creating Your Listing...')
      .setDescription('**Please wait while we process your listing**\n\n' +
        'This usually takes just a few seconds.')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields({
        name: '🔄 Processing',
        value: '• Validating your information\n' +
               '• Creating your listing\n' +
               '• Making it visible to traders\n' +
               '• Setting up security features',
      })
      .setFooter({
        text: 'Almost ready... 🚀',
        iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [loadingEmbed],
      ephemeral: true,
    });

    // Create listing via API
    const apiResult = await createListing({
      title,
      summary,
      price,
      category,
      sellerId: userResult.user.id,
      guildId: interaction.guildId || undefined,
    });

    if (!apiResult.success) {
      const errorMessage = apiResult.error.errors
        ? apiResult.error.errors.map(e => `${e.field}: ${e.message}`).join('\n')
        : apiResult.error.message;

      await interaction.editReply({
        content: `❌ Failed to create listing:\n${errorMessage}`,
      });
      return;
    }

    // Success - show listing created message with ID and link
    const embed = new EmbedBuilder()
      .setColor(0x00d4aa) // Bloxtr8 brand color
      .setTitle('🎉 Listing Created Successfully!')
      .setDescription(
        '**Your listing is now live and visible to all traders!**\n\n' +
        'Get ready to receive offers from interested buyers.'
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '📋 Listing Details',
          value: `**Title:** ${title}\n` +
                 `**Category:** ${category}\n` +
                 `**Price:** $${(price / 100).toFixed(2)}`,
          inline: true,
        },
        {
          name: '🆔 Listing Info',
          value: `**ID:** \`${apiResult.data.id}\`\n` +
                 `**Status:** 🟢 Active\n` +
                 `**Created:** Just now`,
          inline: true,
        },
        {
          name: '🚀 What\'s Next?',
          value: '• **Share your listing** with potential buyers\n' +
                 '• **Monitor offers** and respond quickly\n' +
                 '• **Use escrow** for secure transactions\n' +
                 '• **Update your listing** if needed',
          inline: false,
        },
        {
          name: '🔗 Quick Actions',
          value: `[📱 **View Listing**](${getApiBaseUrl()}/api/listings/${apiResult.data.id})\n` +
                 `[🌐 **Web Dashboard**](${getWebAppBaseUrl()}/listings)\n` +
                 `[📊 **My Listings**](${getWebAppBaseUrl()}/user/listings)`,
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Created by ${interaction.user.username} • Good luck with your sale! 🍀`,
        iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
      });

    await interaction.editReply({
      content: '',
      embeds: [embed],
    });
  } catch (error) {
    console.error('Error handling modal submission:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred while creating your listing. Please try again later.',
    });
  }
}

/**
 * Handles the /signup command
 * Shows consent form with accept/decline buttons
 */
async function handleSignup(interaction: ChatInputCommandInteraction) {
  try {
    // Check if user already exists
    const existingUser = await verify(interaction.user.id);

    if (existingUser.success && existingUser.data.length > 0) {
      const embed = new EmbedBuilder()
        .setColor(0xf59e0b) // Amber color for existing account
        .setTitle('👋 Welcome Back!')
        .setDescription(
          '**You already have a Bloxtr8 account!**\n\n' +
          'Your Discord profile is already connected to Bloxtr8. ' +
          'Ready to continue your trading journey?'
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🚀 Quick Actions',
          value: '• **Check Status**: Use `/verify` to see your account details\n' +
                 '• **Link Roblox**: Use `/linkrblx` to connect your Roblox account\n' +
                 '• **Create Listing**: Use `/listing create` to start selling\n' +
                 '• **Get Help**: Join our support server for assistance',
        })
        .setFooter({
          text: 'Welcome back to Bloxtr8! 🎉',
          iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
      return;
    }

    // Show consent form
    const consentEmbed = new EmbedBuilder()
      .setColor(0x00d4aa) // Bloxtr8 brand color
      .setTitle('🚀 Welcome to Bloxtr8!')
      .setDescription(
        '**The secure marketplace for Roblox trading**\n\n' +
        'Join thousands of users who trust Bloxtr8 for safe, verified transactions. ' +
        'Please review our terms before creating your account.'
      )
      .setThumbnail('https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png') // Add your logo URL
      .addFields(
        {
          name: '📋 What is Bloxtr8?',
          value: '• **Secure Escrow**: Your funds are protected until delivery\n' +
                 '• **Verified Users**: KYC-verified traders only\n' +
                 '• **Multi-Provider**: Link Discord, Roblox, and more\n' +
                 '• **Dispute Resolution**: Fair mediation for all transactions',
          inline: false,
        },
        {
          name: '🔒 Your Privacy & Security',
          value: '• We only collect essential account information\n' +
                 '• All data is encrypted and securely stored\n' +
                 '• We never share your personal information\n' +
                 '• You can delete your account at any time',
          inline: false,
        },
        {
          name: '⚖️ Terms & Requirements',
          value: '• You must be **13+ years old** to use Bloxtr8\n' +
                 '• KYC verification required for trading\n' +
                 '• Follow our community guidelines\n' +
                 '• No fraudulent or illegal activities',
          inline: false,
        }
      )
      .setFooter({
        text: 'By clicking "Accept & Sign Up", you agree to our Terms of Service and Privacy Policy',
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    // Create accept/decline buttons
    const acceptButton = new ButtonBuilder()
      .setCustomId('consent_accept')
      .setLabel('🚀 Join Bloxtr8')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✨');

    const declineButton = new ButtonBuilder()
      .setCustomId('consent_decline')
      .setLabel('Maybe Later')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👋');

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      acceptButton,
      declineButton
    );

    await interaction.reply({
      embeds: [consentEmbed],
      components: [buttonRow],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error handling signup:', error);
    await interaction.reply({
      content:
        '❌ An error occurred while processing your signup request. Please try again later.',
      ephemeral: true,
    });
  }
}

/**
 * Handles consent acceptance - creates user account
 */
async function handleConsentAccept(interaction: ButtonInteraction) {
  try {
    // Show loading message
    await interaction.deferUpdate();

    // Create user account
    const userResult = await ensureUserExists(
      interaction.user.id,
      interaction.user.username
    );

    if (!userResult.user) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('❌ Account Creation Failed')
        .setDescription(
          userResult.error ||
            'Failed to create your account. Please try again later.'
        )
        .setTimestamp();

      await interaction.editReply({
        embeds: [errorEmbed],
        components: [],
      });
      return;
    }

    // Success message
    const successEmbed = new EmbedBuilder()
      .setColor(0x00d4aa) // Bloxtr8 brand color
      .setTitle('🎉 Welcome to Bloxtr8!')
      .setDescription(
        '**Your account has been successfully created!**\n\n' +
        'You\'re now part of the most secure Roblox trading community. ' +
        'Let\'s get you set up for your first trade!'
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '👤 Your Account',
          value: `**ID:** \`${userResult.user.id}\`\n` +
                 `**Username:** ${userResult.user.name || 'Not set'}\n` +
                 `**Status:** ${userResult.user.kycVerified ? '🟢 Verified' : '🟡 Pending Verification'}`,
          inline: true,
        },
        {
          name: '🔗 Linked Accounts',
          value: '**Discord:** ✅ Connected\n' +
                 '**Roblox:** ❌ Not linked\n' +
                 '**Email:** ❌ Not verified',
          inline: true,
        },
        {
          name: '🚀 What\'s Next?',
          value: '1. **Link Roblox**: Use `/linkrblx` to connect your Roblox account\n' +
                 '2. **Verify Identity**: Complete KYC for full trading access\n' +
                 '3. **Start Trading**: Create your first listing with `/listing create`\n' +
                 '4. **Check Status**: Use `/verify` anytime to see your account status',
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Welcome aboard, ${interaction.user.username}! 🎊`,
        iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
      });

    await interaction.editReply({
      embeds: [successEmbed],
      components: [],
    });
  } catch (error) {
    console.error('Error handling consent acceptance:', error);
    await interaction.editReply({
      content:
        '❌ An error occurred while creating your account. Please try again later.',
      components: [],
    });
  }
}

/**
 * Handles consent decline
 */
async function handleConsentDecline(interaction: ButtonInteraction) {
  try {
    const declineEmbed = new EmbedBuilder()
      .setColor(0x6b7280) // Gray color for neutral response
      .setTitle('👋 No Problem!')
      .setDescription(
        '**Registration cancelled**\n\n' +
        'We understand! Bloxtr8 will always be here when you\'re ready to join the secure trading community.'
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields({
        name: '💡 Remember',
        value: '• Use `/signup` anytime to create your account\n' +
               '• Join our Discord server for updates and support\n' +
               '• Follow us for the latest features and security updates',
      })
      .setTimestamp()
      .setFooter({
        text: 'Thanks for considering Bloxtr8! 🚀',
        iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
      });

    await interaction.update({
      embeds: [declineEmbed],
      components: [],
    });
  } catch (error) {
    console.error('Error handling consent decline:', error);
    await interaction.editReply({
      content: '❌ An error occurred. Please try again later.',
      components: [],
    });
  }
}

/**
 * Handles the /linkrblx command
 * Provides instructions for linking Roblox account
 */
async function handleLinkRoblox(interaction: ChatInputCommandInteraction) {
  try {
    // Check if user exists
    const userResult = await ensureUserExists(
      interaction.user.id,
      interaction.user.username
    );

    if (!userResult.user) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xef4444) // Red color for error
        .setTitle('🚫 Account Required')
        .setDescription(
          '**You need a Bloxtr8 account first!**\n\n' +
          'Create your account to start linking external accounts and accessing trading features.'
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🚀 Get Started',
          value: '**Step 1:** Use `/signup` to create your Bloxtr8 account\n' +
                 '**Step 2:** Complete the registration process\n' +
                 '**Step 3:** Come back and use `/linkrblx` to connect Roblox\n\n' +
                 'It only takes 2 minutes to get started!',
        })
        .setFooter({
          text: 'Join thousands of secure traders on Bloxtr8! 🎯',
          iconURL: 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      });
      return;
    }

    // Check if Roblox account is already linked
    const hasRobloxAccount = await checkProviderAccount(
      interaction.user.id,
      'roblox'
    );

    if (hasRobloxAccount) {
      const alreadyLinkedEmbed = new EmbedBuilder()
        .setColor(0x10b981) // Green color for success
        .setTitle('✅ Roblox Account Connected!')
        .setDescription(
          '**Your Roblox account is already linked!**\n\n' +
          'You\'re all set to start trading with your verified Roblox profile.'
        )
        .setThumbnail('https://cdn.discordapp.com/attachments/1234567890/1234567890/roblox-icon.png')
        .addFields({
          name: '🎯 What\'s Next?',
          value: '• **Check Status**: Use `/verify` to see all your linked accounts\n' +
                 '• **Start Trading**: Use `/listing create` to create your first listing\n' +
                 '• **Browse Listings**: Visit our web app to find trading opportunities\n' +
                 '• **Get Verified**: Complete KYC for full trading access',
        })
        .setFooter({
          text: 'You\'re ready to trade! 🚀',
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [alreadyLinkedEmbed],
        ephemeral: true,
      });
      return;
    }

    // Show linking instructions
    const linkEmbed = new EmbedBuilder()
      .setColor(0x00d4aa) // Bloxtr8 brand color
      .setTitle('🔗 Connect Your Roblox Account')
      .setDescription(
        '**Link your Roblox account to unlock full trading features!**\n\n' +
        'Connect your Roblox profile to verify your identity and access exclusive trading opportunities.'
      )
      .setThumbnail('https://cdn.discordapp.com/attachments/1234567890/1234567890/roblox-icon.png') // Add Roblox icon
      .addFields(
        {
          name: '🚀 Quick Setup (3 Steps)',
          value: '**1.** Click the link below to start\n' +
                 '**2.** Sign in with your Roblox account\n' +
                 '**3.** Authorize the connection\n\n' +
                 `[🔗 **Start Linking Process**](${getWebAppBaseUrl()}/auth/link/roblox?discordId=${interaction.user.id})`,
          inline: false,
        },
        {
          name: '✅ What You Get',
          value: '• **Verified Status**: Show you\'re a real Roblox user\n' +
                 '• **Enhanced Security**: Multi-factor account verification\n' +
                 '• **Trading Access**: Create and respond to listings\n' +
                 '• **Trust Badge**: Build credibility with other traders',
          inline: true,
        },
        {
          name: '🔒 Security & Privacy',
          value: '• **OAuth 2.0**: Industry-standard secure connection\n' +
                 '• **No Passwords**: We never see your Roblox password\n' +
                 '• **Limited Access**: Only basic profile information\n' +
                 '• **Revocable**: Unlink anytime from your settings',
          inline: true,
        },
        {
          name: '⚠️ Important Notes',
          value: '• Make sure you\'re signed into the **correct** Roblox account\n' +
                 '• The process takes less than 2 minutes\n' +
                 '• You can only link **one** Roblox account per Bloxtr8 account\n' +
                 '• Contact support if you encounter any issues',
          inline: false,
        }
      )
      .setFooter({
        text: 'Secure • Fast • Trusted by thousands of users',
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [linkEmbed],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error handling link Roblox:', error);
    await interaction.reply({
      content:
        '❌ An error occurred while processing your request. Please try again later.',
      ephemeral: true,
    });
  }
}

client.login(process.env.DISCORD_BOT_TOKEN);
