// src/commands/reactionrole.js
const { SlashCommandBuilder, PermissionFlagsBits, InteractionResponseFlags } = require('discord.js');

module.exports = { // <--- This is the object being exported
    data: new SlashCommandBuilder() // <--- This is the 'data' property
        .setName('reactionrole')     // <--- This provides the 'name'
        .setDescription('Sets up a reaction role on a message.')
        .addStringOption(option =>
            option.setName('messageid')
                .setDescription('The ID of the message to attach the reaction role to.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('The emoji to use for the reaction.')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to assign upon reaction.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setDMPermission(false),

    async execute(interaction, db) {
        // ... your command logic here
        const messageId = interaction.options.getString('messageid');
        const emoji = interaction.options.getString('emoji');
        const role = interaction.options.getRole('role');
        const guildId = interaction.guild.id;

        // (Rest of the execute function from the previous guide)
        // For brevity, I'm not pasting the whole execute function again here,
        // but ensure it's complete as per the guide.
        // Make sure this placeholder is replaced with the actual logic:
        try {
            const targetMessage = await interaction.channel.messages.fetch(messageId);
            if (!targetMessage) {
                return interaction.reply({ content: 'Could not find a message with that ID in this channel.', ephemeral: true });
            }
            try {
                await targetMessage.react(emoji);
            } catch (error) {
                console.error("Error reacting with emoji:", error);
                return interaction.reply({ content: `Failed to react with the emoji "${emoji}". Is it a valid emoji the bot can access?`, ephemeral: true });
            }
            const dbKey = `reactionrole_configs_${guildId}`;
            let configs = await db.get(dbKey) || [];
            const existingConfig = configs.find(c => c.messageId === messageId && c.emoji === emoji);
            if (existingConfig) {
                if (existingConfig.roleId === role.id) {
                     return interaction.reply({ content: `This emoji (${emoji}) on this message is already set up for the ${role.name} role.`, flags: [InteractionResponseFlags.Ephemeral] });
                }
                existingConfig.roleId = role.id;
            } else {
                configs.push({ messageId: messageId, emoji: emoji, roleId: role.id });
            }
            await db.set(dbKey, configs);
            await interaction.reply({ content: `Reaction role set up! Users reacting with ${emoji} on message ${messageId} will get the ${role.name} role.`, ephemeral: true });

        } catch (error) {
            console.error('Error setting up reaction role:', error);
            if (error.code === 10008) { // Unknown Message
                 return interaction.reply({ content: 'Could not find a message with that ID in this channel.', ephemeral: true });
            }
            return interaction.reply({ content: 'An error occurred while setting up the reaction role.', ephemeral: true });
        }
    },
};