// src/commands/reactionrole-embed.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js'); // Added Colors

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionrole-embed')
        .setDescription('Creates an embed with buttons for reaction roles.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setDMPermission(false)
        .addStringOption(option => option.setName('title').setDescription('The title of the embed.').setRequired(true))
        .addStringOption(option => option.setName('description').setDescription('The description of the embed.').setRequired(true))
        // Add options for up to 5 buttons/roles
        .addRoleOption(option => option.setName('role1').setDescription('The first role.').setRequired(true))
        .addStringOption(option => option.setName('label1').setDescription('Label for the first button.').setRequired(true))
        .addStringOption(option => option.setName('emoji1').setDescription('Emoji for the first button (optional).'))
        .addRoleOption(option => option.setName('role2').setDescription('The second role (optional).'))
        .addStringOption(option => option.setName('label2').setDescription('Label for the second button (optional).'))
        .addStringOption(option => option.setName('emoji2').setDescription('Emoji for the second button (optional).'))
        .addRoleOption(option => option.setName('role3').setDescription('The third role (optional).'))
        .addStringOption(option => option.setName('label3').setDescription('Label for the third button (optional).'))
        .addStringOption(option => option.setName('emoji3').setDescription('Emoji for the third button (optional).'))
        .addRoleOption(option => option.setName('role4').setDescription('The fourth role (optional).'))
        .addStringOption(option => option.setName('label4').setDescription('Label for the fourth button (optional).'))
        .addStringOption(option => option.setName('emoji4').setDescription('Emoji for the fourth button (optional).'))
        .addRoleOption(option => option.setName('role5').setDescription('The fifth role (optional).'))
        .addStringOption(option => option.setName('label5').setDescription('Label for the fifth button (optional).'))
        .addStringOption(option => option.setName('emoji5').setDescription('Emoji for the fifth button (optional).')),

    async execute(interaction, db) {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const guildId = interaction.guild.id;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(Colors.Blue) // MODIFIED: Set color to Blue
            .setAuthor({ name: 'Elevate', iconURL: 'https://cdn.discordapp.com/attachments/1313509092630855722/1375503075485417703/Elevate_121.png?ex=6831ec90&is=68309b10&hm=a7de64ee3b3f67cde516b6c2bd7967418e8c5ca8e9f7d3efbdcf20afb08b0718&' })
            .setFooter({ text: 'Elevate PD - 2025' }) // ADDED: Footer
            .setThumbnail('https://cdn.discordapp.com/attachments/1313509092630855722/1375503075883749428/Elevate_PNG2.png?ex=6831ec90&is=68309b10&hm=c68a1b123dbd1d9e1e468f6d2aafcddaefcbf7d812bc8e353a7881a6e75c82b6&')

        const buttonsConfig = [];
        const actionRow = new ActionRowBuilder();
        let buttonsAdded = 0;

        for (let i = 1; i <= 5; i++) {
            const role = interaction.options.getRole(`role${i}`);
            const label = interaction.options.getString(`label${i}`);
            const emoji = interaction.options.getString(`emoji${i}`);

            if (role && label) {
                if (buttonsAdded >= 5) {
                    await interaction.reply({ content: 'You can add a maximum of 5 buttons per embed message using this command.', ephemeral: true });
                    return;
                }
                const customId = `rr-button_${role.id}`;

                const button = new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel(label)
                    .setStyle(ButtonStyle.Secondary); // Default style, you can change this too

                if (emoji) {
                    try {
                        button.setEmoji(emoji);
                    } catch (error) {
                        console.warn(`[ReactionRoleEmbed] Invalid emoji provided for button ${i}: ${emoji}. Error: ${error.message}`);
                        // Optionally inform user, or just proceed without emoji
                        // You could send a followup if the interaction is already replied to, or editReply
                        // For now, just logging it.
                    }
                }

                actionRow.addComponents(button);
                buttonsConfig.push({
                    customId: customId,
                    roleId: role.id,
                    label: label
                });
                buttonsAdded++;
            } else if (role || label) {
                await interaction.reply({ content: `For button ${i}, both role and label must be provided if either is present.`, ephemeral: true });
                return;
            }
        }

        if (buttonsAdded === 0) {
            await interaction.reply({ content: 'You must configure at least one button and role.', ephemeral: true });
            return;
        }

        try {
            // Defer reply if processing might take time, though sending a message is usually fast
            // await interaction.deferReply({ ephemeral: true });

            const message = await interaction.channel.send({ embeds: [embed], components: [actionRow] });

            const dbKey = `reactionrole_button_messages_${guildId}`;
            let guildConfigs = await db.get(dbKey) || [];

            guildConfigs.push({
                messageId: message.id,
                channelId: message.channel.id,
                embedDetails: { title, description, color: Colors.Blue, footer: 'Elevate PD - 2025' }, // Store new details
                buttons: buttonsConfig
            });

            await db.set(dbKey, guildConfigs);

            // If deferred: await interaction.editReply({ content: 'Reaction role embed with buttons created successfully!', ephemeral: true });
            await interaction.reply({ content: 'Reaction role embed with buttons created successfully!', ephemeral: true });


        } catch (error) {
            console.error('Error creating reaction role embed:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: 'An error occurred while creating the reaction role embed.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'An error occurred while creating the reaction role embed.', ephemeral: true });
            }
        }
    },
};