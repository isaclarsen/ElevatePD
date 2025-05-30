// src/main.js
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');
const { QuickDB } = require('quick.db');

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers
    ]
});

const db = new QuickDB();
console.log(`[Main] QuickDB initialized. Type: ${typeof db}, Constructor: ${db.constructor.name}, Has .get: ${typeof db.get === 'function'}`);

// --- MODIFIED Command Handling ---
client.commands = new Collection();
const commandsBasePath = path.join(__dirname, 'commands'); // Points to src/commands

function loadCommandsRecursive(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            loadCommandsRecursive(fullPath); // Recurse into subdirectories
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            try {
                const command = require(fullPath);
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
                    console.log(`[Commands] Loaded command: ${command.data.name} from ${fullPath}`);
                } else {
                    console.log(`[WARNING] The command at ${fullPath} is missing a required "data" or "execute" property.`);
                }
            } catch (error) {
                console.error(`[ERROR] Could not load command at ${fullPath}:`, error);
            }
        }
    }
}

// Check if the base commands directory exists before trying to load
if (fs.existsSync(commandsBasePath)) {
    loadCommandsRecursive(commandsBasePath);
} else {
    console.log(`[WARNING] Commands directory not found at ${commandsBasePath}. No commands loaded.`);
}
// --- END OF MODIFIED Command Handling ---


// --- Event Handling (Optional - for non-interaction events) ---
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        try {
            const event = require(filePath);
            if (event.name && event.execute) {
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, db));
                } else {
                    client.on(event.name, (...args) => event.execute(...args, db));
                }
                console.log(`[Events] Loaded event: ${event.name}`);
            } else {
                console.log(`[WARNING] The event at ${filePath} is missing "name" or "execute".`);
            }
        } catch (error) {
            console.error(`[ERROR] Could not load event at ${filePath}:`, error);
        }
    }
} else {
    console.log("[Events] 'events' directory not found. No custom non-interaction events loaded.");
}


// --- Interaction Handling ---
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found by main.js handler.`);
            // This reply SHOULD be sent if the command isn't found in the collection
            await interaction.reply({ content: 'Error: This command was not found by the bot. It might be an issue with command loading.', ephemeral: true });
            return;
        }

        try {
            console.log(`[Interaction] Executing command: ${interaction.commandName} by ${interaction.user.tag}`);
            await command.execute(interaction, db);
        } catch (error) {
            console.error(`[Interaction] Error executing command ${interaction.commandName}:`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
        return;
    }

    if (interaction.isButton()) {
        // ... your button handling logic ...
        // (Make sure this part is also robust and replies/defers quickly)
        console.log(`[ButtonInteraction] Detected button click. Custom ID: ${interaction.customId}`);
        if (!interaction.customId.startsWith('rr-button_')) {
            // Potentially reply ephemerally if it's an unknown button or just log and ignore
            // await interaction.reply({ content: "Unknown button action.", ephemeral: true });
            return;
        }
        // Your existing button logic here, ensuring it replies or defers.
        // For example:
        const guildId = interaction.guild.id;
        const dbKey = `reactionrole_button_messages_${guildId}`;
        const guildConfigs = await db.get(dbKey) || [];
        const messageConfig = guildConfigs.find(mc => mc.messageId === interaction.message.id);
        if (!messageConfig) {
            await interaction.reply({ content: "This reaction role message is outdated.", ephemeral: true });
            return;
        }
        const buttonConfig = messageConfig.buttons.find(b => b.customId === interaction.customId);
        if (!buttonConfig) {
            await interaction.reply({ content: "This button is misconfigured.", ephemeral: true });
            return;
        }
        const roleId = buttonConfig.roleId;
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
             await interaction.reply({ content: `The role for this button no longer exists.`, ephemeral: true });
            return;
        }
        const member = interaction.member;
        try {
            if (member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
                await interaction.reply({ content: `Role **${role.name}** removed.`, ephemeral: true });
            } else {
                await member.roles.add(role);
                await interaction.reply({ content: `Role **${role.name}** added.`, ephemeral: true });
            }
        } catch (error) {
            console.error("Error toggling role via button:", error);
            await interaction.reply({ content: "Failed to update your roles.", ephemeral: true });
        }
        return;
    }
});

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    console.log("Ensure slash commands are registered using a deploy-commands.js script.");
});

client.login(process.env.DISCORD_TOKEN);