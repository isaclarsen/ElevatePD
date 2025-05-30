// src/main.js
const { Client, GatewayIntentBits, Collection, Events, Options } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');
const { QuickDB } = require('quick.db');

dotenv.config();

// --- Import Giveaway Module Logic ---
let loadActiveGiveawaysFunction, endGiveawayFunction, activeGiveawaysMapInstance;
const giveawayCommandModulePath = path.join(__dirname, 'commands', 'Giveaway', 'giveaway.js'); // Adjust if path differs
if (fs.existsSync(giveawayCommandModulePath)) {
    try {
        const giveawayModule = require(giveawayCommandModulePath);
        loadActiveGiveawaysFunction = giveawayModule.loadActiveGiveaways;
        endGiveawayFunction = giveawayModule.endGiveaway;
        activeGiveawaysMapInstance = giveawayModule.activeGiveaways; // This is the Map instance itself
        if (typeof loadActiveGiveawaysFunction !== 'function') console.error("[CRITICAL] loadActiveGiveaways is not a function!");
        if (typeof endGiveawayFunction !== 'function') console.error("[CRITICAL] endGiveaway is not a function!");
        if (!(activeGiveawaysMapInstance instanceof Map)) console.error("[CRITICAL] activeGiveaways is not a Map!");
    } catch (e) {
        console.error("[CRITICAL] Failed to load giveaway module:", e);
    }
} else {
    console.error(`[CRITICAL] Giveaway command module not found at: ${giveawayCommandModulePath}. Giveaway features will be disabled.`);
}
// --- End Import Giveaway Module Logic ---

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    // makeCache: Options.cacheWithLimits({ MessageManager: { maxSize: 1000 } }) // Optional
});

const db = new QuickDB();
console.log(`[Main] QuickDB initialized.`);

client.commands = new Collection();
const commandsBasePath = path.join(__dirname, 'commands');

function loadCommandsRecursive(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            loadCommandsRecursive(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            try {
                const command = require(fullPath);
                if (command && 'data' in command && 'execute' in command) { // Check if command is not undefined
                    client.commands.set(command.data.name, command);
                    console.log(`[Commands] Loaded command: ${command.data.name} from ${fullPath.replace(__dirname, '')}`);
                } else {
                    console.log(`[WARNING] The command at ${fullPath.replace(__dirname, '')} is missing "data" or "execute".`);
                }
            } catch (error) {
                console.error(`[ERROR] Could not load command at ${fullPath.replace(__dirname, '')}:`, error);
            }
        }
    }
}
if (fs.existsSync(commandsBasePath)) {
    loadCommandsRecursive(commandsBasePath);
} else {
    console.log(`[WARNING] Commands directory not found: ${commandsBasePath}`);
}

const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        try {
            const event = require(filePath);
            if (event && event.name && event.execute) { // Check if event is not undefined
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, db, client)); // Pass client too
                } else {
                    client.on(event.name, (...args) => event.execute(...args, db, client)); // Pass client too
                }
                console.log(`[Events] Loaded event: ${event.name}`);
            } else {
                console.log(`[WARNING] The event at ${filePath.replace(__dirname, '')} is missing "name" or "execute".`);
            }
        } catch (error) {
            console.error(`[ERROR] Could not load event at ${filePath.replace(__dirname, '')}:`, error);
        }
    }
} else {
    console.log("[Events] 'events' directory not found.");
}

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching '${interaction.commandName}' was found.`);
            await interaction.reply({ content: 'This command is not available.', ephemeral: true });
            return;
        }
        try {
            console.log(`[Interaction] Executing command: ${interaction.commandName} by ${interaction.user.tag} in ${interaction.guild ? interaction.guild.name : 'DM'}`);
            await command.execute(interaction, db);
        } catch (error) {
            console.error(`[Interaction] Error executing command '${interaction.commandName}':`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
            }
        }
    } else if (interaction.isButton()) {
        console.log(`[ButtonInteraction] Clicked. Custom ID: ${interaction.customId} by ${interaction.user.tag}`);

        if (interaction.customId.startsWith('giveaway_entry_')) {
            const messageId = interaction.customId.split('_')[2];
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const giveawayKey = `giveaway_${guildId}_${messageId}`;
            console.log(`[Giveaway Button] User ${userId} trying to enter. Key: ${giveawayKey}, CustomID: ${interaction.customId}`);

            try {
                await interaction.deferReply({ ephemeral: true }); // Defer immediately for button
                const giveawayData = await db.get(giveawayKey);

                if (!giveawayData) {
                    console.log(`[Giveaway Button] Data NOT FOUND for key: ${giveawayKey}`);
                    return interaction.editReply({ content: 'This giveaway data could not be found. It might be old or an error occurred.' });
                }
                if (giveawayData.status !== 'running') {
                    return interaction.editReply({ content: 'This giveaway is no longer running.' });
                }
                if (giveawayData.endTime <= Date.now()) {
                    if (endGiveawayFunction) {
                        console.log(`[Giveaway Button] Giveaway ${messageId} seems to have ended. Triggering end function.`);
                        await endGiveawayFunction(interaction.client, guildId, messageId, db);
                    } else { console.error("[Giveaway Button] endGiveawayFunction is not loaded!"); }
                    return interaction.editReply({ content: 'This giveaway has just ended!' });
                }
                if (giveawayData.entrants.includes(userId)) {
                    return interaction.editReply({ content: 'You have already entered this giveaway!' });
                }

                giveawayData.entrants.push(userId);
                await db.set(giveawayKey, giveawayData);
                console.log(`[Giveaway Button] User ${userId} successfully entered giveaway ${messageId}. Entrants: ${giveawayData.entrants.length}`);
                await interaction.editReply({ content: '🎉 You have successfully entered the giveaway!' });

            } catch (error) {
                console.error(`[ButtonInteraction] Error handling giveaway entry for ${interaction.customId}:`, error);
                if (!interaction.replied && !interaction.deferred) { // Should not happen if deferred
                    await interaction.reply({ content: 'An error occurred while processing your entry.', ephemeral: true }).catch(() => {});
                } else if (!interaction.replied) { // If deferred but not yet replied with editReply
                     await interaction.editReply({ content: 'An error occurred while processing your entry.' }).catch(() => {});
                }
            }
        } else if (interaction.customId.startsWith('rr-button_')) {
            // ... your reaction role button logic, ensure it replies or defers then edits ...
            try {
                await interaction.deferReply({ephemeral: true}); // Example
                // ... your logic ...
                await interaction.editReply({content: "Role updated!"});
            } catch (error) {
                 console.error(`Error in rr-button: ${error}`);
                 if (!interaction.replied) await interaction.editReply({content: "Error updating role."}).catch(()=>{});
            }
        } else {
            console.log(`[ButtonInteraction] Unknown button ID: ${interaction.customId}. No action taken.`);
            // No reply for unknown buttons to prevent "interaction failed" if another handler might exist
        }
    }
});

client.once(Events.ClientReady, async c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    console.log("Ensure slash commands are (re)deployed if new ones were added or definitions changed.");
    if (loadActiveGiveawaysFunction) {
        await loadActiveGiveawaysFunction(client, db);
    } else {
        console.warn("[CRITICAL] loadActiveGiveawaysFunction not available. Giveaway persistence on restart WILL NOT WORK.");
    }
});

client.login(process.env.DISCORD_TOKEN);