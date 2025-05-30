// src/commands/ban.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a specified user from the server.')
        .addUserOption(option => // Using the fluent builder
            option.setName('user')
                .setDescription('The user to ban.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('The reason for the ban.')
                .setRequired(false))
        .addIntegerOption(option => // For `deleteMessageSeconds`
            option.setName('deletedays')
                .setDescription('Number of days of messages to delete from the user (0-7). Default: 0')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers) // Discord-enforced permission
        .setDMPermission(false), // Typically, moderation commands are not for DMs

    async execute(interaction, db) { // Your standard execute signature
        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user'); // This can be null if user isn't in server
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const deleteDays = interaction.options.getInteger('deletedays') || 0; // Default to 0 days
        const deleteMessageSeconds = deleteDays * 24 * 60 * 60; // Convert days to seconds for the API

        if (!targetUser) {
            return interaction.reply({
                content: '`❌` Could not find the specified user.',
                ephemeral: true
            });
        }

        // Check if the bot can ban the member
        // 1. Is the target actually a member of the guild?
        if (!targetMember) {
             // User is not in the server, but we can still ban their ID to prevent rejoining
            try {
                await interaction.guild.members.ban(targetUser.id, { reason: reason, deleteMessageSeconds: deleteMessageSeconds });
                await interaction.reply({
                    content: `\`✅\` User **${targetUser.tag}** (ID: ${targetUser.id}) was not in the server but has been banned by ID.`,
                    ephemeral: true
                });

                // Public log embed (optional)
                const logEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle('User Banned (by ID)')
                    .addFields(
                        { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                        { name: 'Reason', value: reason }
                    )
                    .setTimestamp();
                // You might want to send this to a specific log channel
                // For now, sending to the command channel:
                await interaction.channel.send({ embeds: [logEmbed] }).catch(console.error);

                return;
            } catch (error) {
                console.error(`Error banning user by ID ${targetUser.id}:`, error);
                return interaction.reply({
                    content: `\`❌\` Failed to ban user **${targetUser.tag}** by ID. I might lack permissions or the user ID is invalid.`,
                    ephemeral: true
                });
            }
        }

        // 2. Check if the bot has permissions and role hierarchy to ban the targetMember
        if (!targetMember.bannable) {
            return interaction.reply({
                content: `\`❌\` I cannot ban **${targetMember.user.tag}**. They might have a higher role than me, or I lack the "Ban Members" permission.`,
                ephemeral: true
            });
        }

        // Optional: Check if the command executor has a higher role than the target
        if (interaction.member.roles.highest.position <= targetMember.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
             return interaction.reply({
                content: `\`❌\` You cannot ban **${targetMember.user.tag}** because their highest role is the same or higher than yours.`,
                ephemeral: true
            });
        }


        // Attempt to DM the user BEFORE banning
        let dmSent = false;
        try {
            await targetMember.send({
                content: `You have been banned from **${interaction.guild.name}** for the following reason: ${reason}`
            });
            dmSent = true;
        } catch (dmError) {
            console.log(`Could not DM user ${targetMember.user.tag} about their ban: ${dmError.message}`);
            // Don't stop the ban process if DM fails
        }

        // Perform the ban
        try {
            await interaction.guild.members.ban(targetMember.user.id, { reason: reason, deleteMessageSeconds: deleteMessageSeconds });

            let replyMessage = `\`✅\` **${targetMember.user.tag}** has been successfully banned!`;
            if (!dmSent) {
                replyMessage += ` (Could not send them a DM.)`;
            }
            await interaction.reply({
                content: replyMessage,
                ephemeral: true
            });

            // Public log embed (optional)
            const logEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('User Banned')
                .setThumbnail(targetMember.user.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${targetMember.user.tag} (${targetMember.id})`, inline: true },
                    { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();
            // You might want to send this to a specific log channel
            // For now, sending to the command channel:
            await interaction.channel.send({ embeds: [logEmbed] }).catch(console.error);

        } catch (error) {
            console.error(`Failed to ban ${targetMember.user.tag}:`, error);
            return interaction.reply({
                content: `\`❌\` Something went wrong while trying to ban the user. Please check console for details.`,
                ephemeral: true
            });
        }
    }
};