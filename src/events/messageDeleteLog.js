// src/events/messageDeleteLog.js
const { Events, EmbedBuilder, Colors, AuditLogEvent } = require('discord.js');

module.exports = {
    name: Events.MessageDelete,
    async execute(message, db) { // 'db' is passed from your main.js event loader
        if (!message.guild) return; // Ignore DMs
        if (message.partial) {
            // If the message is partial, we might not have author or content.
            // We can try to fetch it, but it might fail if the message is too old or already gone.
            // For now, we'll log what we have. You could add fetching logic here if desired.
            console.log(`[MessageDelete] A partial message was deleted in ${message.guild.name} - Channel ID: ${message.channel.id}, Message ID: ${message.id}. Content/author might be unavailable.`);
            // return; // Decide if you want to log partials or not. For now, let's proceed.
        }

        const guildId = message.guild.id;
        const logChannelId = await db.get(`logchannel_delete_logs_${guildId}`);

        if (!logChannelId) {
            return; // No log channel configured for this guild
        }

        const logChannel = message.guild.channels.cache.get(logChannelId);
        if (!logChannel) {
            console.warn(`[MessageDelete] Log channel ${logChannelId} not found in guild ${guildId}.`);
            // Optionally, delete the invalid setting from DB: await db.delete(`logchannel_delete_logs_${guildId}`);
            return;
        }

        // Try to determine who deleted the message using Audit Logs (requires View Audit Log permission)
        let executor = null;
        let executorTag = "Unknown (probably self-deleted)";
        try {
            const fetchedLogs = await message.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageDelete,
            });
            const deletionLog = fetchedLogs.entries.first();

            if (deletionLog) {
                const { executor: auditExecutor, target, createdTimestamp } = deletionLog;
                 // Check if the audit log entry is recent (within ~5 seconds) and targets the correct user
                if (target && target.id === (message.author ? message.author.id : null) && (Date.now() - createdTimestamp < 5000)) {
                    if (auditExecutor && auditExecutor.id !== (message.author ? message.author.id : null) && auditExecutor.id !== message.client.user.id) {
                        executor = auditExecutor;
                        executorTag = auditExecutor.tag;
                    } else if (auditExecutor && auditExecutor.id === (message.author ? message.author.id : null)) {
                        executorTag = "Self-deleted";
                    }
                    // If auditExecutor.id is the bot's ID, we'll handle that next
                }
            }
        } catch (error) {
            console.error('[MessageDelete] Error fetching audit logs:', error);
        }


        // Ignore if message author is the bot itself OR if the deleter (from audit log) is the bot
        if (message.author && message.author.bot && (!executor || executor.id === message.client.user.id)) {
            // This condition handles cases where the bot deletes its own message
            // and the audit log correctly identifies the bot as the executor.
            // It also handles cases where message.author is the bot and no reliable executor is found (assuming bot deleted it).
            // console.log(`[MessageDelete] Ignoring deletion of bot's own message by the bot or unknown.`);
            return;
        }
         // A more specific check: if executor is bot, and message author isn't bot, it means bot deleted user message (e.g. /clear)
        // This is usually handled by messageDeleteBulk or specific command logging.
        // For individual deletes, if bot is executor, we might want to log that the BOT deleted it.
        if (executor && executor.id === message.client.user.id && message.author && !message.author.bot) {
            executorTag = `${message.client.user.tag} (Bot Action)`;
        }


        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('Message Deleted')
            .setTimestamp();

        if (message.author) {
            embed.setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) });
            embed.addFields({ name: 'Author', value: `${message.author} (ID: ${message.author.id})`, inline: true });
        } else {
            embed.setAuthor({ name: 'Unknown Author' });
            embed.addFields({ name: 'Author', value: 'Could not determine author (message not cached).', inline: true });
        }

        embed.addFields(
            { name: 'Channel', value: `${message.channel} (ID: ${message.channel.id})`, inline: true },
            { name: 'Deleted By', value: executorTag, inline: true }
        );

        if (message.content) {
            embed.addFields({ name: 'Content', value: `\`\`\`\n${message.content.substring(0, 1020)}\n\`\`\`` }); // Max 1024 chars for field value
            if (message.content.length > 1020) {
                embed.setFooter({ text: 'Message content was truncated.'});
            }
        } else {
            embed.addFields({ name: 'Content', value: '*(Content not available - message may not have been cached)*' });
        }

        if (message.attachments.size > 0) {
            let attachmentList = '';
            message.attachments.forEach(att => {
                attachmentList += `[${att.name}](${att.url})\n`;
            });
            embed.addFields({ name: 'Attachments', value: attachmentList.substring(0,1024) });
        }

        try {
            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`[MessageDelete] Could not send log to channel ${logChannelId} in ${guildId}:`, error);
        }
    }
};