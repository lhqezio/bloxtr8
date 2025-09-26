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
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

import { createListing, getApiBaseUrl } from './utils/apiClient.js';
import {
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
      await interaction.reply({
        content: `Hello there ${targetName}!`,
        ephemeral: true,
      });
    }
    if (interaction.commandName === 'verify') {
      const id =
        interaction.options.getString('id') || interaction.user.id;
      const result = await verify(id);
      if (result.success) {
        const {embeds} = buildVerificationEmbeds(result.data);
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
      await interaction.reply({ content: 'Pinging...' });
      const latency = Date.now() - startTime;
      const apiLatency = Math.round(client.ws.ping);

      await interaction.editReply({
        content: ` Pong! Latency: ${latency}ms | API Latency: ${apiLatency}ms`,
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
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'listing_create_modal') {
      await handleListingModalSubmit(interaction);
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
        .setColor(0xff6b6b)
        .setTitle('❌ Verification Required')
        .setDescription(
          verificationResult.error || 'Account verification required.'
        )
        .addFields({
          name: 'Next Steps',
          value:
            'Please complete KYC verification to create listings. Contact support for assistance.',
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
    buildUrl: id => `https://web.bloxtr8.com/user/${id}`,
  },
];
function buildVerificationEmbeds(accounts: Account[]) {
  const embeds: EmbedBuilder[] = [];
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (const provider of providers) {
    const account = accounts.find(a => a.providerId === provider.id);

    const embed = new EmbedBuilder()
      .setTitle(`${provider.label} Account`)
      .setColor(account ? 'Green' : 'Red')
      .addFields({
        name: account ? `✅ ${provider.label} verified` : `❌ ${provider.label} not linked`,
        value: account ? `[View Profile](${provider.buildUrl(account.accountId)})` : 'No account found.',
      });

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
      await interaction.reply({
        content: `❌ ${userResult.error}`,
        ephemeral: true,
      });
      return;
    }

    // Show loading message
    await interaction.reply({
      content: '⏳ Creating your listing...',
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
      .setColor(0x51cf66)
      .setTitle('✅ Listing Created Successfully!')
      .setDescription('Your listing has been created and is now active.')
      .addFields(
        {
          name: 'Listing ID',
          value: `\`${apiResult.data.id}\``,
          inline: true,
        },
        {
          name: 'Title',
          value: title,
          inline: true,
        },
        {
          name: 'Price',
          value: `$${(price / 100).toFixed(2)}`,
          inline: true,
        },
        {
          name: 'Category',
          value: category,
          inline: true,
        },
        {
          name: 'View Listing',
          value: `[Click here to view](${getApiBaseUrl()}/api/listings/${apiResult.data.id})`,
          inline: false,
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

client.login(process.env.DISCORD_BOT_TOKEN);
