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
const ticketCommandModulePath = path.join(__dirname, 'commands', 'Tickets', 'ticket.js'); // Your path
if (fs.existsSync(ticketCommandModulePath)) {
    try {
        const ticketModule = require(ticketCommandModulePath);
        if (ticketModule && typeof ticketModule.generateTicketChannelName === 'function') {
            generateTicketChannelNameHelper = ticketModule.generateTicketChannelName;
            console.log("[Main] Successfully loaded generateTicketChannelName helper from ticket module.");
        } else {
            console.error("[CRITICAL] generateTicketChannelName function not found or invalid in ticket module.");
            generateTicketChannelNameHelper = null;
        }
    } catch (e) {
        console.error("[CRITICAL] Failed to load ticket module for helper functions:", e);
        generateTicketChannelNameHelper = null;
    }
} else {
    console.error(`[CRITICAL] Ticket command module not found at: ${ticketCommandModulePath}. Ticket helper functions will be unavailable.`);
    generateTicketChannelNameHelper = null;
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
                console.warn(`[ButtonInteraction] Failed to defer reply for ${interaction.customId}: ${deferError.message}.`);
                return; 
            }
        }

        // --- TICKET CREATION (CATEGORY BUTTONS) ---
        if (interaction.customId.startsWith('create_ticket_')) {
            const guild = interaction.guild;
            const user = interaction.user; // User who clicked
            const guildId = guild.id;

            try {
                // Ensure interaction is deferred if not already (should be handled by top-level defer)
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferReply({ ephemeral: true });
                }

                const setupDataKey = `ticket_setup_${guildId}`;
                const setupData = await db.get(setupDataKey);

                if (!setupData || !setupData.buttons || !Array.isArray(setupData.buttons) || setupData.panelMessageId !== interaction.message.id) {
                    console.log(`[Ticket Create Cat Button] Click on message ${interaction.message.id} not matching panel, no setup, or no buttons configured for guild ${guildId}.`);
                    return interaction.editReply({ content: '`❌` This ticket panel is invalid or misconfigured. Please ask an admin to use `/ticket setup` again.' }).catch(console.error);
                }

                const clickedButtonConfig = setupData.buttons.find(b => b.customId === interaction.customId);
                if (!clickedButtonConfig) {
                    console.log(`[Ticket Create Cat Button] No button configuration found for customId: ${interaction.customId}`);
                    return interaction.editReply({ content: '`❌` The ticket category for this button is not recognized. Please ask an admin to check the setup.' }).catch(console.error);
                }
                const ticketCategoryName = clickedButtonConfig.categoryName; // Category of the button clicked

                // --- MODIFIED OPEN TICKET CHECK ---
                const allDbData = await db.all();
                const userOpenTicketForThisCategory = allDbData.find(
                    entry => entry.id.startsWith(`ticket_data_${guildId}_`) && // Belongs to this guild
                             entry.value.userId === user.id &&                 // Belongs to this user
                             entry.value.status === 'open' &&                  // Is currently open
                             entry.value.category === ticketCategoryName       // Matches the category of the button clicked
                );

                if (userOpenTicketForThisCategory) {
                    const existingTicketChannel = guild.channels.cache.get(userOpenTicketForThisCategory.value.channelId);
                    let message = `\`❌\` You already have an open ticket in the **${ticketCategoryName}** category.`;
                    if (existingTicketChannel) {
                        message += ` Please use your existing ticket: ${existingTicketChannel}`;
                    }
                    return interaction.editReply({ content: message }).catch(console.error);
                }
                // --- END OF MODIFIED OPEN TICKET CHECK ---

                if (!generateTicketChannelNameHelper) {
                    console.error("[Ticket Create Cat Button] CRITICAL: generateTicketChannelNameHelper is not loaded!");
                    return interaction.editReply({ content: '`❌` Ticket creation system error (naming function unavailable). Please contact an admin.' }).catch(console.error);
                }
                const channelName = await generateTicketChannelNameHelper(guild, user.id, ticketCategoryName, db);


                const permissionOverwrites = [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
                    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
                ];
                const supportRole = guild.roles.cache.get(setupData.supportRoleId);
                if (supportRole) {
                    permissionOverwrites.push({ id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages] });
                } else { console.warn(`[Ticket Create Cat Button] Support role ${setupData.supportRoleId} not found.`); }

                let ticketChannel;
                ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: setupData.ticketCategoryIdParent || null, // Use the parent category from setup
                    permissionOverwrites: permissionOverwrites,
                    topic: `Ticket [${ticketCategoryName}] by ${user.tag} (ID: ${user.id}). Opened: ${new Date().toUTCString()}`
                });
                console.log(`[Ticket Create Cat Button] Created ticket channel ${ticketChannel.name} (${ticketChannel.id}) for ${user.tag} [Category: ${ticketCategoryName}]`);

                const currentTicketCounter = await db.get(`ticket_counter_${guildId}`); // Already incremented by helper
                const ticketDataKey = `ticket_data_${guildId}_${ticketChannel.id}`;
                const ticketInfo = {
                    channelId: ticketChannel.id, guildId: guildId, userId: user.id, userTag: user.tag,
                    status: 'open', createdAt: Date.now(), supportRoleId: setupData.supportRoleId,
                    ticketNumber: currentTicketCounter, // The helper function now increments and returns the new number
                    category: ticketCategoryName
                };
                await db.set(ticketDataKey, ticketInfo);

                const welcomeEmbed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(`${ticketCategoryName} Support Ticket #${String(ticketInfo.ticketNumber).padStart(4, '0')}`)
                    .setDescription(`Welcome ${user}!\nThank you for creating a support ticket regarding **${ticketCategoryName}**. Please describe your issue.\n${supportRole || 'A staff member'} will be with you shortly.`)
                    .setAuthor({ name: 'Elevate', iconURL: 'https://cdn.discordapp.com/attachments/1313509092630855722/1375503075485417703/Elevate_121.png?ex=6831ec90&is=68309b10&hm=a7de64ee3b3f67cde516b6c2bd7967418e8c5ca8e9f7d3efbdcf20afb08b0718&' })
                    .setThumbnail('https://cdn.discordapp.com/attachments/1313509092630855722/1375503075883749428/Elevate_PNG2.png?ex=6831ec90&is=68309b10&hm=c68a1b123dbd1d9e1e468f6d2aafcddaefcbf7d812bc8e353a7881a6e75c82b6&')
                    .addFields({ name: 'Opened By', value: `${user.tag} (${user.id})`, inline: true })
                    .setTimestamp();
                const closeButton = new ButtonBuilder().setCustomId(`close_ticket_${ticketChannel.id}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒');
                const ticketActionRow = new ActionRowBuilder().addComponents(closeButton);

                await ticketChannel.send({ content: supportRole ? `${supportRole}` : '', embeds: [welcomeEmbed], components: [ticketActionRow] });
                await interaction.editReply({ content: `\`✅\` Your ticket for **${ticketCategoryName}** has been created: ${ticketChannel}` }).catch(console.error);

            } catch (error) {
                console.error('[Ticket Create Cat Button] Error creating ticket:', error);
                 if (hasRepliedOrDeferred && !interaction.replied) {
                    await interaction.editReply({ content: '`❌` An error occurred creating your ticket. Ensure I have "Manage Channels" & "Manage Roles/Permissions" permissions. Contact an admin.' }).catch(console.error);
                }
            }
        }
        // --- TICKET CLOSE BUTTON ---
        else // --- TICKET CLOSE BUTTON ---
        if (interaction.customId.startsWith('close_ticket_')) {
            const ticketChannelId = interaction.customId.split('_')[2];
            const guild = interaction.guild;
            const guildId = guild.id;
            const userWhoClicked = interaction.member;

            console.log(`[Ticket Close DBG] Attempting to close ticket. Channel ID from button: ${ticketChannelId}, Clicked by: ${userWhoClicked.user.tag}`);

            try {
                const ticketDataKey = `ticket_data_${guildId}_${ticketChannelId}`;
                let ticketData = await db.get(ticketDataKey); // Use let as we modify it
                const setupDataKey = `ticket_setup_${guildId}`;
                const setupData = await db.get(setupDataKey);

                // ... (existing checks for !ticketData, ticketData.status, !setupData, permissions) ...
                if (!ticketData || ticketData.status !== 'open') { /* ... */ return interaction.editReply({ content: '`⚠` This ticket is already closed or its data could not be found.' }).catch(console.error); }
                if (!setupData) { /* ... */ return interaction.editReply({ content: '`❌` Ticket system setup data not found. Cannot close ticket.' }).catch(console.error); }
                const isTicketCreator = ticketData.userId === userWhoClicked.id;
                const hasSupportRole = setupData.supportRoleId ? userWhoClicked.roles.cache.has(setupData.supportRoleId) : false;
                const hasManageChannelsPerm = userWhoClicked.permissions.has(PermissionFlagsBits.ManageChannels);
                if (!isTicketCreator && !hasSupportRole && !hasManageChannelsPerm) { /* ... */ return interaction.editReply({ content: '`❌` You do not have permission to close this ticket.' }).catch(console.error); }


                const ticketChannel = guild.channels.cache.get(ticketChannelId);
                if (!ticketChannel) {
                    // ... (existing logic for channel already deleted) ...
                    await db.set(`${ticketDataKey}.status`, 'closed_channel_deleted');
                    console.warn(`[Ticket Close Button] Ticket channel ${ticketChannelId} not found, marked as deleted in DB.`);
                    return interaction.editReply({ content: '`⚠` The ticket channel seems to have been deleted.' }).catch(console.error);
                }
                console.log(`[Ticket Close DBG] Found ticket channel object: ${ticketChannel.name}`);


                // --- TRANSCRIPT GENERATION ---
                let transcriptContent = `Transcript for Ticket #${String(ticketData.ticketNumber || 'N/A').padStart(4, '0')} (${ticketData.category || 'General'})\n`;
                transcriptContent += `Opened by: ${ticketData.userTag} (ID: ${ticketData.userId})\n`;
                transcriptContent += `Opened at: ${new Date(ticketData.createdAt).toUTCString()}\n`;
                transcriptContent += `Closed by: ${userWhoClicked.user.tag} (ID: ${userWhoClicked.id})\n`;
                transcriptContent += `Closed at: ${new Date().toUTCString()}\n\n`;
                transcriptContent += `-------------------------------- MESSAGES --------------------------------\n\n`;

                let messagesFetched = 0;
                let lastMessageId;
                const messageLimit = 1000; // Limit messages to fetch to prevent issues with huge tickets, adjust as needed

                while (messagesFetched < messageLimit) {
                    const options = { limit: 100 };
                    if (lastMessageId) {
                        options.before = lastMessageId;
                    }

                    const fetchedMessages = await ticketChannel.messages.fetch(options);
                    if (fetchedMessages.size === 0) {
                        break; // No more messages to fetch
                    }

                    // Messages are fetched newest to oldest, so reverse for chronological order in transcript
                    const messagesInOrder = Array.from(fetchedMessages.values()).reverse();

                    for (const msg of messagesInOrder) {
                        const timestamp = new Date(msg.createdTimestamp).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
                        transcriptContent += `[${timestamp}] ${msg.author.tag}:\n${msg.content}\n`;
                        if (msg.attachments.size > 0) {
                            msg.attachments.forEach(att => {
                                transcriptContent += `  [Attachment: ${att.name} - ${att.url}]\n`;
                            });
                        }
                        transcriptContent += `\n`; // Add a blank line between messages
                    }
                    messagesFetched += fetchedMessages.size;
                    lastMessageId = fetchedMessages.first().id;

                    if (fetchedMessages.size < 100) {
                        break; // Fetched all remaining messages
                    }
                }
                if (messagesFetched >= messageLimit) {
                     transcriptContent += `\n--- Transcript may be truncated. Fetched ${messageLimit} messages. ---\n`;
                }
                console.log(`[Ticket Close DBG] Fetched ${messagesFetched} messages for transcript of ticket ${ticketChannelId}.`);
                // --- END TRANSCRIPT GENERATION ---


                // --- Perform Closing Actions ---
                ticketData.status = 'closed';
                ticketData.closedBy = userWhoClicked.id;
                ticketData.closedAt = Date.now();
                console.log(`[Ticket Close DBG] Updating ticket data in DB for ${ticketChannelId}. New status: closed.`);
                await db.set(ticketDataKey, ticketData);

                // ... (existing permission edits and channel rename logic) ...
                await ticketChannel.permissionOverwrites.edit(ticketData.userId, {
                    SendMessages: false, ViewChannel: true
                }).catch(err => console.warn(`[Ticket Close DBG] Failed to restrict user access for closed ticket ${ticketChannelId}: ${err.message}`));
                
                const ticketNumberDisplay = String(ticketData.ticketNumber || 'N/A').padStart(4, '0');
                const ticketCategoryDisplay = ticketData.category ? `${ticketData.category.toLowerCase().replace(/[^a-zA-Z0-9]/g, '').substring(0,10)}-` : '';
                const closedChannelName = `closed-${ticketCategoryDisplay}${ticketNumberDisplay}-${ticketData.userTag.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 20) || 'user'}`.substring(0,100);

                console.log(`[Ticket Close DBG] Attempting to rename channel ${ticketChannel.name} to ${closedChannelName}`);
                await ticketChannel.setName(closedChannelName)
                    .catch(err => console.warn(`[Ticket Close DBG] Failed to rename closed ticket ${ticketChannelId}: ${err.message}`));

                const closeEmbed = new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle(`Ticket #${ticketNumberDisplay} (${ticketData.category || 'General'}) Closed`)
                    .setDescription(`This ticket has been closed by ${userWhoClicked}. A transcript has been generated.`) // Updated description
                    .addFields(
                        { name: 'Ticket Owner', value: `<@${ticketData.userId}>`, inline: true },
                        { name: 'Closed By', value: `${userWhoClicked}`, inline: true }
                    )
                    .setTimestamp();
                console.log(`[Ticket Close DBG] Sending close embed to ${ticketChannel.name}`);
                
                // Send transcript as an attachment
                const transcriptFileName = `transcript-${guildId}-${ticketChannelId}.txt`;
                const transcriptAttachment = {
                    attachment: Buffer.from(transcriptContent, 'utf-8'),
                    name: transcriptFileName
                };

                await ticketChannel.send({ embeds: [closeEmbed], files: [transcriptAttachment] });


                // Disable the button on the message where the "Close Ticket" button was clicked
                const originalButtonMessage = interaction.message; 
                // ... (existing button disabling logic) ...
                if (originalButtonMessage && originalButtonMessage.components.length > 0) {
                    const disabledButton = new ButtonBuilder()
                        .setCustomId(interaction.customId)
                        .setLabel('Ticket Closed')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔒') 
                        .setDisabled(true);
                    const updatedRow = new ActionRowBuilder().addComponents(disabledButton);
                    await originalButtonMessage.edit({ components: [updatedRow] }).catch(err => console.warn(`[Ticket Close DBG] Failed to disable close button for ${ticketChannelId} on message ${originalButtonMessage.id}: ${err.message}`));
                }
                
                console.log(`[Ticket Close DBG] Replying to interaction for ticket ${ticketChannelId}.`);
                await interaction.editReply({ content: `\`✅\` Ticket **${closedChannelName}** has been closed and a transcript has been saved in the channel.` }).catch(console.error);
                console.log(`[Ticket Close DBG] Ticket ${ticketChannelId} successfully closed by ${userWhoClicked.user.tag}.`);

            } catch (error) {
                console.error(`[Ticket Close Button][Main Catch Block] Error closing ticket ${interaction.customId}:`, error);
                if (!interaction.replied) { 
                    await interaction.editReply({ content: '`❌` An error occurred while trying to close the ticket. Please check the console.' }).catch(console.error);
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

                if (!giveawayData) { /* ... */ return interaction.editReply({ content: 'This giveaway data could not be found.' }).catch(console.error); }
                if (giveawayData.status !== 'running') { /* ... */ return interaction.editReply({ content: 'This giveaway is no longer running.' }).catch(console.error); }
                if (giveawayData.endTime <= Date.now()) { /* ... */ return interaction.editReply({ content: 'This giveaway has just ended!' }).catch(console.error); }
                if (!Array.isArray(giveawayData.entrants)) { giveawayData.entrants = []; }
                if (giveawayData.entrants.includes(userId)) { /* ... */ return interaction.editReply({ content: 'You have already entered this giveaway!' }).catch(console.error); }

                giveawayData.entrants.push(userId);
                await db.set(giveawayKey, giveawayData);
                await interaction.editReply({ content: '🎉 You have successfully entered the giveaway!' }).catch(console.error);
                console.log(`[Giveaway Button] Successfully processed entry for ${userId} on ${messageId}.`);

            } catch (error) {
                console.error(`[ButtonInteraction][Giveaway Entry Main Catch] Error for ${interaction.customId}:`, error);
                if (hasRepliedOrDeferred && !interaction.replied) {
                    await interaction.editReply({ content: 'An error occurred while processing your entry.' }).catch(console.error);
                }
            }
        }
        // --- REACTION ROLE BUTTON ---
        else if (interaction.customId.startsWith('rr-button_')) {
            const guildId = interaction.guild.id;
            const dbKey = `reactionrole_button_messages_${guildId}`;
            try {
                const guildConfigs = await db.get(dbKey) || [];
                const messageConfig = guildConfigs.find(mc => mc.messageId === interaction.message.id);
                if (!messageConfig) { return interaction.editReply({ content: 'This reaction role message is outdated.'}); }
                const buttonConfig = messageConfig.buttons.find(b => b.customId === interaction.customId);
                if (!buttonConfig) { return interaction.editReply({ content: 'This reaction role button is misconfigured.'}); }
                const roleId = buttonConfig.roleId;
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) { return interaction.editReply({ content: 'The associated role no longer exists.'}); }
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
                 if (hasRepliedOrDeferred && !interaction.replied) {
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