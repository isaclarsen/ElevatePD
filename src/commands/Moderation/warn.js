// src/commands/Moderation/warn.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
// We might need 'ms' if we decide to auto-mute for a duration later
// const ms = require('ms');

// Configuration for auto-action
const AUTO_BAN_THRESHOLD = 2; // Number of warnings to trigger a ban
const AUTO_BAN_REASON_PREFIX = "Automatic ban: Reached warning threshold.";
const AUTO_BAN_DELETE_DAYS = 0; // Days of messages to delete for auto-ban

module.exports = {
    data: new SlashCommandBuilder()
        // ... (your existing warn command data) ...
        .setName('warn')
        .setDescription('Manages user warnings.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Adds a warning to a user.')
                .addUserOption(option => option.setName('user').setDescription('The user to warn.').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('The reason for the warning.').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Removes a specific warning from a user by its ID.')
                .addUserOption(option => option.setName('user').setDescription('The user whose warning to remove.').setRequired(true))
                .addStringOption(option => option.setName('warn_id').setDescription('The ID of the warning to remove.').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clears all warnings for a user.')
                .addUserOption(option => option.setName('user').setDescription('The user whose warnings to clear.').setRequired(true))),

    async execute(interaction, db) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');
        const guildId = interaction.guild.id;
        let targetMember = interaction.guild.members.cache.get(targetUser.id); // Use let for potential re-fetch

        if (!targetUser) {
            return interaction.reply({ content: '`❌` Invalid user specified.', ephemeral: true });
        }
        // For 'add', 'remove' we need the member, for 'clear' user might not be in server but we can still clear DB
        if (!targetMember && (subcommand === 'add' || subcommand === 'remove')) {
            return interaction.reply({ content: `\`❌\` User **${targetUser.tag}** is not currently in this server. Warnings can only be added/removed for server members.`, ephemeral: true });
        }

        const dbKey = `warnings_${guildId}_${targetUser.id}`;

        // --- ADD WARNING ---
        if (subcommand === 'add') {
            const reason = interaction.options.getString('reason') || 'No reason provided.';

            if (targetUser.id === interaction.user.id) { /* ... self warn check ... */ }
            if (targetUser.id === interaction.client.user.id) { /* ... bot warn check ... */ }
            if (targetMember && interaction.guild.ownerId !== interaction.user.id && interaction.member.roles.highest.position <= targetMember.roles.highest.position) { /* ... hierarchy check ... */ }

            const warnId = uuidv4();
            const newWarning = {
                warnId: warnId,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                timestamp: Date.now(),
                reason: reason
            };

            let userWarnings = await db.get(dbKey) || [];
            userWarnings.push(newWarning);
            await db.set(dbKey, userWarnings);

            await interaction.reply({
                content: `\`✅\` **${targetUser.tag}** has been warned. They now have ${userWarnings.length} warning(s). (ID: \`${warnId}\`)`,
                ephemeral: true
            });

            if (targetMember) {
                try { /* ... DM user ... */
                    await targetMember.send({
                        content: `You have received a warning in **${interaction.guild.name}**.\n**Reason:** ${reason}\n**Warning ID:** \`${warnId}\``
                    });
                } catch (dmError) {
                    console.log(`Could not DM user ${targetUser.tag} about their warning: ${dmError.message}`);
                    await interaction.followUp({ content: '_(Could not DM the user about this warning.)_', ephemeral: true });
                }
            }

            const warnLogEmbed = new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('User Warned')
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${targetUser.tag}`, inline: true },
                    { name: 'Warned by', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Total Warnings', value: `${userWarnings.length}`, inline: true },
                    { name: 'Reason', value: reason },
                    { name: 'Warning ID', value: `\`${warnId}\`` }
                )
                .setTimestamp();
            await interaction.channel.send({ embeds: [warnLogEmbed] }).catch(console.error);

            // --- AUTO-BAN LOGIC ---
            if (userWarnings.length >= AUTO_BAN_THRESHOLD) {
                await interaction.followUp({ content: `ℹ️ **${targetUser.tag}** has reached ${userWarnings.length} warnings and will be automatically banned.`, ephemeral: true });

                const autoBanReason = `${AUTO_BAN_REASON_PREFIX} (Last warn reason: ${reason})`;
                const deleteMessageSeconds = AUTO_BAN_DELETE_DAYS * 24 * 60 * 60;

                // Ensure member object is fresh, especially if DM took time
                if (targetMember) targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);


                if (targetMember && !targetMember.bannable) {
                    console.log(`[AutoBan] Could not ban ${targetUser.tag}: Not bannable by the bot.`);
                    const autoBanFailEmbed = new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setTitle('Automatic Ban Failed')
                        .setDescription(`Attempted to auto-ban **${targetUser.tag}** for reaching ${userWarnings.length} warnings, but I cannot ban them (likely due to role hierarchy or missing Ban Members permission for the bot). Please review manually.`)
                        .setTimestamp();
                    await interaction.channel.send({ embeds: [autoBanFailEmbed] });
                    return;
                }

                // DM before auto-ban
                if (targetMember) {
                    try {
                        await targetMember.send(`You have been automatically banned from **${interaction.guild.name}** for reaching ${userWarnings.length} warnings. The final warning was for: "${reason}".`);
                    } catch (dmError) {
                        console.log(`[AutoBan] Could not DM ${targetUser.tag} about auto-ban.`);
                    }
                }


                try {
                    await interaction.guild.members.ban(targetUser.id, {
                        reason: autoBanReason,
                        deleteMessageSeconds: deleteMessageSeconds
                    });

                    const autoBanLogEmbed = new EmbedBuilder()
                        .setColor(Colors.DarkRed)
                        .setTitle('User Automatically Banned')
                        .setThumbnail(targetUser.displayAvatarURL())
                        .addFields(
                            { name: 'User', value: `${targetUser.tag}`, inline: true },
                            { name: 'Trigger', value: `Reached ${userWarnings.length} warnings`, inline: true },
                            { name: 'Reason', value: autoBanReason },
                            { name: 'Action By', value: `${interaction.client.user.tag} (Automatic)`}
                        )
                        .setTimestamp();
                    await interaction.channel.send({ embeds: [autoBanLogEmbed] });

                    // Optionally, clear warnings after auto-ban if that's your policy
                    // await db.delete(dbKey);
                    // console.log(`[AutoBan] Cleared warnings for ${targetUser.tag} after auto-ban.`);

                } catch (banError) {
                    console.error(`[AutoBan] Failed to auto-ban ${targetUser.tag}:`, banError);
                    const autoBanErrorEmbed = new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setTitle('Automatic Ban Error')
                        .setDescription(`An error occurred while trying to auto-ban **${targetUser.tag}**. Please check my console logs.\nError: ${banError.message}`)
                        .setTimestamp();
                    await interaction.channel.send({ embeds: [autoBanErrorEmbed] });
                }
            }
        }

        // --- REMOVE WARNING ---
        else if (subcommand === 'remove') {
            const warnIdToRemove = interaction.options.getString('warn_id');
            let userWarnings = await db.get(dbKey) || [];

            if (userWarnings.length === 0) {
                return interaction.reply({ content: `\`❌\` **${targetUser.tag}** has no warnings to remove.`, ephemeral: true });
            }

            const initialLength = userWarnings.length;
            userWarnings = userWarnings.filter(warn => warn.warnId !== warnIdToRemove);

            if (userWarnings.length === initialLength) {
                return interaction.reply({ content: `\`❌\` Warning ID \`${warnIdToRemove}\` not found for **${targetUser.tag}**.`, ephemeral: true });
            }

            await db.set(dbKey, userWarnings);
            await interaction.reply({
                content: `\`✅\` Warning ID \`${warnIdToRemove}\` has been removed from **${targetUser.tag}**. They now have ${userWarnings.length} warning(s).`,
                ephemeral: true
            });

            // Public log
             const logEmbed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('Warning Removed')
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${targetUser.tag}`, inline: true },
                    { name: 'Removed by', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Removed ID', value: `\`${warnIdToRemove}\``, inline: true },
                    { name: 'Remaining Warnings', value: `${userWarnings.length}`, inline: true }
                )
                .setTimestamp();
            await interaction.channel.send({ embeds: [logEmbed] }).catch(console.error);
        }

        // --- CLEAR WARNINGS ---
        else if (subcommand === 'clear') {
            const userWarnings = await db.get(dbKey) || [];
            if (userWarnings.length === 0) {
                return interaction.reply({ content: `\`❌\` **${targetUser.tag}** already has no warnings.`, ephemeral: true });
            }

            await db.delete(dbKey); // Or db.set(dbKey, []) if you prefer to keep an empty array
            await interaction.reply({
                content: `\`✅\` All warnings for **${targetUser.tag}** have been cleared.`,
                ephemeral: true
            });

            // Public log
            const logEmbed = new EmbedBuilder()
                .setColor(Colors.Aqua)
                .setTitle('All Warnings Cleared')
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${targetUser.tag}`, inline: true },
                    { name: 'Cleared by', value: `${interaction.user.tag}`, inline: true },
                    { name: 'Warnings Cleared', value: `${userWarnings.length}`, inline: true }
                )
                .setTimestamp();
            await interaction.channel.send({ embeds: [logEmbed] }).catch(console.error);
        }
    }
};