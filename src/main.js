const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');
const { QuickDB } = require('quick.db');

dotenv.config(); // Load .env file

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers // Important for giving roles
    ]
});

// --- Command Handling (Basic Slash Command Handler) ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction, db); // Pass db to commands
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

// --- Event Handling ---
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, db)); // Pass db to events
    } else {
        client.on(event.name, (...args) => event.execute(...args, db)); // Pass db to events
    }
}

// --- Database Setup ---
const db = new QuickDB(); // Initialize QuickDB

// --- Bot Login ---
client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    // You'll need a separate script to register slash commands
    console.log("Use a deploy-commands.js script to register slash commands.");
});

client.login(process.env.DISCORD_TOKEN);