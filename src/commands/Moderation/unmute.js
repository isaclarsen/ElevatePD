// src/commands/Moderation/unmute.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Removes a timeout (unmutes) from a specified user.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to unmute.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('The reason for the unmute.')
                .setRequired(false))
        // Users need "Moderate Members" permission to remove timeouts as well.
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    async execute(interaction, db) {
        // Optional: Add a stricter permission check here if needed, beyond ModerateMembers
        // if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        //     return interaction.reply({ /* ... */ });
        // }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided for unmute.';

        if (!targetUser) {
            return interaction.reply({
                content: '`❌` Could not find the specified user.',
                ephemeral: true
            });
        }

        // You typically wouldn't unmute yourself or the bot as this command is for removing existing timeouts.
        // These checks might be less relevant here but harmless.
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '`❌` You cannot unmute yourself (this command is for removing existing timeouts).',
                ephemeral: true
            });
        }
        if (targetUser.id === interaction.client.user.id) {
            return interaction.reply({
                content: '`❌` I cannot be muted or unmuted in this way.',
                ephemeral: true
            });
        }

        if (!targetMember) {
            return interaction.reply({
                content: `\`❌\` User **${targetUser.tag}** is not currently a member of this server.`,
                ephemeral: true
            });
        }

        // Check if member is actually timed out
        if (!targetMember.isCommunicationDisabled()) {
            return interaction.reply({
                content: `\`❌\` **${targetMember.user.tag}** is not currently muted (timed out).`,
                ephemeral: true
            });
        }

        // Check if the bot can moderate the member (needed to remove timeout)
        if (!targetMember.moderatable) { // Even to remove a timeout, the bot needs to be able to moderate them
             return interaction.reply({
                content: `\`❌\` I cannot unmute **${targetMember.user.tag}**. They might have a higher role than me, or I lack the "Moderate Members" permission.`,
                ephemeral: true
            });
        }

        // Check hierarchy: user executing command vs target user
        // (Often, unmuting might have slightly laxer hierarchy checks by some server standards,
        // but for consistency, keeping it is safer. Server owner bypasses.)
        if (interaction.guild.ownerId !== interaction.user.id &&
            interaction.member.roles.highest.position <= targetMember.roles.highest.position) {
             return interaction.reply({
                content: `\`❌\` You cannot unmute **${targetMember.user.tag}** because their highest role is the same or higher than yours (and you are not the server owner). This is a hierarchy check.`,
                ephemeral: true
            });
        }


        // Attempt to DM the user (optional for unmute, but can be good practice)
        let dmSent = false;
        try {
            await targetMember.send({
                content: `You have been unmuted in **${interaction.guild.name}**. Reason: ${reason}`
            }).catch(dmError => { // Catch DM errors specifically
                console.log(`Could not DM user ${targetMember.user.tag} about their unmute: ${dmError.message}`);
                // dmSent remains false
            });
            dmSent = true; // Set to true only if send() doesn't throw immediately
        } catch (error) { // Catch other unexpected errors during DM attempt phase
             console.log(`Unexpected error trying to DM user ${targetMember.user.tag} about their unmute: ${error.message}`);
        }


        try {
            // To unmute, pass null as the duration to timeout()
            await targetMember.timeout(null, reason);

            let replyMessage = `\`✅\` **${targetMember.user.tag}** has been successfully unmuted!`;
            if (dmSent) {
                replyMessage += ` (They have been notified via DM.)`;
            } else {
                 replyMessage += ` (Could not send them a DM notification.)`;
            }
            await interaction.reply({
                content: replyMessage,
                ephemeral: true
            });

            const logEmbed = new EmbedBuilder()
                .setColor(Colors.Green) // Green for unmute
                .setTitle('User Unmuted (Timeout Removed)')
                .setThumbnail(targetMember.user.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${targetMember.user.tag}`, inline: true },
                    { name: 'Unmuted by', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();
            await interaction.channel.send({ embeds: [logEmbed] }).catch(console.error);

        } catch (error) {
            console.error(`Failed to unmute ${targetMember.user.tag}:`, error);
            if (error.code === 50013) { // Missing Permissions
                 return interaction.reply({
                    content: `\`❌\` I do not have sufficient permissions to unmute this user. Please check my "Moderate Members" permission and role hierarchy.`,
                    ephemeral: true
                });
            }
            return interaction.reply({
                content: `\`❌\` Something went wrong while trying to unmute the user. Please check console for details.`,
                ephemeral: true
            });
        }
    }
};