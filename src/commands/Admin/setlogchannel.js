// src/commands/Configuration/setlogchannel.js (or Admin/)
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlogchannel')
        .setDescription('Sets or clears the channel for specific log types.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Only server managers can set this
        .setDMPermission(false)
        .addStringOption(option =>
            option.setName('logtype')
                .setDescription('The type of log to configure.')
                .setRequired(true)
                .addChoices(
                    { name: 'Message Deletion Logs', value: 'delete_logs' },
                    // { name: 'Message Edit Logs', value: 'edit_logs' }, // Example for future
                    // { name: 'Member Join/Leave Logs', value: 'member_logs' } // Example for future
                ))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to send these logs to. Leave blank to clear.')
                .addChannelTypes(ChannelType.GuildText) // Only allow text channels
                .setRequired(false)), // Not required if clearing

    async execute(interaction, db) {
        const logType = interaction.options.getString('logtype');
        const logChannel = interaction.options.getChannel('channel');
        const guildId = interaction.guild.id;

        if (logChannel) {
            // Set the channel
            const dbKey = `logchannel_${logType}_${guildId}`;
            await db.set(dbKey, logChannel.id);

            const embed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('Log Channel Set')
                .setDescription(`Logs for **${logType.replace('_', ' ')}** will now be sent to ${logChannel}.`)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            // Clear the channel setting
            const dbKey = `logchannel_${logType}_${guildId}`;
            const existingChannelId = await db.get(dbKey);

            if (!existingChannelId) {
                return interaction.reply({ content: `No log channel was previously set for **${logType.replace('_', ' ')}**.`, ephemeral: true });
            }

            await db.delete(dbKey);
            const embed = new EmbedBuilder()
                .setColor(Colors.Orange)
                .setTitle('Log Channel Cleared')
                .setDescription(`Log channel for **${logType.replace('_', ' ')}** has been cleared. These logs will no longer be sent.`)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};