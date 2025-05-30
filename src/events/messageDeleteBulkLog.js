// src/events/messageDeleteBulkLog.js
const { Events, EmbedBuilder, Colors, AuditLogEvent } = require('discord.js');

module.exports = {
    name: Events.MessageDeleteBulk,
    async execute(messages, channel, db) { // messages is a Collection, channel is the channel object
        if (!channel.guild) return;

        const guildId = channel.guild.id;
        const logChannelId = await db.get(`logchannel_delete_logs_${guildId}`);

        if (!logChannelId) {
            return; // No log channel configured
        }

        const logChannel = channel.guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            console.warn(`[MessageDeleteBulk] Log channel ${logChannelId} not found in guild ${guildId}.`);
            return;
        }

        // Try to determine who deleted the messages
        let executorTag = "Unknown (Bulk Action)";
        try {
            const fetchedLogs = await channel.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageBulkDelete, // Note the different AuditLogEvent type
            });
            const deletionLog = fetchedLogs.entries.first();

            // Check if the audit log entry is recent (within ~10 seconds for bulk) and for this channel
            if (deletionLog && deletionLog.extra && deletionLog.extra.channel.id === channel.id && (Date.now() - deletionLog.createdTimestamp < 10000)) {
                const { executor } = deletionLog;
                if (executor) {
                    executorTag = executor.tag;
                }
            }
        } catch (error) {
            console.error('[MessageDeleteBulk] Error fetching audit logs:', error);
        }


        const embed = new EmbedBuilder()
            .setColor(Colors.DarkRed)
            .setTitle('Messages Bulk Deleted')
            .addFields(
                { name: 'Channel', value: `${channel} (ID: ${channel.id})` },
                { name: 'Count', value: `${messages.size} messages` },
                { name: 'Deleted By', value: executorTag }
            )
            .setTimestamp();

        // For bulk deletes, message content is usually not available in the event.
        // You could create a text file with message IDs and authors if you want more detail,
        // but that adds complexity. For now, a summary is provided.

        let description = `**${messages.size} messages were deleted in ${channel} by ${executorTag}.**\n\n`;
        let count = 0;
        for (const msg of messages.values()) { // Iterate over the collection
            if (count < 15) { // Limit how many individual messages we list to keep embed clean
                description += `> ${msg.author ? msg.author.tag : 'Unknown Author'}: "${msg.content ? msg.content.substring(0,50) + (msg.content.length > 50 ? '...' : '') : '(No content)'}" (ID: ${msg.id})\n`;
                count++;
            } else if (count === 15) {
                description += `> ...and more.\n`;
                count++;
            }
        }
        if (description.length > 4090) description = description.substring(0,4090) + "..."; // Embed description limit
        embed.setDescription(description);


        try {
            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`[MessageDeleteBulk] Could not send log to channel ${logChannelId} in ${guildId}:`, error);
        }
    }
};