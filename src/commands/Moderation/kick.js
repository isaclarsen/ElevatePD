// src/commands/Moderation/kick.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kicks a specified user from the server.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to kick.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('The reason for the kick.')
                .setRequired(false))
        // This is the primary way Discord will filter who can use/see the command.
        // Users need the "Kick Members" permission in the server/channel.
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setDMPermission(false),

    async execute(interaction, db) {
        // The setDefaultMemberPermissions above should handle the basic permission check.
        // If you want an ADDITIONAL layer of checking, for example, requiring
        // Administrator permission OR the KickMembers permission, you can add it here.
        // However, for just "KickMembers", the above is usually enough.

        // Example of an additional check (optional):
        // if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        //     return interaction.reply({
        //         content: '`❌` You lack the necessary permissions (Kick Members or Administrator) to use this command.',
        //         ephemeral: true
        //     });
        // }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        if (!targetUser) {
            return interaction.reply({
                content: '`❌` Could not find the specified user.',
                ephemeral: true
            });
        }

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '`❌` You cannot kick yourself.',
                ephemeral: true
            });
        }
        if (targetUser.id === interaction.client.user.id) {
            return interaction.reply({
                content: '`❌` I cannot kick myself.',
                ephemeral: true
            });
        }

        if (!targetMember) {
            return interaction.reply({
                content: `\`❌\` User **${targetUser.tag}** is not currently a member of this server.`,
                ephemeral: true
            });
        }

        if (!targetMember.kickable) {
            return interaction.reply({
                content: `\`❌\` I cannot kick **${targetMember.user.tag}**. They might have a higher role than me, or I lack the "Kick Members" permission (check my bot's roles).`,
                ephemeral: true
            });
        }

        // Check hierarchy: user executing command vs target user
        // Server owner bypasses this hierarchy check.
        if (interaction.guild.ownerId !== interaction.user.id &&
            interaction.member.roles.highest.position <= targetMember.roles.highest.position) {
             return interaction.reply({
                content: `\`❌\` You cannot kick **${targetMember.user.tag}** because their highest role is the same or higher than yours.`,
                ephemeral: true
            });
        }

        let dmSent = false;
        try {
            await targetMember.send({
                content: `You have been kicked from **${interaction.guild.name}** for the following reason: ${reason}`
            });
            dmSent = true;
        } catch (dmError) {
            console.log(`Could not DM user ${targetMember.user.tag} about their kick: ${dmError.message}`);
        }

        try {
            await targetMember.kick(reason);

            let replyMessage = `\`✅\` **${targetMember.user.tag}** has been successfully kicked!`;
            if (!dmSent) {
                replyMessage += ` (Could not send them a DM.)`;
            }
            await interaction.reply({
                content: replyMessage,
                ephemeral: true
            });

            const logEmbed = new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('User Kicked')
                .setThumbnail(targetMember.user.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${targetMember.user.tag}`, inline: true },
                    { name: 'Kicked by', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();
            await interaction.channel.send({ embeds: [logEmbed] }).catch(console.error);

        } catch (error) {
            console.error(`Failed to kick ${targetMember.user.tag}:`, error);
            return interaction.reply({
                content: `\`❌\` Something went wrong while trying to kick the user. Please check console for details.`,
                ephemeral: true
            });
        }
    }
};