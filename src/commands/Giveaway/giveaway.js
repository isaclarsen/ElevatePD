// src/commands/Moderation/giveaway.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const ms = require('ms');
const { v4: uuidv4 } = require('uuid'); // Fallback, messageId is primary for button

const activeGiveaways = new Map(); // In-memory store for setTimeout IDs: Map<messageId, NodeJS.Timeout>

async function endGiveaway(client, guildId, messageId, db) {
    console.log(`[Giveaway End Function] Attempting to end giveaway: Guild ${guildId}, Message ${messageId}`);
    const giveawayKey = `giveaway_${guildId}_${messageId}`;
    const giveawayData = await db.get(giveawayKey);

    if (!giveawayData) {
        console.log(`[Giveaway End Function] Giveaway ${messageId} data not found in DB.`);
        activeGiveaways.delete(messageId);
        return;
    }
    // Allow ending even if status is error, but not if already ended/cancelled
    if (giveawayData.status === 'ended' || giveawayData.status === 'cancelled') {
        console.log(`[Giveaway End Function] Giveaway ${messageId} already processed. Status: ${giveawayData.status}`);
        activeGiveaways.delete(messageId); // Ensure timeout is cleared if somehow still present
        return;
    }

    let channel;
    try {
        channel = await client.channels.fetch(giveawayData.channelId);
    } catch (channelError) {
        console.error(`[Giveaway End Function] Could not fetch channel ${giveawayData.channelId} for giveaway ${messageId}: ${channelError.message}`);
        await db.set(`${giveawayKey}.status`, 'error_channel_fetch_failed');
        activeGiveaways.delete(messageId);
        return;
    }
    if (!channel) {
        console.error(`[Giveaway End Function] Channel ${giveawayData.channelId} (from DB) not found for giveaway ${messageId}.`);
        await db.set(`${giveawayKey}.status`, 'error_channel_not_found');
        activeGiveaways.delete(messageId);
        return;
    }

    let messageToEdit;
    try {
        messageToEdit = await channel.messages.fetch(messageId);
    } catch (msgError) {
        console.error(`[Giveaway End Function] Could not fetch message ${messageId} to end giveaway: ${msgError.message}`);
        await db.set(`${giveawayKey}.status`, 'error_message_fetch_failed');
        activeGiveaways.delete(messageId);
        return;
    }

    const entrants = giveawayData.entrants || [];
    let winners = [];
    let winnerMentions = "No one entered the giveaway! 😢";

    if (entrants.length > 0) {
        if (entrants.length <= giveawayData.winnerCount) {
            winners = [...entrants];
        } else {
            const shuffledEntrants = [...entrants].sort(() => 0.5 - Math.random());
            winners = shuffledEntrants.slice(0, giveawayData.winnerCount);
        }
        winnerMentions = winners.map(winnerId => `<@${winnerId}>`).join(', ');
    }

    const endedEmbed = new EmbedBuilder()
        .setTitle(`🎉 Giveaway Ended: ${giveawayData.prize} 🎉`)
        .setDescription(`**Winner(s):** ${winnerMentions}\n\nHosted by: <@${giveawayData.hostId}>\nEntries: ${entrants.length}`)
        .setColor(Colors.Red)
        .setTimestamp(giveawayData.endTime)
        .setFooter({ text: `Giveaway ID: ${messageId} | Ended` });

    const endedButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(giveawayData.buttonCustomId || `giveaway_entry_${messageId}`)
            .setLabel('Giveaway Ended')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎉')
            .setDisabled(true)
    );

    try {
        await messageToEdit.edit({ embeds: [endedEmbed], components: [endedButtonRow] });
    } catch (editError) {
        console.error(`[Giveaway End Function] Error editing giveaway message ${messageId}: ${editError.message}`);
        // Continue to announce if possible, message might be deleted
    }

    const announcementContent = winners.length > 0 ?
        `Congratulations ${winnerMentions}! You won the **${giveawayData.prize}** giveaway hosted by <@${giveawayData.hostId}>!` :
        `The giveaway for **${giveawayData.prize}** has ended, but there were no entries! 😕\nHosted by <@${giveawayData.hostId}>.`;

    await channel.send({
        content: `${announcementContent}\nGiveaway Link: ${messageToEdit ? messageToEdit.url : `(Original message possibly deleted: ${messageId})`}`
    }).catch(err => console.error(`[Giveaway End Function] Error sending winner/end announcement for ${messageId}: ${err.message}`));

    giveawayData.status = 'ended';
    giveawayData.winners = winners;
    await db.set(giveawayKey, giveawayData);
    activeGiveaways.delete(messageId); // Ensure timeout is cleared
    console.log(`[Giveaway End Function] Successfully ended giveaway ${messageId}. Winners: ${winners.join(', ')}`);
}

