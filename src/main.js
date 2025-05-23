// src/main.js
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
        GatewayIntentBits.GuildMessageReactions, // Keep if you still want old emoji reaction events
        GatewayIntentBits.GuildMembers // Important for giving roles
    ]
});

// --- Database Setup ---
const db = new QuickDB(); // Initialize QuickDB
console.log(`[Main] QuickDB initialized. Type: ${typeof db}, Constructor: ${db.constructor.name}, Has .get: ${typeof db.get === 'function'}`);


// --- Command Handling (Slash Command Handler) ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`[Commands] Loaded command: ${command.data.name}`);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// --- Event Handling (for non-interaction events like ready, messageReactionAdd, etc.) ---
// This section will load events from your 'events' folder.
// If you remove messageReactionAdd.js and messageReactionRemove.js, they simply won't be loaded.
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.name && event.execute) {
            if (event.once) {
                client.once(event.name, (...args) => {
                    // console.log(`[Main.js DEBUG ONCE] Event: ${event.name}`);
                    // console.log(`[Main.js DEBUG ONCE] Number of args from discord.js: ${args.length}`);
                    // console.log(`[Main.js DEBUG ONCE] 'db' instance to be passed: ${db ? db.constructor.name : typeof db}`);
                    event.execute(...args, db); // Pass db to events
                });
            } else {
                client.on(event.name, (...args) => {
                    // console.log(`[Main.js DEBUG ON] Event: ${event.name}`);
                    // console.log(`[Main.js DEBUG ON] Number of args from discord.js: ${args.length}`);
                    // console.log(`[Main.js DEBUG ON] 'db' instance to be passed: ${db ? db.constructor.name : typeof db}`);
                    event.execute(...args, db); // Pass db to events
                });
            }
            console.log(`[Events] Loaded event: ${event.name}`);
        } else {
            console.log(`[WARNING] The event at ${filePath} is missing a required "name" or "execute" property.`);
        }
    }
} else {
    console.log("[Events] 'events' directory not found. No custom non-interaction events will be loaded.");
}


// --- Interaction Handling (Unified for Slash Commands and Buttons) ---
client.on(Events.InteractionCreate, async interaction => {
    // --- Slash Command Handling ---
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            await interaction.reply({ content: 'This command does not exist or is not registered.', ephemeral: true });
            return;
        }

        try {
            console.log(`[Interaction] Executing command: ${interaction.commandName} by ${interaction.user.tag}`);
            await command.execute(interaction, db); // Pass db to commands
        } catch (error) {
            console.error(`[Interaction] Error executing command ${interaction.commandName}:`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
        return; // Handled as a slash command
    }

    // --- Button Interaction Handling ---
    if (interaction.isButton()) {
        console.log(`[ButtonInteraction] Detected button click. Custom ID: ${interaction.customId}, User: ${interaction.user.tag}, Message: ${interaction.message.id}`);

        // Basic check if the customId seems like one of ours for reaction roles
        // You might want more specific checks if you have other types of buttons
        if (!interaction.customId.startsWith('rr-button_')) {
            console.log(`[ButtonInteraction] Button with customId '${interaction.customId}' not part of reaction role system. Ignoring.`);
            // If you have other button handlers, you'd call them here or let them be handled elsewhere.
            // For now, we assume only reaction role buttons.
            // You could reply ephemerally if you want to tell the user it's an unknown button.
            // await interaction.reply({ content: "This button's action is unknown.", ephemeral: true });
            return;
        }

        const guildId = interaction.guild.id;
        const dbKey = `reactionrole_button_messages_${guildId}`; // Ensure this matches the key used in reactionrole-embed.js
        const guildConfigs = await db.get(dbKey) || [];

        const messageConfig = guildConfigs.find(mc => mc.messageId === interaction.message.id);

        if (!messageConfig) {
            console.log(`[ButtonInteraction] No config found for message ID: ${interaction.message.id}`);
            await interaction.reply({ content: "This reaction role message seems to be outdated or misconfigured. Please ask an admin to recreate it.", ephemeral: true });
            return;
        }

        const buttonConfig = messageConfig.buttons.find(b => b.customId === interaction.customId);

        if (!buttonConfig) {
            console.log(`[ButtonInteraction] No button config found for custom ID: ${interaction.customId} on message ${interaction.message.id}`);
            await interaction.reply({ content: "This specific button's action is undefined. The message might need to be recreated.", ephemeral: true });
            return;
        }

        const roleId = buttonConfig.roleId;
        const role = interaction.guild.roles.cache.get(roleId);

        if (!role) {
            console.warn(`[ButtonInteraction] Role ID ${roleId} not found in guild ${guildId}. Config for button ${interaction.customId} (Label: ${buttonConfig.label}) might be outdated.`);
            await interaction.reply({ content: `The role **${buttonConfig.label || 'associated with this button'}** could not be found. It might have been deleted. Please contact an admin.`, ephemeral: true });
            return;
        }

        const member = interaction.member;

        if (!member) {
            console.error("[ButtonInteraction] Could not get member from interaction. This shouldn't happen for guild button interactions.");
            await interaction.reply({ content: "Could not identify you in the server to update roles. Please try again.", ephemeral: true });
            return;
        }

        try {
            if (member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
                await interaction.reply({ content: `The **${role.name}** role has been removed.`, ephemeral: true });
                console.log(`[ButtonInteraction] Removed role ${role.name} from ${member.user.tag}`);
            } else {
                await member.roles.add(role);
                await interaction.reply({ content: `You've been given the **${role.name}** role!`, ephemeral: true });
                console.log(`[ButtonInteraction] Added role ${role.name} to ${member.user.tag}`);
            }
        } catch (error) {
            console.error(`[ButtonInteraction] Failed to toggle role ${role.name} for ${member.user.tag}:`, error);
            let errorMessage = `An error occurred while trying to update your roles. Please try again later.`;
            if (error.code === 50013) { // DiscordAPIErrorCodes.MissingPermissions
                errorMessage = `I don't have permission to manage the **${role.name}** role. Please ensure my bot role is higher than this role in the server settings and that I have the "Manage Roles" permission.`;
            } else if (error.code === 50001) { // DiscordAPIErrorCodes.MissingAccess
                 errorMessage = `I seem to be missing general access to perform this action. Please check my overall permissions.`;
            }
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
        return; // Handled as a button interaction
    }

    // --- (Future: Add handlers for Select Menus, Modals, etc. here) ---
    // if (interaction.isStringSelectMenu()) { /* ... */ }
    // if (interaction.isModalSubmit()) { /* ... */ }
});


// --- Bot Login ---
client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    // You'll need a separate script to register slash commands initially
    console.log("Ensure slash commands are registered using a deploy-commands.js script.");
    // You could also set activity here
    // client.user.setActivity('with reaction roles', { type: ActivityType.Playing });
});

client.login(process.env.DISCORD_TOKEN);