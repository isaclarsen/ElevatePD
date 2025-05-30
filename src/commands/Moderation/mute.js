// src/commands/Moderation/mute.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');
const ms = require('ms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mutes (timeouts) a specified user for a duration.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to mute.')
                .setRequired(true))
        .addStringOption(option => // Duration as a string, e.g., "10m", "1h", "7d"
            option.setName('duration')
                .setDescription('Duration of the mute (e.g., 10m, 1h, 3d). Max 28 days.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('The reason for the mute.')
                .setRequired(false))
        // Users need "Moderate Members" permission to timeout others.
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    async execute(interaction, db) {
        // Optional: Add a stricter permission check here if needed, beyond ModerateMembers
        // if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        //     return interaction.reply({ /* ... */ });
        // }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');
        const durationString = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        if (!targetUser) {
            return interaction.reply({
                content: '`❌` Could not find the specified user.',
                ephemeral: true
            });
        }

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '`❌` You cannot mute yourself.',
                ephemeral: true
            });
        }
        if (targetUser.id === interaction.client.user.id) {
            return interaction.reply({
                content: '`❌` I cannot mute myself.',
                ephemeral: true
            });
        }

        if (!targetMember) {
            return interaction.reply({
                content: `\`❌\` User **${targetUser.tag}** is not currently a member of this server.`,
                ephemeral: true
            });
        }

        // Check if member is already timed out
        if (targetMember.isCommunicationDisabled()) {
            const currentTimeoutEnd = targetMember.communicationDisabledUntil;
            return interaction.reply({
                content: `\`❌\` **${targetMember.user.tag}** is already muted. Their timeout ends <t:${Math.floor(currentTimeoutEnd.getTime() / 1000)}:R>.`,
                ephemeral: true
            });
        }

        let durationMs;
        try {
            durationMs = ms(durationString);
        } catch (error) {
            return interaction.reply({
                content: '`❌` Invalid duration format. Please use formats like "10m", "1h", "3d".',
                ephemeral: true
            });
        }

        if (!durationMs || durationMs <= 0) {
            return interaction.reply({
                content: '`❌` Duration must be a positive value.',
                ephemeral: true
            });
        }

        // Discord API limit for timeouts is 28 days
        const maxDurationMs = 28 * 24 * 60 * 60 * 1000;
        if (durationMs > maxDurationMs) {
            return interaction.reply({
                content: '`❌` The maximum mute duration is 28 days.',
                ephemeral: true
            });
        }


        // Check if the bot can moderate the member
        // This checks if the bot has ModerateMembers perm AND bot's highest role > target's highest role
        if (!targetMember.moderatable) {
             return interaction.reply({
                content: `\`❌\` I cannot mute **${targetMember.user.tag}**. They might have a higher role than me, or I lack the "Moderate Members" permission.`,
                ephemeral: true
            });
        }


        // Check hierarchy: user executing command vs target user
        if (interaction.guild.ownerId !== interaction.user.id &&
            interaction.member.roles.highest.position <= targetMember.roles.highest.position) {
             return interaction.reply({
                content: `\`❌\` You cannot mute **${targetMember.user.tag}** because their highest role is the same or higher than yours.`,
                ephemeral: true
            });
        }


        let dmSent = false;
        try {
            await targetMember.send({
                content: `You have been muted in **${interaction.guild.name}** for **${ms(durationMs, { long: true })}** for the following reason: ${reason}`
            });
            dmSent = true;
        } catch (dmError) {
            console.log(`Could not DM user ${targetMember.user.tag} about their mute: ${dmError.message}`);
        }

        try {
            await targetMember.timeout(durationMs, reason);

            let replyMessage = `\`✅\` **${targetMember.user.tag}** has been successfully muted for **${ms(durationMs, { long: true })}**!`;
            if (!dmSent) {
                replyMessage += ` (Could not send them a DM.)`;
            }
            await interaction.reply({
                content: replyMessage,
                ephemeral: true
            });

            const logEmbed = new EmbedBuilder()
                .setColor(Colors.Orange) // Using Orange for mute
                .setTitle('User Muted (Timed Out)')
                .setThumbnail(targetMember.user.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${targetMember.user.tag}`, inline: true },
                    { name: 'Muted by', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Duration', value: ms(durationMs, { long: true }), inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();
            await interaction.channel.send({ embeds: [logEmbed] }).catch(console.error);

        } catch (error) {
            console.error(`Failed to mute ${targetMember.user.tag}:`, error);
            if (error.code === 50013) { // Missing Permissions
                 return interaction.reply({
                    content: `\`❌\` I do not have sufficient permissions to mute this user. Please check my "Moderate Members" permission and role hierarchy.`,
                    ephemeral: true
                });
            }
            return interaction.reply({
                content: `\`❌\` Something went wrong while trying to mute the user. Please check console for details.`,
                ephemeral: true
            });
        }
    }
};