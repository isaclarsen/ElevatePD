// src/commands/Tickets/ticket.js
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require('discord.js');

// Helper: Generate Ticket Channel Name (can now include category)
async function generateTicketChannelName(guild, userId, categoryName, db) {
    const user = await guild.client.users.fetch(userId).catch(() => null);
    const username = user ? user.username.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 15) || 'user' : 'user';
    const categoryPrefix = categoryName ? categoryName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) + '-' : '';

    const counterKey = `ticket_counter_${guild.id}`;
    let ticketNumber = (await db.get(counterKey) || 0) + 1;
    await db.set(counterKey, ticketNumber);
    return `${categoryPrefix}ticket-${String(ticketNumber).padStart(4, '0')}-${username.toLowerCase()}`.substring(0,100);
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Manages the ticket system.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Sets up the ticket creation panel with category buttons.')
                // --- REQUIRED OPTIONS FIRST ---
                .addChannelOption(option => // 1. panel_channel (REQUIRED)
                    option.setName('panel_channel')
                        .setDescription('The channel where the ticket panel will be sent.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addRoleOption(option => // 2. support_role (REQUIRED)
                    option.setName('support_role')
                        .setDescription('The role that will have access to tickets.')
                        .setRequired(true))
                .addStringOption(option => // 3. button1_label (REQUIRED)
                    option.setName('button1_label')
                        .setDescription('Label for the first ticket category button.')
                        .setRequired(true))
                .addStringOption(option => // 4. button1_category_name (REQUIRED)
                    option.setName('button1_category_name')
                        .setDescription('Internal category name for button 1.')
                        .setRequired(true))
                // --- OPTIONAL OPTIONS NEXT ---
                .addChannelOption(option => // 5. ticket_category_parent (OPTIONAL)
                    option.setName('ticket_category_parent')
                        .setDescription('Optional: Category for new ticket channels.')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false))
                .addStringOption(option => // 6. panel_title (OPTIONAL)
                    option.setName('panel_title')
                        .setDescription('Optional: Title for the ticket panel embed.')
                        .setRequired(false))
                .addStringOption(option => // 7. panel_description (OPTIONAL)
                    option.setName('panel_description')
                        .setDescription('Optional: Description for the panel embed.')
                        .setRequired(false))
                .addStringOption(option => // 8. button1_emoji (OPTIONAL)
                    option.setName('button1_emoji')
                        .setDescription('Optional: Emoji for the first button.')
                        .setRequired(false))
                // Button 2 (All Optional)
                .addStringOption(option => option.setName('button2_label').setDescription('Label for the second ticket category button.').setRequired(false))
                .addStringOption(option => option.setName('button2_category_name').setDescription('Internal category name for button 2.').setRequired(false))
                .addStringOption(option => option.setName('button2_emoji').setDescription('Optional: Emoji for the second button.').setRequired(false))
                // Button 3 (All Optional)
                .addStringOption(option => option.setName('button3_label').setDescription('Label for the third ticket category button.').setRequired(false))
                .addStringOption(option => option.setName('button3_category_name').setDescription('Internal category name for button 3.').setRequired(false))
                .addStringOption(option => option.setName('button3_emoji').setDescription('Optional: Emoji for the third button.').setRequired(false))
        )
        .addSubcommand(subcommand => // Keep your delete subcommand
            subcommand
                .setName('delete')
                .setDescription('Permanently deletes a ticket channel.')
                .addChannelOption(option =>
                    option.setName('ticket_channel')
                        .setDescription('The ticket channel to delete.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
        ),

    async execute(interaction, db) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;
        const guildId = guild.id;

        if (subcommand === 'setup') {
            await interaction.deferReply({ ephemeral: true });

            const panelChannel = interaction.options.getChannel('panel_channel');
            const supportRole = interaction.options.getRole('support_role');
            const ticketCategoryParent = interaction.options.getChannel('ticket_category_parent');
            const panelTitle = interaction.options.getString('panel_title') || 'Open a Support Ticket';
            const panelDescription = interaction.options.getString('panel_description') || 'Please select a category below to create a new support ticket.';

            if (!panelChannel || panelChannel.type !== ChannelType.GuildText) { /* ... error handling ... */ }
            if (!supportRole) { /* ... error handling ... */ }
            // ... (bot permission checks for panel channel and ManageChannels globally) ...
            const botPermissionsInPanelChannel = panelChannel.permissionsFor(interaction.guild.members.me);
            if (!botPermissionsInPanelChannel.has(PermissionFlagsBits.SendMessages) || !botPermissionsInPanelChannel.has(PermissionFlagsBits.EmbedLinks)) {
                return interaction.editReply({ content: `\`❌\` I need "Send Messages" and "Embed Links" permissions in ${panelChannel} to set up the panel.` });
            }
            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                 return interaction.editReply({ content: '`❌` I need the global "Manage Channels" permission to create ticket channels.' });
            }


            const panelEmbed = new EmbedBuilder()
                .setTitle(panelTitle)
                .setDescription(panelDescription)
                .setAuthor({ name: 'Elevate', iconURL: 'https://cdn.discordapp.com/attachments/1313509092630855722/1375503075485417703/Elevate_121.png?ex=6831ec90&is=68309b10&hm=a7de64ee3b3f67cde516b6c2bd7967418e8c5ca8e9f7d3efbdcf20afb08b0718&' })
                .setColor(Colors.Blue)
                .setThumbnail('https://cdn.discordapp.com/attachments/1313509092630855722/1375503075883749428/Elevate_PNG2.png?ex=6831ec90&is=68309b10&hm=c68a1b123dbd1d9e1e468f6d2aafcddaefcbf7d812bc8e353a7881a6e75c82b6&')
                .setFooter({ text: `${guild.name} Support System` });

            const actionRow = new ActionRowBuilder();
            const buttonConfigs = []; // To store in DB

            // Process up to 3 buttons (expand if you added more options)
            for (let i = 1; i <= 3; i++) {
                const label = interaction.options.getString(`button${i}_label`);
                const categoryName = interaction.options.getString(`button${i}_category_name`);
                const emoji = interaction.options.getString(`button${i}_emoji`);

                if (label && categoryName) { // Both label and category name are required for a button
                    // Sanitize categoryName for customId or use index
                    const categoryIdPart = categoryName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').substring(0, 20) || `cat${i}`;
                    const buttonCustomId = `create_ticket_${categoryIdPart}`; // Example: create_ticket_general_support

                    const button = new ButtonBuilder()
                        .setCustomId(buttonCustomId)
                        .setLabel(label)
                        .setStyle(ButtonStyle.Primary); // Or Secondary
                    if (emoji) {
                        try { button.setEmoji(emoji); }
                        catch (e) { console.warn(`[Ticket Setup] Invalid emoji for button ${i}: ${emoji}`); }
                    }
                    actionRow.addComponents(button);
                    buttonConfigs.push({
                        label: label,
                        categoryName: categoryName, // Store the user-friendly category name
                        emoji: emoji || null,
                        customId: buttonCustomId // Store the generated customId
                    });
                } else if (label || categoryName) {
                    // If one is provided but not the other
                    return interaction.editReply({ content: `\`❌\` For button ${i}, you must provide both a label and a category name.` });
                }
            }

            if (actionRow.components.length === 0) {
                return interaction.editReply({ content: '`❌\` You must configure at least one ticket category button.' });
            }

            try {
                const panelMessage = await panelChannel.send({ embeds: [panelEmbed], components: [actionRow] });

                const setupData = {
                    guildId: guild.id,
                    panelChannelId: panelChannel.id,
                    panelMessageId: panelMessage.id,
                    supportRoleId: supportRole.id,
                    ticketCategoryIdParent: ticketCategoryParent ? ticketCategoryParent.id : null,
                    buttons: buttonConfigs, // Store the array of button configurations
                    // ticketCounter is now managed by generateTicketChannelName
                };
                await db.set(`ticket_setup_${guild.id}`, setupData);
                console.log(`[Ticket Setup] Panel created in ${panelChannel.name}. Message ID: ${panelMessage.id}. Support Role: ${supportRole.name}. Buttons: ${buttonConfigs.length}`);
                await interaction.editReply({ content: `\`✅\` Ticket panel with ${buttonConfigs.length} category button(s) successfully created in ${panelChannel}!` });

            } catch (error) {
                console.error('[Ticket Setup] Error creating ticket panel:', error);
                await interaction.editReply({ content: '`❌` Failed to create the ticket panel.' });
            }

        } else if (subcommand === 'delete') {
            // --- DEFER REPLY FOR DELETE SUBCOMMAND ---
            await interaction.deferReply({ ephemeral: true });
            console.log(`[Ticket Delete SC] User ${interaction.user.tag} initiated /ticket delete.`);

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                console.log(`[Ticket Delete SC] User ${interaction.user.tag} lacks ManageChannels permission.`);
                return interaction.editReply({ content: '`❌` You need the "Manage Channels" permission to delete tickets.' });
            }

            const channelToDelete = interaction.options.getChannel('ticket_channel');
            console.log(`[Ticket Delete SC] Attempting to delete channel: ${channelToDelete ? channelToDelete.name : 'N/A'} (ID: ${channelToDelete ? channelToDelete.id : 'N/A'})`);


            if (!channelToDelete || channelToDelete.type !== ChannelType.GuildText) { // Ensure it's a text channel
                console.log(`[Ticket Delete SC] Invalid or non-text channel specified: ${channelToDelete ? channelToDelete.id : 'None'}`);
                return interaction.editReply({ content: '`❌` Please specify a valid text channel to delete.' });
            }

            const ticketDataKey = `ticket_data_${guildId}_${channelToDelete.id}`;
            const ticketData = await db.get(ticketDataKey);
            console.log(`[Ticket Delete SC] Fetched ticket data for key ${ticketDataKey}. Data found: ${!!ticketData}`);


            if (!ticketData) {
                // It's possible the channel exists but isn't in our DB as a ticket, or was already cleaned.
                // We can still attempt to delete the channel if the user has perms.
                console.log(`[Ticket Delete SC] No ticket data found in DB for ${channelToDelete.name}. Attempting direct deletion if user has perms.`);
                 try {
                    await channelToDelete.delete(`Ticket channel deleted by ${interaction.user.tag} via /ticket delete (no DB record found).`);
                    console.log(`[Ticket Delete SC] Channel ${channelToDelete.name} (ID: ${channelToDelete.id}) deleted directly by ${interaction.user.tag}.`);
                    return interaction.editReply({ content: `\`✅\` Channel **${channelToDelete.name}** has been deleted. (No prior ticket record found in my database).` });
                } catch (directDeleteError) {
                    console.error(`[Ticket Delete SC] Error directly deleting channel ${channelToDelete.id} (no DB record):`, directDeleteError);
                     if (directDeleteError.code === 10003) { // Unknown Channel
                        return interaction.editReply({ content: `\`❌\` Channel **${channelToDelete.name}** could not be found or was already deleted.` });
                    } else if (directDeleteError.code === 50013) { // Missing Permissions for bot
                        return interaction.editReply({ content: `\`❌\` I do not have permission to delete the channel **${channelToDelete.name}**. Please check my "Manage Channels" permission.` });
                    }
                    return interaction.editReply({ content: '`❌` An error occurred while trying to delete the channel (no DB record).' });
                }
            }

            // If ticketData exists, proceed with normal deletion and DB cleanup
            if (ticketData.status !== 'closed' && ticketData.status !== 'closed_channel_deleted') {
                 console.log(`[Ticket Delete SC] Warning: Deleting ticket ${channelToDelete.id} which is not marked as closed (status: ${ticketData.status}). Proceeding...`);
            }

            try {
                await channelToDelete.delete(`Ticket deleted by ${interaction.user.tag} (ID: ${interaction.user.id})`);
                console.log(`[Ticket Delete SC] Channel ${channelToDelete.name} (ID: ${channelToDelete.id}) deleted by ${interaction.user.tag}.`);

                await db.delete(ticketDataKey);
                console.log(`[Ticket Delete SC] Database entry for ${ticketDataKey} removed.`);

                // Optional: Log to a mod-log channel (implement setup for this first)
                // ...

                await interaction.editReply({ content: `\`✅\` Ticket channel **${channelToDelete.name}** and its data have been successfully deleted.` });

            } catch (error) {
                console.error(`[Ticket Delete SC] Error deleting ticket channel ${channelToDelete.id}:`, error);
                if (error.code === 10003) { // Unknown Channel
                    await interaction.editReply({ content: `\`❌\` Channel **${channelToDelete.name}** could not be found or was already deleted.` });
                    if (ticketData) await db.delete(ticketDataKey); // Still attempt DB cleanup
                } else if (error.code === 50013) { // Missing Permissions for bot
                     await interaction.editReply({ content: `\`❌\` I do not have permission to delete the channel **${channelToDelete.name}**. Please check my "Manage Channels" permission.`});
                }
                else {
                    await interaction.editReply({ content: '`❌` An error occurred while trying to delete the ticket channel.' });
                }
            }
        }
    },
};

// --- EXPORT THE HELPER FUNCTION ---
module.exports.generateTicketChannelName = generateTicketChannelName;