// src/commands/Tickets/ticket.js
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    OverwriteType
} = require('discord.js');

// --- Helper: Generate Ticket Channel Name ---
async function generateTicketChannelName(guild, userId, db) {
    const user = await guild.client.users.fetch(userId).catch(() => null);
    const username = user ? user.username.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20) : 'user'; // Sanitize username

    const counterKey = `ticket_counter_${guild.id}`;
    let ticketNumber = (await db.get(counterKey) || 0) + 1;
    await db.set(counterKey, ticketNumber);
    return `ticket-${String(ticketNumber).padStart(4, '0')}-${username}`;
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Manages the ticket system.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // For setup
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Sets up the ticket creation panel in a channel.')
                .addChannelOption(option =>
                    option.setName('panel_channel')
                        .setDescription('The channel where users can create tickets.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('support_role')
                        .setDescription('The role that will have access to tickets.')
                        .setRequired(true))
                .addChannelOption(option => // Optional category
                    option.setName('category')
                        .setDescription('Optional: Category where new ticket channels will be created.')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('panel_title')
                        .setDescription('Optional: Custom title for the ticket panel embed.')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('panel_description')
                        .setDescription('Optional: Custom description for the ticket panel embed.')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('button_label')
                        .setDescription('Optional: Custom label for the create ticket button.')
                        .setRequired(false))
        ),
    // Add subcommands for 'close', 'add_user', 'remove_user' later

    async execute(interaction, db) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild; // Get guild object

        if (subcommand === 'setup') {
            await interaction.deferReply({ ephemeral: true });

            const panelChannel = interaction.options.getChannel('panel_channel');
            const supportRole = interaction.options.getRole('support_role');
            const categoryChannel = interaction.options.getChannel('category'); // Optional
            const panelTitle = interaction.options.getString('panel_title') || 'Create a Support Ticket';
            const panelDescription = interaction.options.getString('panel_description') || 'Click the button below to open a new support ticket. Please describe your issue clearly.';
            const buttonLabel = interaction.options.getString('button_label') || 'Create Ticket';

            if (!panelChannel || panelChannel.type !== ChannelType.GuildText) {
                return interaction.editReply({ content: '`❌` Invalid panel channel. Please select a text channel.' });
            }
            if (!supportRole) {
                return interaction.editReply({ content: '`❌` You must specify a support role.' });
            }

            // Check bot permissions for the panel channel
            const botPermissionsInPanelChannel = panelChannel.permissionsFor(interaction.guild.members.me);
            if (!botPermissionsInPanelChannel.has(PermissionFlagsBits.SendMessages) || !botPermissionsInPanelChannel.has(PermissionFlagsBits.EmbedLinks)) {
                return interaction.editReply({ content: `\`❌\` I need "Send Messages" and "Embed Links" permissions in ${panelChannel} to set up the panel.` });
            }
            // Check bot permissions globally (for creating channels, etc.)
            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                 return interaction.editReply({ content: '`❌` I need the global "Manage Channels" permission to create ticket channels.' });
            }


            const panelEmbed = new EmbedBuilder()
                .setTitle(panelTitle)
                .setDescription(panelDescription)
                .setColor(Colors.Blue) // Or your bot's theme color
                .setFooter({ text: `${guild.name} Support System` });

            const createTicketButton = new ButtonBuilder()
                .setCustomId('create_ticket_button') // Generic ID for the panel button
                .setLabel(buttonLabel)
                .setStyle(ButtonStyle.Success)
                .setEmoji('📩'); // Envelope emoji or similar

            const row = new ActionRowBuilder().addComponents(createTicketButton);

            try {
                const panelMessage = await panelChannel.send({ embeds: [panelEmbed], components: [row] });

                const setupData = {
                    guildId: guild.id,
                    panelChannelId: panelChannel.id,
                    panelMessageId: panelMessage.id, // Store the ID of the message containing the button
                    supportRoleId: supportRole.id,
                    ticketCategoryId: categoryChannel ? categoryChannel.id : null,
                    ticketCounter: 0, // Initialize counter
                    // transcriptsChannelId: null // For later
                };
                await db.set(`ticket_setup_${guild.id}`, setupData);

                await interaction.editReply({ content: `\`✅\` Ticket panel successfully created in ${panelChannel}!\nSupport Role: ${supportRole}` });

            } catch (error) {
                console.error('[Ticket Setup] Error creating ticket panel:', error);
                await interaction.editReply({ content: '`❌` Failed to create the ticket panel. Please ensure I have permissions to send messages and embeds in the selected channel.' });
            }
        }
        // Handle other ticket subcommands later
    }
};
module.exports.generateTicketChannelName = generateTicketChannelName;