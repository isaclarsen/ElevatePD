// src/commands/Information/warnings.js (or Moderation/, or a new User/ category)
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Checks your own warnings in this server.')
        // No options needed for checking own warnings
        // No default member permissions needed, as anyone should be able to check their own.
        .setDMPermission(false), // Warnings are guild-specific

    async execute(interaction, db) {
        const targetUser = interaction.user; // The user who ran the command
        const guildId = interaction.guild.id;

        const dbKey = `warnings_${guildId}_${targetUser.id}`;
        const userWarnings = await db.get(dbKey) || [];

        if (userWarnings.length === 0) {
            return interaction.reply({
                content: '`✅` You currently have no warnings in this server.',
                ephemeral: true // Keep it private
            });
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.Blue) // Or any color you prefer for informational embeds
            .setTitle(`Your Warnings in ${interaction.guild.name}`)
            .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
            .setDescription(`You have a total of **${userWarnings.length}** warning(s).`)
            .setTimestamp();

        // Discord embed fields have limits, so we might need pagination for many warnings.
        // For now, let's display up to 25 (max fields in an embed).
        // If you expect users to have more, you'd implement a pagination system (more complex).

        const warningsToShow = userWarnings.slice(0, 25); // Show the most recent 25 if there are many, or all if fewer.
                                                        // Or use .slice(-25) to show the LATEST 25 if the array order is oldest first.
                                                        // Since we push to the array, current order is oldest first.

        for (const [index, warn] of warningsToShow.entries()) {
            // Try to fetch moderator tag if stored, otherwise use ID
            const moderatorDisplay = warn.moderatorTag || `<@${warn.moderatorId}>` || 'Unknown Moderator';
            const timestampSeconds = Math.floor(warn.timestamp / 1000);

            embed.addFields({
                name: `Warning #${index + 1} (ID: \`${warn.warnId}\`)`,
                value: `> **Moderator:** ${moderatorDisplay}\n` +
                       `> **Date:** <t:${timestampSeconds}:F> (<t:${timestampSeconds}:R>)\n` +
                       `> **Reason:** ${warn.reason || 'N/A'}`
            });
        }

        if (userWarnings.length > 25) {
            embed.setFooter({ text: `Displaying ${warningsToShow.length} of ${userWarnings.length} warnings. For a full list, please contact a moderator.` });
            // Later, you could implement buttons for pagination here.
        } else {
            embed.setFooter({ text: `Warning history for ${targetUser.tag}` });
        }


        try {
            await interaction.reply({
                embeds: [embed],
                ephemeral: true // Important to keep this private to the user
            });
        } catch (error) {
            console.error("Error sending warnings embed:", error);
            await interaction.reply({ content: "Could not retrieve your warnings at this time.", ephemeral: true });
        }
    }
};