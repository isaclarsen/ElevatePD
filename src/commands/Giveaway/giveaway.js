// src/commands/Moderation/giveaway.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const ms = require('ms');
const { v4: uuidv4 } = require('uuid'); // Still here if needed for other unique IDs, though not primary for button ID now

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
    if (giveawayData.status !== 'running') {
        console.log(`[Giveaway End Function] Giveaway ${messageId} already ended or cancelled. Status: ${giveawayData.status}`);
        activeGiveaways.delete(messageId);
        return;
    }

    let channel;
    try {
        channel = await client.channels.fetch(giveawayData.channelId);
    } catch (channelError) {
        console.error(`[Giveaway End Function] Could not fetch channel ${giveawayData.channelId} for giveaway ${messageId}: ${channelError.message}`);
        await db.set(`${giveawayKey}.status`, 'error_channel_fetch_failed'); // Update status in DB
        activeGiveaways.delete(messageId);
        return;
    }
    if (!channel) {
        console.error(`[Giveaway End Function] Channel ${giveawayData.channelId} (from DB) not found for giveaway ${messageId}.`);
        await db.set(`${giveawayKey}.status`, 'error_channel_not_found'); // Update status in DB
        activeGiveaways.delete(messageId);
        return;
    }

    let messageToEdit;
    try {
        messageToEdit = await channel.messages.fetch(messageId);
    } catch (msgError) {
        console.error(`[Giveaway End Function] Could not fetch message ${messageId} to end giveaway: ${msgError.message}`);
        await db.set(`${giveawayKey}.status`, 'error_message_fetch_failed'); // Update status in DB
        activeGiveaways.delete(messageId);
        return;
    }

    const entrants = giveawayData.entrants || [];
    let winners = [];
    let winnerMentions = "No one entered the giveaway! 😢";

    if (entrants.length > 0) {
        if (entrants.length <= giveawayData.winnerCount) {
            winners = [...entrants]; // All entrants are winners
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
        .setTimestamp(giveawayData.endTime) // Show original end time
        .setFooter({ text: `Giveaway ID: ${messageId} | Ended` });

    const endedButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(giveawayData.buttonCustomId || `giveaway_entry_${messageId}`) // Use stored or reconstruct
            .setLabel('Giveaway Ended')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎉')
            .setDisabled(true)
    );

    try {
        await messageToEdit.edit({ embeds: [endedEmbed], components: [endedButtonRow] });
    } catch (editError) {
        console.error(`[Giveaway End Function] Error editing giveaway message ${messageId}: ${editError.message}`);
    }

    const announcementContent = winners.length > 0 ?
        `Congratulations ${winnerMentions}! You won the **${giveawayData.prize}** giveaway hosted by <@${giveawayData.hostId}>!` :
        `The giveaway for **${giveawayData.prize}** has ended, but there were no entries! 😕\nHosted by <@${giveawayData.hostId}>.`;

    await channel.send({
        content: `${announcementContent}\nGiveaway Link: ${messageToEdit.url}`
    }).catch(err => console.error(`[Giveaway End Function] Error sending winner/end announcement for ${messageId}: ${err.message}`));

    giveawayData.status = 'ended';
    giveawayData.winners = winners;
    await db.set(giveawayKey, giveawayData);
    activeGiveaways.delete(messageId);
    console.log(`[Giveaway End Function] Successfully ended giveaway ${messageId}. Winners: ${winners.join(', ')}`);
}

async function loadActiveGiveaways(client, db) {
    console.log('[Giveaway Loader] Loading active giveaways from database...');
    let giveawaysLoaded = 0;
    try {
        const allData = await db.all(); // Inefficient for large DBs, consider an index
        for (const entry of allData) {
            if (entry.id && entry.id.startsWith(`giveaway_`) && entry.value && entry.value.status === 'running') {
                const giveawayData = entry.value;
                const { guildId, messageId, endTime } = giveawayData;
                const remainingTime = endTime - Date.now();

                if (remainingTime <= 0) {
                    console.log(`[Giveaway Loader] Giveaway ${messageId} in guild ${guildId} already ended. Processing end...`);
                    // No await here, let it process in background
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
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) // Or ManageGuild, etc.
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Starts a new giveaway.')
                .addStringOption(option => option.setName('duration').setDescription('Duration (e.g., 10m, 1h, 2d). Max 60 days.').setRequired(true))
                .addIntegerOption(option => option.setName('winners').setDescription('Number of winners (1-20).').setRequired(true).setMinValue(1).setMaxValue(20))
                .addStringOption(option => option.setName('prize').setDescription('What the prize is.').setRequired(true))
                .addChannelOption(option => option.setName('channel').setDescription('Channel to host the giveaway in.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
        ),
    // Add other subcommands (edit, reroll, end) here later

    async execute(interaction, db) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'start') {
            await interaction.deferReply({ ephemeral: true });

            const durationStr = interaction.options.getString('duration');
            const winnerCount = interaction.options.getInteger('winners');
            const prize = interaction.options.getString('prize');
            const channel = interaction.options.getChannel('channel');
            const hostUser = interaction.user;
            const guildId = interaction.guild.id;

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
                .setCustomId(`giveaway_entry_placeholder`) // This is temporary, will be updated
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
                // Use the variable for logging, not a method on the builder
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
                    buttonCustomId: finalButtonCustomId // Use the variable here
                };

                const dbKey = `giveaway_${guildId}_${giveawayMessage.id}`;
                await db.set(dbKey, giveawayData);
                console.log(`[Giveaway Start] Saved giveaway data for ${giveawayMessage.id} to key: ${dbKey} with buttonId: ${giveawayData.buttonCustomId}`);

                const timeout = setTimeout(() => {
                    // Ensure endGiveaway is defined and callable
                    if (typeof endGiveaway === 'function') {
                        endGiveaway(interaction.client, guildId, giveawayMessage.id, db);
                    } else {
                        console.error("[Giveaway Start] CRITICAL: endGiveaway function is not defined when timeout fired!");
                    }
                }, durationMs);
                activeGiveaways.set(giveawayMessage.id, timeout);
                console.log(`[Giveaway Start] Timeout set for ${giveawayMessage.id} in ${ms(durationMs)}`);

                await interaction.editReply({ content: `\`✅\` Giveaway for **${prize}** started in ${channel}!\nIt will end in ${ms(durationMs, { long: true })}.` });

            } catch (error) {
                console.error('[Giveaway Start] Error during giveaway start process (FULL ERROR OBJECT):', error);
                if (giveawayMessage && !activeGiveaways.has(giveawayMessage.id)) {
                    // If a message was sent but timeout wasn't set (meaning setup failed mid-way)
                    await giveawayMessage.delete().catch(delErr => console.error("[Giveaway Start] Cleanup failed to delete giveaway message:", delErr));
                    console.log("[Giveaway Start] Cleaned up partially created giveaway message due to error.");
                }
                await interaction.editReply({ content: '`❌` Could not start the giveaway. Please check my console for detailed errors. Common issues are missing permissions in the target channel (Send Messages, Embed Links).' });
            }
        }
        // Handle other subcommands (reroll, edit, end) later
    },
    // Export functions and map to be used by main.js
    loadActiveGiveaways,
    endGiveaway,
    activeGiveaways
};