// src/main.js
const { Client, GatewayIntentBits, Collection, Events, Options, ChannelType, PermissionFlagsBits, OverwriteType, EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');
const { QuickDB } = require('quick.db');

dotenv.config();

// --- Import Giveaway Module Logic ---
let loadActiveGiveawaysFunction, endGiveawayFunction, activeGiveawaysMapInstance;
const giveawayCommandModulePath = path.join(__dirname, 'commands', 'Giveaway', 'giveaway.js');
if (fs.existsSync(giveawayCommandModulePath)) {
    try {
        const giveawayModule = require(giveawayCommandModulePath);
        loadActiveGiveawaysFunction = giveawayModule.loadActiveGiveaways;
        endGiveawayFunction = giveawayModule.endGiveaway;
        activeGiveawaysMapInstance = giveawayModule.activeGiveaways;
        if (typeof loadActiveGiveawaysFunction !== 'function') console.error("[CRITICAL] loadActiveGiveaways is not a function!");
        if (typeof endGiveawayFunction !== 'function') console.error("[CRITICAL] endGiveaway is not a function!");
        if (!(activeGiveawaysMapInstance instanceof Map)) console.error("[CRITICAL] activeGiveaways is not a Map!");
    } catch (e) {
        console.error("[CRITICAL] Failed to load giveaway module:", e);
    }
} else {
    console.error(`[CRITICAL] Giveaway command module not found at: ${giveawayCommandModulePath}. Giveaway features will be disabled.`);
}

// --- Import Ticket Module Helper ---
let generateTicketChannelNameHelper;
const ticketCommandModulePath = path.join(__dirname, 'commands', 'Tickets', 'ticket.js'); // Adjust if your path is different
if (fs.existsSync(ticketCommandModulePath)) {
    try {
        const ticketModule = require(ticketCommandModulePath);
        if (ticketModule && typeof ticketModule.generateTicketChannelName === 'function') {
            generateTicketChannelNameHelper = ticketModule.generateTicketChannelName;
            console.log("[Main] Successfully loaded generateTicketChannelName helper from ticket module.");
        } else {
            console.error("[CRITICAL] generateTicketChannelName function not found or invalid in ticket module.");
            generateTicketChannelNameHelper = null; // Ensure it's null if not loaded
        }
    } catch (e) {
        console.error("[CRITICAL] Failed to load ticket module for helper functions:", e);
        generateTicketChannelNameHelper = null; // Ensure it's null on error
    }
} else {
    console.error(`[CRITICAL] Ticket command module not found at: ${ticketCommandModulePath}. Ticket helper functions will be unavailable.`);
    generateTicketChannelNameHelper = null; // Ensure it's null if file not found
}


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
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
                if (command && 'data' in command && 'execute' in command) {
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
            if (event && event.name && event.execute) {
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, db, client));
                } else {
                    client.on(event.name, (...args) => event.execute(...args, db, client));
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
            // It's good practice to check if already replied/deferred before replying
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'This command is not available.', ephemeral: true }).catch(console.error);
            } else {
                await interaction.followUp({ content: 'This command is not available.', ephemeral: true }).catch(console.error);
            }
            return;
        }
        try {
            console.log(`[Interaction] Executing command: ${interaction.commandName} by ${interaction.user.tag} in ${interaction.guild ? interaction.guild.name : 'DM'}`);
            await command.execute(interaction, db);
        } catch (error) {
            console.error(`[Interaction] Error executing command '${interaction.commandName}':`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true }).catch(console.error);
            } else {
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true }).catch(console.error);
            }
        }
    } else if (interaction.isButton()) {
        console.log(`[ButtonInteraction] Clicked. Custom ID: ${interaction.customId} by ${interaction.user.tag} in ${interaction.guild?.name}`);
        
        let hasRepliedOrDeferred = interaction.replied || interaction.deferred;
        if (!hasRepliedOrDeferred) {
            try {
                await interaction.deferReply({ ephemeral: true });
                hasRepliedOrDeferred = true; 
            } catch (deferError) {
                console.warn(`[ButtonInteraction] Failed to defer reply for ${interaction.customId}: ${deferError.message}. Interaction might be too old or already handled.`);
                return; 
            }
        }

        // --- Ticket Creation Button ---
        if (interaction.customId === 'create_ticket_button') {
            const guild = interaction.guild;
            const user = interaction.user;
            const guildId = guild.id;

            try {
                const setupDataKey = `ticket_setup_${guildId}`;
                const setupData = await db.get(setupDataKey);

                if (!setupData || setupData.panelMessageId !== interaction.message.id) {
                    console.log(`[Ticket Create Button] Click on message ${interaction.message.id} not matching panel or no setup for guild ${guildId}.`);
                    return interaction.editReply({ content: '`❌` This ticket panel is invalid or outdated. Please ask an admin to use `/ticket setup` again.' }).catch(console.error);
                }

                const allDbData = await db.all();
                const userOpenTicket = allDbData.find(
                    entry => entry.id.startsWith(`ticket_data_${guildId}_`) &&
                             entry.value.userId === user.id &&
                             entry.value.status === 'open'
                );

                if (userOpenTicket) {
                    const existingTicketChannel = guild.channels.cache.get(userOpenTicket.value.channelId);
                    let message = '`❌` You already have an open ticket.';
                    if (existingTicketChannel) message += ` Please use: ${existingTicketChannel}`;
                    return interaction.editReply({ content: message }).catch(console.error);
                }

                if (!generateTicketChannelNameHelper) {
                    console.error("[Ticket Create Button] CRITICAL: generateTicketChannelNameHelper is not loaded!");
                    return interaction.editReply({ content: '`❌` Ticket creation system error (naming function unavailable). Please contact an admin.' }).catch(console.error);
                }
                const channelName = await generateTicketChannelNameHelper(guild, user.id, db);

                const permissionOverwrites = [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
                    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
                ];
                const supportRole = guild.roles.cache.get(setupData.supportRoleId);
                if (supportRole) {
                    permissionOverwrites.push({ id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages] });
                } else {
                    console.warn(`[Ticket Create Button] Support role ${setupData.supportRoleId} not found in guild ${guildId}.`);
                }

                let ticketChannel;
                ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: setupData.ticketCategoryId || null,
                    permissionOverwrites: permissionOverwrites,
                    topic: `Ticket by ${user.tag} (ID: ${user.id}). Opened: ${new Date().toUTCString()}`
                });
                console.log(`[Ticket Create Button] Created ticket channel ${ticketChannel.name} (${ticketChannel.id}) for ${user.tag}`);

                const currentTicketCounter = await db.get(`ticket_counter_${guildId}`) || 0; 
                const ticketDataKey = `ticket_data_${guildId}_${ticketChannel.id}`;
                const ticketInfo = {
                    channelId: ticketChannel.id, guildId: guildId, userId: user.id, userTag: user.tag,
                    status: 'open', createdAt: Date.now(), supportRoleId: setupData.supportRoleId,
                    ticketNumber: currentTicketCounter // The counter is incremented by generateTicketChannelNameHelper
                };
                await db.set(ticketDataKey, ticketInfo);

                const welcomeEmbed = new EmbedBuilder()
                    .setColor(Colors.Green)
                    .setTitle(`Support Ticket #${String(ticketInfo.ticketNumber).padStart(4, '0')}`)
                    .setDescription(`Welcome ${user}!\nThank you for creating a support ticket. Please describe your issue.\n${supportRole || 'A staff member'} will be with you shortly.`)
                    .addFields({ name: 'Opened By', value: `${user.tag} (${user.id})`, inline: true })
                    .setTimestamp();
                const closeButton = new ButtonBuilder().setCustomId(`close_ticket_${ticketChannel.id}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒');
                const ticketActionRow = new ActionRowBuilder().addComponents(closeButton);

                await ticketChannel.send({ content: supportRole ? `${supportRole}` : '', embeds: [welcomeEmbed], components: [ticketActionRow] });
                await interaction.editReply({ content: `\`✅\` Your ticket has been created: ${ticketChannel}` }).catch(console.error);

            } catch (error) {
                console.error('[Ticket Create Button] Error creating ticket:', error);
                if (hasRepliedOrDeferred && !interaction.replied) {
                    await interaction.editReply({ content: '`❌` An error occurred creating your ticket. Ensure I have "Manage Channels" & "Manage Roles/Permissions" permissions. Contact an admin.' }).catch(console.error);
                }
            }
        }
        // --- TICKET CLOSE BUTTON ---
        else if (interaction.customId.startsWith('close_ticket_')) {
            const ticketChannelId = interaction.customId.split('_')[2];
            const guild = interaction.guild;
            const guildId = guild.id;
            const userWhoClicked = interaction.member;

            try {
                const ticketDataKey = `ticket_data_${guildId}_${ticketChannelId}`;
                const ticketData = await db.get(ticketDataKey);
                const setupDataKey = `ticket_setup_${guildId}`;
                const setupData = await db.get(setupDataKey);

                if (!ticketData || ticketData.status !== 'open') {
                    return interaction.editReply({ content: '`⚠` This ticket is already closed or its data could not be found.' }).catch(console.error);
                }
                if (!setupData) {
                    return interaction.editReply({ content: '`❌` Ticket system setup data not found. Cannot close ticket.' }).catch(console.error);
                }

                const isTicketCreator = ticketData.userId === userWhoClicked.id;
                const hasSupportRole = setupData.supportRoleId ? userWhoClicked.roles.cache.has(setupData.supportRoleId) : false;
                const hasManageChannelsPerm = userWhoClicked.permissions.has(PermissionFlagsBits.ManageChannels);

                if (!isTicketCreator && !hasSupportRole && !hasManageChannelsPerm) {
                    return interaction.editReply({ content: '`❌` You do not have permission to close this ticket.' }).catch(console.error);
                }

                const ticketChannel = guild.channels.cache.get(ticketChannelId);
                if (!ticketChannel) {
                    await db.set(`${ticketDataKey}.status`, 'closed_channel_deleted');
                    console.warn(`[Ticket Close Button] Ticket channel ${ticketChannelId} not found, marked as deleted in DB.`);
                    return interaction.editReply({ content: '`⚠` The ticket channel seems to have been deleted.' }).catch(console.error);
                }

                ticketData.status = 'closed';
                ticketData.closedBy = userWhoClicked.id;
                ticketData.closedAt = Date.now();
                await db.set(ticketDataKey, ticketData);

                await ticketChannel.permissionOverwrites.edit(ticketData.userId, {
                    SendMessages: false, ViewChannel: true 
                }).catch(err => console.warn(`[Ticket Close Button] Failed to restrict user access for ${ticketChannelId}: ${err.message}`));
                
                const ticketNumberDisplay = String(ticketData.ticketNumber || 'N/A').padStart(4, '0');
                const closedChannelName = `closed-${ticketNumberDisplay}-${ticketData.userTag.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 20) || 'user'}`.substring(0,100);

                await ticketChannel.setName(closedChannelName)
                    .catch(err => console.warn(`[Ticket Close Button] Failed to rename closed ticket ${ticketChannelId}: ${err.message}`));

                const closeEmbed = new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle(`Ticket #${ticketNumberDisplay} Closed`)
                    .setDescription(`This ticket has been closed by ${userWhoClicked}.`)
                    .addFields(
                        { name: 'Ticket Owner', value: `<@${ticketData.userId}>`, inline: true },
                        { name: 'Closed By', value: `${userWhoClicked}`, inline: true }
                    )
                    .setTimestamp();
                await ticketChannel.send({ embeds: [closeEmbed] });

                const originalButtonMessage = interaction.message;
                 if (originalButtonMessage && originalButtonMessage.components.length > 0) {
                    const disabledButton = new ButtonBuilder()
                        .setCustomId(interaction.customId)
                        .setLabel('Ticket Closed')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔒')
                        .setDisabled(true);
                    const updatedRow = new ActionRowBuilder().addComponents(disabledButton);
                    await originalButtonMessage.edit({ components: [updatedRow] }).catch(err => console.warn(`[Ticket Close Button] Failed to disable close button for ${ticketChannelId}: ${err.message}`));
                }
                
                await interaction.editReply({ content: `\`✅\` Ticket ${ticketChannel.name} has been closed.` }).catch(console.error);
                console.log(`[Ticket Close Button] Ticket ${ticketChannelId} closed by ${userWhoClicked.user.tag}.`);

            } catch (error) {
                console.error(`[Ticket Close Button] Error closing ticket ${interaction.customId}:`, error);
                 if (hasRepliedOrDeferred && !interaction.replied) {
                    await interaction.editReply({ content: '`❌` An error occurred while trying to close the ticket.' }).catch(console.error);
                }
            }
        }
        // --- GIVEAWAY ENTRY BUTTON ---
        else if (interaction.customId.startsWith('giveaway_entry_')) {
            const messageId = interaction.customId.split('_')[2];
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const giveawayKey = `giveaway_${guildId}_${messageId}`;
            console.log(`[Giveaway Button] User ${userId} trying to enter. Key: ${giveawayKey}, CustomID: ${interaction.customId}.`);

            let giveawayDataForEntry; 
            try {
                console.log(`[Giveaway Button DBG] Attempting db.get for key: ${giveawayKey}`);
                giveawayDataForEntry = await db.get(giveawayKey); 
                console.log(`[Giveaway Button DBG] db.get for key '${giveawayKey}' returned. Data:`, giveawayDataForEntry ? 'Exists' : 'null/undefined');
                if (giveawayDataForEntry) {
                    console.log(`[Giveaway Button DBG] Data (status): ${giveawayDataForEntry.status}, (endTime): ${new Date(giveawayDataForEntry.endTime).toISOString()}, (entrants type): ${Array.isArray(giveawayDataForEntry.entrants) ? 'Array' : typeof giveawayDataForEntry.entrants}`);
                }
            } catch (dbGetError) {
                console.error(`[Giveaway Button DBG] CRITICAL ERROR during db.get for key ${giveawayKey}:`, dbGetError);
                if (hasRepliedOrDeferred && !interaction.replied) {
                     await interaction.editReply({ content: 'A critical database error occurred fetching giveaway data.' }).catch(console.error);
                }
                return; 
            }
            
            try {
                const giveawayData = giveawayDataForEntry; 
                console.log(`[Giveaway Button] Inside main logic for ${messageId}.`);

                if (!giveawayData) {
                    console.log(`[Giveaway Button] Data NOT FOUND for key (after DBG check): ${giveawayKey}`);
                    return interaction.editReply({ content: 'This giveaway data could not be found.' }).catch(console.error);
                }
                
                if (giveawayData.status !== 'running') {
                    console.log(`[Giveaway Button] Giveaway ${messageId} not running. Status: ${giveawayData.status}`);
                    return interaction.editReply({ content: 'This giveaway is no longer running.' }).catch(console.error);
                }

                if (giveawayData.endTime <= Date.now()) {
                    console.log(`[Giveaway Button] Giveaway ${messageId} end time has passed. Now: ${new Date(Date.now()).toISOString()}`);
                    if (endGiveawayFunction) { 
                        console.log(`[Giveaway Button] Triggering endGiveawayFunction for ${messageId}.`);
                        endGiveawayFunction(interaction.client, guildId, messageId, db).catch(err => console.error(`[Giveaway Button] Error from background endGiveawayFunction:`, err));
                    } else { console.error("[Giveaway Button] CRITICAL: endGiveawayFunction not loaded!"); }
                    return interaction.editReply({ content: 'This giveaway has just ended!' }).catch(console.error);
                }

                if (!Array.isArray(giveawayData.entrants)) { 
                    console.error(`[Giveaway Button] CRITICAL: giveawayData.entrants for ${messageId} is NOT an array! Type: ${typeof giveawayData.entrants}. Resetting.`);
                    giveawayData.entrants = []; 
                }
                if (giveawayData.entrants.includes(userId)) {
                    console.log(`[Giveaway Button] User ${userId} already entered ${messageId}.`);
                    return interaction.editReply({ content: 'You have already entered this giveaway!' }).catch(console.error);
                }

                giveawayData.entrants.push(userId);
                console.log(`[Giveaway Button] Pushed ${userId} to entrants for ${messageId}. Attempting db.set...`);
                await db.set(giveawayKey, giveawayData);
                console.log(`[Giveaway Button] DB set for ${giveawayKey} successful. Entrants: ${giveawayData.entrants.length}`);

                await interaction.editReply({ content: '🎉 You have successfully entered the giveaway!' }).catch(err => {
                    console.error(`[Giveaway Button] FAILED TO EDITREPLY for successful entry on ${messageId}:`, err);
                });
                console.log(`[Giveaway Button] Successfully processed entry for ${userId} on ${messageId}.`);

            } catch (error) {
                console.error(`[ButtonInteraction][Giveaway Entry Main Catch] Error for ${interaction.customId}:`, error);
                if (hasRepliedOrDeferred && !interaction.replied) {
                    await interaction.editReply({ content: 'An error occurred while processing your entry.' }).catch(err => {
                        console.error(`[ButtonInteraction][Giveaway Entry Main Catch] FAILED TO EDITREPLY for error on ${messageId}:`, err);
                    });
                }
            }
        }
        // --- REACTION ROLE BUTTON ---
        else if (interaction.customId.startsWith('rr-button_')) {
            const guildId = interaction.guild.id;
            const dbKey = `reactionrole_button_messages_${guildId}`;
            try {
                // Already deferred
                const guildConfigs = await db.get(dbKey) || [];
                const messageConfig = guildConfigs.find(mc => mc.messageId === interaction.message.id);
                if (!messageConfig) { 
                    console.log(`[RR Button] No message config for ${interaction.message.id}`);
                    return interaction.editReply({ content: 'This reaction role message is outdated or misconfigured.'}); 
                }
                const buttonConfig = messageConfig.buttons.find(b => b.customId === interaction.customId);
                if (!buttonConfig) { 
                    console.log(`[RR Button] No button config for ${interaction.customId}`);
                    return interaction.editReply({ content: 'This specific reaction role button is misconfigured.'}); 
                }
                const roleId = buttonConfig.roleId;
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) { 
                     console.log(`[RR Button] Role ${roleId} not found.`);
                    return interaction.editReply({ content: 'The role associated with this button no longer exists.'}); 
                }
                const member = interaction.member;
                if (member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    await interaction.editReply({ content: `The **${role.name}** role has been removed.` });
                } else {
                    await member.roles.add(role);
                    await interaction.editReply({ content: `You've been given the **${role.name}** role!` });
                }
            } catch (error) {
                 console.error(`[ButtonInteraction][RR Button] Error for ${interaction.customId}: ${error}`);
                 if (hasRepliedOrDeferred && !interaction.replied) { // Check if reply hasn't been sent
                    await interaction.editReply({content: "An error occurred while updating your roles."}).catch(console.error);
                 }
            }
        } else {
            console.log(`[ButtonInteraction] Unknown button ID: ${interaction.customId}. No specific action taken.`);
            if (hasRepliedOrDeferred && !interaction.replied) {
                 await interaction.editReply({ content: "This button is not recognized or its action has expired.", ephemeral: true }).catch(() => {});
            }
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