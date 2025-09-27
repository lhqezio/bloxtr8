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
        .setColor(0x00d4aa)
        .setTitle('👋 Welcome to Bloxtr8!')
        .setDescription(
          `**Hello ${targetName}!** Ready to trade Roblox items safely?`
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '🚀 Get Started',
            value: '`/signup` - Create account',
            inline: true,
          },
          {
            name: '🔗 Link Accounts',
            value: '`/linkrblx` - Connect Roblox',
            inline: true,
          },
          {
            name: '📊 Check Status',
            value: '`/verify` - View profile',
            inline: true,
          }
        )
        .setFooter({
          text: 'Secure • Fast • Trusted',
          iconURL: interaction.user.displayAvatarURL(),
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

      const pingEmbed = new EmbedBuilder()
        .setColor(0x00d4aa)
        .setTitle('🏓 Pong!')
        .setDescription('**Bot Status: Online**')
        .addFields(
          {
            name: '⚡ Speed',
            value: `${latency}ms`,
            inline: true,
          },
          {
            name: '🟢 Status',
            value: 'All systems go',
            inline: true,
          }
        )
        .setFooter({
          text: 'Bloxtr8 Bot',
          iconURL: interaction.user.displayAvatarURL(),
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
        .setColor(0xf59e0b)
        .setTitle('🔒 Verification Required')
        .setDescription('**Complete KYC to create listings**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '📋 What is KYC?',
            value: 'Identity verification for safe trading',
            inline: true,
          },
          {
            name: '⏱️ Processing',
            value: '1-3 business days',
            inline: true,
          },
          {
            name: '🌐 Get Started',
            value: 'Visit our web app to verify',
            inline: true,
          }
        )
        .setFooter({
          text: 'Protects you and other traders',
          iconURL: interaction.user.displayAvatarURL(),
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
      .setTitle(`${provider.label} Account`)
      .setColor(account ? 0x10b981 : 0xef4444)
      .setThumbnail(
        provider.id === 'roblox'
          ? 'https://cdn.discordapp.com/attachments/1234567890/1234567890/roblox-icon.png'
          : provider.id === 'discord'
            ? 'https://cdn.discordapp.com/attachments/1234567890/1234567890/discord-icon.png'
            : 'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png'
      )
      .addFields({
        name: account ? '✅ Connected' : '❌ Not Linked',
        value: account
          ? `[View Profile](${provider.buildUrl(account.accountId)})`
          : `Use \`/linkrblx\` to connect`,
      })
      .setFooter({
        text: account ? 'Verified' : 'Link to unlock',
        iconURL:
          'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
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
        .setColor(0xef4444)
        .setTitle('❌ Account Error')
        .setDescription('**Unable to access your account**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🔧 Quick Fix',
          value: 'Try `/signup` to create a new account',
        })
        .setFooter({
          text: 'Need help? Contact support',
          iconURL: interaction.user.displayAvatarURL(),
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
      .setColor(0x00d4aa)
      .setTitle('⏳ Creating Listing...')
      .setDescription('**Please wait while we process your listing**')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields({
        name: '🔄 Status',
        value: 'Processing your information...',
      })
      .setFooter({
        text: 'Almost ready...',
        iconURL: interaction.user.displayAvatarURL(),
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
      .setColor(0x00d4aa)
      .setTitle('🎉 Listing Created!')
      .setDescription('**Your listing is now live!**')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '📋 Details',
          value: `**${title}**\n$${(price / 100).toFixed(2)} • ${category}`,
          inline: true,
        },
        {
          name: '🆔 ID',
          value: `\`${apiResult.data.id}\``,
          inline: true,
        },
        {
          name: '🔗 View',
          value: `[Open Listing](${getApiBaseUrl()}/api/listings/${apiResult.data.id})`,
          inline: true,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Created by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL(),
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
        .setColor(0xf59e0b)
        .setTitle('👋 Welcome Back!')
        .setDescription('**You already have a Bloxtr8 account!**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '📊 Status',
            value: '`/verify` - Check account',
            inline: true,
          },
          {
            name: '🔗 Link',
            value: '`/linkrblx` - Connect Roblox',
            inline: true,
          },
          {
            name: '📝 Create',
            value: '`/listing create` - New listing',
            inline: true,
          }
        )
        .setFooter({
          text: 'Ready to trade?',
          iconURL: interaction.user.displayAvatarURL(),
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
      .setColor(0x00d4aa)
      .setTitle('🚀 Welcome to Bloxtr8!')
      .setDescription('**The secure marketplace for Roblox trading**')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '🛡️ Secure Trading',
          value: 'Escrow protection • Verified users • Safe transactions',
          inline: false,
        },
        {
          name: '🔒 Privacy First',
          value: 'Encrypted data • No sharing • You control your info',
          inline: false,
        },
        {
          name: '⚖️ Requirements',
          value: '13+ years old • KYC verification • Follow guidelines',
          inline: false,
        }
      )
      .setFooter({
        text: 'By signing up, you agree to our Terms of Service',
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
      .setColor(0x00d4aa)
      .setTitle('🎉 Welcome to Bloxtr8!')
      .setDescription('**Your account has been created!**')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '👤 Account',
          value: `ID: \`${userResult.user.id}\`\nStatus: ${userResult.user.kycVerified ? '🟢 Verified' : '🟡 Pending'}`,
          inline: true,
        },
        {
          name: '🔗 Connected',
          value: 'Discord: ✅\nRoblox: ❌',
          inline: true,
        },
        {
          name: '🚀 Next Steps',
          value: '`/linkrblx` - Connect Roblox\n`/verify` - Check status',
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Welcome aboard, ${interaction.user.username}!`,
        iconURL: interaction.user.displayAvatarURL(),
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
      .setColor(0x6b7280)
      .setTitle('👋 No Problem!')
      .setDescription('**Registration cancelled**')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields({
        name: '💡 Remember',
        value: 'Use `/signup` anytime to create your account',
      })
      .setTimestamp()
      .setFooter({
        text: 'Thanks for considering Bloxtr8!',
        iconURL: interaction.user.displayAvatarURL(),
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
        .setColor(0xef4444)
        .setTitle('🚫 Account Required')
        .setDescription('**You need a Bloxtr8 account first!**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields({
          name: '🚀 Get Started',
          value: 'Use `/signup` to create your account',
        })
        .setFooter({
          text: 'Join thousands of secure traders!',
          iconURL: interaction.user.displayAvatarURL(),
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
        .setColor(0x10b981)
        .setTitle('✅ Roblox Connected!')
        .setDescription('**Your Roblox account is already linked!**')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          {
            name: '📊 Status',
            value: '`/verify` - Check accounts',
            inline: true,
          },
          {
            name: '📝 Create',
            value: '`/listing create` - New listing',
            inline: true,
          },
          {
            name: '🌐 Browse',
            value: 'Visit our web app',
            inline: true,
          }
        )
        .setFooter({
          text: "You're ready to trade!",
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
      .setColor(0x00d4aa)
      .setTitle('🔗 Connect Roblox Account')
      .setDescription(
        '**Link your Roblox account to unlock trading features!**'
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '🚀 Quick Setup',
          value:
            '**1.** Click the link below\n**2.** Sign in with Roblox\n**3.** Authorize connection',
          inline: false,
        },
        {
          name: '✅ Benefits',
          value: 'Verified status • Enhanced security • Trading access',
          inline: true,
        },
        {
          name: '🔒 Security',
          value: 'OAuth 2.0 • No passwords • Limited access',
          inline: true,
        },
        {
          name: '🔗 Start Process',
          value: 'Click the button below to connect your Roblox account',
          inline: false,
        }
      )
      .setFooter({
        text: 'Secure • Fast • Trusted',
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    // Create connect button
    const connectButton = new ButtonBuilder()
      .setCustomId('connect_roblox')
      .setLabel('🔗 Connect Roblox Account')
      .setStyle(ButtonStyle.Primary)
      .setURL(`${getWebAppBaseUrl()}/auth/link/roblox?discordId=${interaction.user.id}`);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(connectButton);

    await interaction.reply({
      embeds: [linkEmbed],
      components: [buttonRow],
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
