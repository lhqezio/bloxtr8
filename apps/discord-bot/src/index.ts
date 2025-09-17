import { config } from '@dotenvx/dotenvx';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

// Load environment variables
config();

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds
    ]
});

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user?.tag}`);

    // Register guild slash commands on startup
    const commands = [
        new SlashCommandBuilder()
            .setName('hello')
            .setDescription('Say hello in the channel')
            .addStringOption(opt =>
                opt.setName('name')
                    .setDescription('Name to greet')
                    .setRequired(false)
            )
            .toJSON()
    ];

    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID; // Application (bot) ID
    const guildId = process.env.GUILD_ID;   // Target guild to register commands

    if (!token || !clientId || !guildId) {
        console.warn('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID. Skipping command registration.');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log('Slash commands registered for guild', guildId);
    } catch (err) {
        console.error('Failed to register slash commands:', err);
    }
});

client.on("messageCreate", async (message) => {
    if(!message.author.bot) {
        message.author.send(`You said: ${message.content}`);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'hello') {
        const provided = interaction.options.getString('name');
        const targetName = provided || interaction.user.displayName || interaction.user.username;
        await interaction.reply({ content: `Hello there ${targetName}!` });
    }
});

client.login(process.env.DISCORD_TOKEN);
