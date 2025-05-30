// src/commands/Moderation/clear.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Deletes a specified number of messages from the current channel.')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100). For more, run multiple times.') // Adjusted description due to 100 limit per call
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)) // Discord API can only bulk delete 100 at a time.
                                  // And messages older than 14 days can't be bulk deleted.
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Optional: Only delete messages from this user.')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false), // Cannot manage messages in DMs

    async execute(interaction, db) {
        // Permission check for the user executing the command (already handled by setDefaultMemberPermissions for visibility)
        // but good for an explicit check if you want to be extra sure or have complex logic.
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '`❌` You do not have permission to manage messages in this channel.',
                ephemeral: true,
            });
        }

        // Bot permission check
        if (!interaction.appPermissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: '`❌` I do not have permission to manage messages in this channel. Please grant me the "Manage Messages" permission.',
                ephemeral: true,
            });
        }

        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user'); // Optional user filter

        if (interaction.channel.type === ChannelType.DM) {
            return interaction.reply({ content: '`❌` I cannot delete messages in DMs.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true }); // Defer reply as fetching and deleting can take time

        let messagesToDelete;
        let deletedCount = 0;
        let totalFetched = 0;
        let attempts = 0; // To prevent infinite loops if messages are very old or filtered out

        try {
            // Fetch messages. We might need to fetch more than 'amount' if filtering by user.
            // The limit per fetch is 100.
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            totalFetched = messages.size;

            if (targetUser) {
                messagesToDelete = messages.filter(msg => msg.author.id === targetUser.id).first(amount);
            } else {
                messagesToDelete = messages.first(amount);
            }

            // Filter out messages older than 14 days as they cannot be bulk deleted
            const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            const youngMessages = messagesToDelete.filter(msg => msg.createdTimestamp > fourteenDaysAgo);

            if (youngMessages.length > 0) {
                const deletedResult = await interaction.channel.bulkDelete(youngMessages, true); // true to filter out old messages automatically
                deletedCount = deletedResult.size;
            }

            let replyMessage = `\`✅\` Successfully deleted ${deletedCount} message(s).`;
            if (targetUser) {
                replyMessage += ` from user ${targetUser.tag}`;
            }
            if (youngMessages.length < messagesToDelete.length) {
                replyMessage += ` (${messagesToDelete.length - youngMessages.length} older messages could not be bulk deleted.)`;
            }
             if (deletedCount < amount && !targetUser && totalFetched < amount) {
                replyMessage += ` (Fewer messages were available than requested.)`;
            } else if (deletedCount < amount && targetUser && youngMessages.filter(m=>m.author.id === targetUser.id).length < amount) {
                 replyMessage += ` (Fewer messages from ${targetUser.tag} were available or young enough.)`;
            }


            await interaction.editReply({ content: replyMessage });

            // Send a temporary confirmation to the channel that disappears
            const tempConfirm = await interaction.channel.send({
                content: `🗑️ Cleared ${deletedCount} message(s) by ${interaction.user.tag}.`
            });
            setTimeout(() => tempConfirm.delete().catch(console.error), 5000); // Delete after 5 seconds

        } catch (error) {
            console.error('Error during message clear:', error);
            if (error.code === 50034 && error.message.includes("older than 2 weeks")) {
                 await interaction.editReply({ content: '`❌` Failed to delete messages. Messages older than 14 days cannot be bulk deleted.' });
            } else if (error.code === 10008) { // Unknown message (often happens if messages are deleted by another process)
                 await interaction.editReply({ content: `\`⚠️\` Deleted ${deletedCount} message(s). Some messages may have already been deleted or were too old.` });
            }
            else {
                await interaction.editReply({ content: '`❌` An error occurred while trying to delete messages. I may lack permissions or the messages are too old.' });
            }
        }
    }
};