async function loadActiveGiveaways(client, db) {
    console.log('[Giveaway Loader] Loading active giveaways from database...');
    let giveawaysLoaded = 0;
    try {
        const allData = await db.all();
        for (const entry of allData) {
            if (entry.id && entry.id.startsWith(`giveaway_`) && entry.value && entry.value.status === 'running') {
                const giveawayData = entry.value;
                const { guildId, messageId, endTime } = giveawayData;
                const remainingTime = endTime - Date.now();

                if (remainingTime <= 0) {
                    console.log(`[Giveaway Loader] Giveaway ${messageId} in guild ${guildId} already ended. Processing end...`);
                    endGiveaway(client, guildId, messageId, db);
                } else {
                    console.log(`[Giveaway Loader] Resuming giveaway ${messageId} in guild ${guildId}. Ends in ${ms(remainingTime, { long: true })}`);
                    const timeout = setTimeout(() => {
                        endGiveaway(client, guildId, messageId, db);
                    }, remainingTime);
                    activeGiveaways.set(messageId, timeout);
                    giveawaysLoaded++;
                }
            }
        }
    } catch (error) {
        console.error("[Giveaway Loader] Error loading active giveaways:", error);
    }
    console.log(`[Giveaway Loader] Finished loading active giveaways. Resumed ${giveawaysLoaded} giveaways.`);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Manages giveaways in the server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Starts a new giveaway.')
                .addStringOption(option => option.setName('duration').setDescription('Duration (e.g., 10m, 1h, 2d). Max 60 days.').setRequired(true))
                .addIntegerOption(option => option.setName('winners').setDescription('Number of winners (1-20).').setRequired(true).setMinValue(1).setMaxValue(20))
                .addStringOption(option => option.setName('prize').setDescription('What the prize is.').setRequired(true))
                .addChannelOption(option => option.setName('channel').setDescription('Channel to host the giveaway in.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('Ends an active giveaway immediately.')
                .addStringOption(option => option.setName('message_id').setDescription('The message ID of the giveaway to end.').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edits an ongoing giveaway.')
                .addStringOption(option => option.setName('message_id').setDescription('The message ID of the giveaway to edit.').setRequired(true))
                .addStringOption(option => option.setName('new_duration').setDescription('New duration FROM NOW (e.g., 5m, 1h). Clears old duration.').setRequired(false))
                .addIntegerOption(option => option.setName('new_winners').setDescription('New number of winners (1-20).').setMinValue(1).setMaxValue(20).setRequired(false))
                .addStringOption(option => option.setName('new_prize').setDescription('New prize for the giveaway.').setRequired(false))
        ),
        // Add .addSubcommand for 'reroll' and 'delete' later

    async execute(interaction, db) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'start') {
            await interaction.deferReply({ ephemeral: true });

            const durationStr = interaction.options.getString('duration');
            const winnerCount = interaction.options.getInteger('winners');
            const prize = interaction.options.getString('prize');
            const channel = interaction.options.getChannel('channel');
            const hostUser = interaction.user;

            let durationMs;
            try {
                durationMs = ms(durationStr);
            } catch (e) {
                return interaction.editReply({ content: '`❌` Invalid duration format. Use like "10m", "1h", "2d".' });
            }

            if (!durationMs || durationMs <= 0) {
                return interaction.editReply({ content: '`❌` Duration must be a positive value.' });
            }
            const maxDurationMs = 60 * 24 * 60 * 60 * 1000; // 60 days
            if (durationMs > maxDurationMs) {
                return interaction.editReply({ content: '`❌` Maximum duration is 60 days.' });
            }

            const endTime = Date.now() + durationMs;
            const endTimeSeconds = Math.floor(endTime / 1000);

            const giveawayEmbed = new EmbedBuilder()
                .setTitle(`🎉 Giveaway: ${prize} 🎉`)
                .setDescription(`Click the button to enter!\nEnds: <t:${endTimeSeconds}:R> (<t:${endTimeSeconds}:F>)\nHosted by: ${hostUser}`)
                .addFields({ name: 'Winners', value: `${winnerCount}` })
                .setColor(Colors.Aqua)
                .setTimestamp(endTime)
                .setFooter({ text: `Giveaway ID will be message ID | Ends at` });

            const entryButton = new ButtonBuilder()
                .setCustomId(`giveaway_entry_placeholder`)
                .setLabel('Enter Giveaway')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎉');
            const row = new ActionRowBuilder().addComponents(entryButton);

            let giveawayMessage;
            try {
                giveawayMessage = await channel.send({ embeds: [giveawayEmbed], components: [row] });
                console.log(`[Giveaway Start] Sent initial message ${giveawayMessage.id} to channel ${channel.id}`);

                const finalButtonCustomId = `giveaway_entry_${giveawayMessage.id}`;
                entryButton.setCustomId(finalButtonCustomId);
                const updatedRow = new ActionRowBuilder().addComponents(entryButton);
                await giveawayMessage.edit({ components: [updatedRow] });
                console.log(`[Giveaway Start] Edited message ${giveawayMessage.id} with final button ID: ${finalButtonCustomId}`);

                const giveawayData = {
                    messageId: giveawayMessage.id,
                    channelId: channel.id,
                    guildId: guildId,
                    prize: prize,
                    winnerCount: winnerCount,
                    endTime: endTime,
                    hostId: hostUser.id,
                    entrants: [],
                    status: 'running',
                    winners: [],
                    buttonCustomId: finalButtonCustomId
                };

                const dbKey = `giveaway_${guildId}_${giveawayMessage.id}`;
                await db.set(dbKey, giveawayData);
                console.log(`[Giveaway Start] Saved giveaway data for ${giveawayMessage.id} to key: ${dbKey} with buttonId: ${giveawayData.buttonCustomId}`);

                const timeout = setTimeout(() => {
                    if (typeof endGiveaway === 'function') {
                        endGiveaway(interaction.client, guildId, giveawayMessage.id, db);
                    } else {
                        console.error("[Giveaway Start Timeout] CRITICAL: endGiveaway function is not defined!");
                    }
                }, durationMs);
                activeGiveaways.set(giveawayMessage.id, timeout);
                console.log(`[Giveaway Start] Timeout set for ${giveawayMessage.id} in ${ms(durationMs)}`);

                await interaction.editReply({ content: `\`✅\` Giveaway for **${prize}** started in ${channel}!\nIt will end in ${ms(durationMs, { long: true })}.` });

            } catch (error) {
                console.error('[Giveaway Start] Error during giveaway start process (FULL ERROR OBJECT):', error);
                if (giveawayMessage && !activeGiveaways.has(giveawayMessage.id)) {
                    await giveawayMessage.delete().catch(delErr => console.error("[Giveaway Start] Cleanup failed to delete giveaway message:", delErr));
                    console.log("[Giveaway Start] Cleaned up partially created giveaway message due to error.");
                }
                await interaction.editReply({ content: '`❌` Could not start the giveaway. Please check my console for detailed errors. Common issues are missing permissions in the target channel (Send Messages, Embed Links).' });
            }
        } else if (subcommand === 'end') {
            await interaction.deferReply({ ephemeral: true });
            const messageIdToEnd = interaction.options.getString('message_id');

            const giveawayKey = `giveaway_${guildId}_${messageIdToEnd}`;
            const giveawayData = await db.get(giveawayKey);

            if (!giveawayData) {
                return interaction.editReply({ content: `\`❌\` No giveaway found with Message ID: \`${messageIdToEnd}\`.` });
            }

            if (giveawayData.status !== 'running') {
                return interaction.editReply({ content: `\`❌\` Giveaway \`${messageIdToEnd}\` is not currently running. Status: ${giveawayData.status}.` });
            }

            const existingTimeout = activeGiveaways.get(messageIdToEnd);
            if (existingTimeout) {
                clearTimeout(existingTimeout);
                activeGiveaways.delete(messageIdToEnd);
                console.log(`[Giveaway End Command] Cleared scheduled timeout for ${messageIdToEnd}.`);
            } else {
                console.log(`[Giveaway End Command] No active timeout found for ${messageIdToEnd}. It might have already fired or an issue with loading timers on restart.`);
            }
            
            // Call endGiveaway to process winners, update message & DB
            await endGiveaway(interaction.client, guildId, messageIdToEnd, db);
            await interaction.editReply({ content: `\`✅\` Giveaway \`${messageIdToEnd}\` has been ended successfully.` });

        } else if (subcommand === 'edit') {
            await interaction.deferReply({ ephemeral: true });
            const messageIdToEdit = interaction.options.getString('message_id');
            const newDurationStr = interaction.options.getString('new_duration');
            const newWinnerCount = interaction.options.getInteger('new_winners');
            const newPrize = interaction.options.getString('new_prize');

            if (!newDurationStr && (newWinnerCount === null || newWinnerCount === undefined) && !newPrize) {
                return interaction.editReply({ content: '`💡` You need to provide at least one thing to change (duration, winners, or prize).' });
            }

            const giveawayKey = `giveaway_${guildId}_${messageIdToEdit}`;
            let giveawayData = await db.get(giveawayKey);

            if (!giveawayData) {
                return interaction.editReply({ content: `\`❌\` No giveaway found with Message ID: \`${messageIdToEdit}\`.` });
            }

            if (giveawayData.status !== 'running') {
                return interaction.editReply({ content: `\`❌\` Giveaway \`${messageIdToEdit}\` is not currently running. Cannot edit.` });
            }

            let changesMade = [];
            let newEndTime = giveawayData.endTime; // Keep original unless new duration is set

            if (newDurationStr) {
                let newDurationMs;
                try {
                    newDurationMs = ms(newDurationStr);
                } catch (e) {
                    return interaction.editReply({ content: '`❌` Invalid new duration format. Use like "10m", "1h", "2d".' });
                }
                if (!newDurationMs || newDurationMs <= 0) {
                    return interaction.editReply({ content: '`❌` New duration must be a positive value.' });
                }
                const maxDurationMs = 60 * 24 * 60 * 60 * 1000;
                if (newDurationMs > maxDurationMs) {
                    return interaction.editReply({ content: '`❌` Maximum new duration is 60 days (from now).' });
                }

                newEndTime = Date.now() + newDurationMs;
                giveawayData.endTime = newEndTime;

                const existingTimeout = activeGiveaways.get(messageIdToEdit);
                if (existingTimeout) clearTimeout(existingTimeout);
                
                const newTimeout = setTimeout(() => {
                     if (typeof endGiveaway === 'function') {
                        endGiveaway(interaction.client, guildId, messageIdToEdit, db);
                    } else {
                        console.error("[Giveaway Edit Timeout] CRITICAL: endGiveaway function is not defined!");
                    }
                }, newDurationMs);
                activeGiveaways.set(messageIdToEdit, newTimeout);
                changesMade.push(`Duration updated to end in ${ms(newDurationMs, { long: true })} from now`);
                console.log(`[Giveaway Edit] Updated duration for ${messageIdToEdit}. New timeout set.`);
            }

            if (newWinnerCount !== null && newWinnerCount !== undefined) {
                if (newWinnerCount < 1 || newWinnerCount > 20) {
                     return interaction.editReply({ content: '`❌` New winner count must be between 1 and 20.' });
                }
                giveawayData.winnerCount = newWinnerCount;
                changesMade.push(`Winner count set to ${newWinnerCount}`);
            }

            if (newPrize) {
                giveawayData.prize = newPrize;
                changesMade.push(`Prize changed to "${newPrize}"`);
            }

            const channel = await interaction.client.channels.cache.get(giveawayData.channelId);
            if (!channel) {
                return interaction.editReply({ content: '`❌` Could not find the giveaway channel to update the message.' });
            }
            let giveawayMessageToUpdate; // Renamed to avoid conflict with outer scope if any
            try {
                giveawayMessageToUpdate = await channel.messages.fetch(messageIdToEdit);
            } catch (e) {
                 return interaction.editReply({ content: '`❌` Could not fetch the original giveaway message to update it.' });
            }

            const newEndTimeSeconds = Math.floor(giveawayData.endTime / 1000);
            const updatedEmbed = new EmbedBuilder()
                .setTitle(`🎉 Giveaway: ${giveawayData.prize} 🎉`)
                .setDescription(`Click the button to enter!\nEnds: <t:${newEndTimeSeconds}:R> (<t:${newEndTimeSeconds}:F>)\nHosted by: <@${giveawayData.hostId}>`)
                .addFields({ name: 'Winners', value: `${giveawayData.winnerCount}` })
                .setColor(Colors.Aqua)
                .setTimestamp(giveawayData.endTime)
                .setFooter({ text: `Giveaway ID: ${messageIdToEdit} | Ends at` });

            const entryButton = new ButtonBuilder()
                .setCustomId(giveawayData.buttonCustomId || `giveaway_entry_${messageIdToEdit}`)
                .setLabel('Enter Giveaway')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎉');
            const row = new ActionRowBuilder().addComponents(entryButton);

            try {
                await giveawayMessageToUpdate.edit({ embeds: [updatedEmbed], components: [row] });
                await db.set(giveawayKey, giveawayData);
                console.log(`[Giveaway Edit] Giveaway ${messageIdToEdit} updated in DB and message edited.`);
                await interaction.editReply({ content: `\`✅\` Giveaway \`${messageIdToEdit}\` has been updated:\n- ${changesMade.join('\n- ')}` });
            } catch (error) {
                console.error(`[Giveaway Edit] Error updating giveaway ${messageIdToEdit}:`, error);
                await interaction.editReply({ content: '`❌` An error occurred while trying to update the giveaway message or save data.' });
            }
        }
    },
    loadActiveGiveaways,
    endGiveaway,
    activeGiveaways
};