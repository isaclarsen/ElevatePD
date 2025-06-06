// src/commands/reactionrole-embed.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');
const { v4: uuidv4 } = require('uuid'); // For unique button IDs

// src/commands/reactionrole-embed.js
// ...
module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionrole-embed')
        .setDescription('Creates a structured embed for reaction roles (Dyno style).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setDMPermission(false)
        // --- REQUIRED OPTIONS FIRST ---
        .addStringOption(option =>
            option.setName('title')
                .setDescription('The main title (e.g., "Enhance your experience!").')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('notice_text')
                .setDescription('Text for the "Important Notice" section.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('main_text')
                .setDescription('Main paragraph text. Use Discord markdown for emphasis (e.g., **bold**).')
                .setRequired(true))
        .addRoleOption(option => // For Button 1
            option.setName('role1')
                .setDescription('The first role.')
                .setRequired(true))
        .addStringOption(option => // For Button 1
            option.setName('label1')
                .setDescription('Label for the first button.')
                .setRequired(true))
        // --- OPTIONAL OPTIONS NEXT ---
        .addStringOption(option => // Optional Emoji for Button 1
            option.setName('emoji1')
                .setDescription('Emoji for the first button (optional).')
                .setRequired(false))
        // Button 2 (All Optional)
        .addRoleOption(option => option.setName('role2').setDescription('The second role.').setRequired(false))
        .addStringOption(option => option.setName('label2').setDescription('Label for the second button.').setRequired(false))
        .addStringOption(option => option.setName('emoji2').setDescription('Emoji for the second button.').setRequired(false))
        // Button 3 (All Optional)
        .addRoleOption(option => option.setName('role3').setDescription('The third role.').setRequired(false))
        .addStringOption(option => option.setName('label3').setDescription('Label for the third button.').setRequired(false))
        .addStringOption(option => option.setName('emoji3').setDescription('Emoji for the third button.').setRequired(false))
        // Button 4 (All Optional)
        .addRoleOption(option => option.setName('role4').setDescription('The fourth role.').setRequired(false))
        .addStringOption(option => option.setName('label4').setDescription('Label for the fourth button.').setRequired(false))
        .addStringOption(option => option.setName('emoji4').setDescription('Emoji for the fourth button.').setRequired(false))
        // Button 5 (All Optional)
        .addRoleOption(option => option.setName('role5').setDescription('The fifth role.').setRequired(false))
        .addStringOption(option => option.setName('label5').setDescription('Label for the fifth button.').setRequired(false))
        .addStringOption(option => option.setName('emoji5').setDescription('Emoji for the fifth button.').setRequired(false)),

    async execute(interaction, db) {
        await interaction.deferReply({ ephemeral: true }); // Defer early

        const title = interaction.options.getString('title');
        const noticeText = interaction.options.getString('notice_text');
        const mainText = interaction.options.getString('main_text');
        const guildId = interaction.guild.id;

        // Construct the description in the desired format
        const description = `⚠️ **Important notice:**\`\`\`\n\n${noticeText}\n\n\`\`\`${mainText}\n\nThanks for joining Elevate!`;

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Elevate', iconURL: 'https://cdn.discordapp.com/attachments/1313509092630855722/1375503075485417703/Elevate_121.png?ex=6831ec90&is=68309b10&hm=a7de64ee3b3f67cde516b6c2bd7967418e8c5ca8e9f7d3efbdcf20afb08b0718&' })
            .setTitle(title)
            .setDescription(description)
            .setColor(Colors.Blue) // A nice blue color, similar to Dyno's if it uses blue
            .setThumbnail('https://cdn.discordapp.com/attachments/1313509092630855722/1375503075883749428/Elevate_PNG2.png?ex=6831ec90&is=68309b10&hm=c68a1b123dbd1d9e1e468f6d2aafcddaefcbf7d812bc8e353a7881a6e75c82b6&') // Your E logo
            .setFooter({ iconURL: 'https://cdn.discordapp.com/attachments/1313509092630855722/1375503075883749428/Elevate_PNG2.png?ex=68446190&is=68431010&hm=bb1ca139af396bc6b98a34cdd428701493338e2a5abfa67d8d6200208e7d4293&', text: ' Elevate Community' }); // Or 'Elevate PD - 2025' if you prefer from your image

        const buttonsConfig = [];
        const actionRow = new ActionRowBuilder();
        let buttonsAdded = 0;

        for (let i = 1; i <= 5; i++) {
            const role = interaction.options.getRole(`role${i}`);
            const label = interaction.options.getString(`label${i}`);
            const emoji = interaction.options.getString(`emoji${i}`);

            if (role && label) { // Both role and label must be present for a button
                if (buttonsAdded >= 5) break; // Should not happen if options are limited to 5 pairs

                // More unique customId for buttons to avoid potential clashes if multiple RR messages assign same role
                const customId = `rr-button_${role.id}_${uuidv4().substring(0,8)}`;

                const button = new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel(label)
                    .setStyle(ButtonStyle.Secondary); // Greyish buttons like Dyno

                if (emoji) {
                    try {
                        button.setEmoji(emoji);
                    } catch (error) {
                        console.warn(`[ReactionRoleEmbed] Invalid emoji for button ${i} ('${emoji}'): ${error.message}`);
                    }
                }
                actionRow.addComponents(button);
                buttonsConfig.push({ customId, roleId: role.id, label });
                buttonsAdded++;
            } else if (role || label) { // If one is provided but not the other, it's an incomplete pair
                return interaction.editReply({ content: `For button configuration #${i}, both role and label are required if one is provided.` });
            }
        }

        if (buttonsAdded === 0) {
            return interaction.editReply({ content: 'You must configure at least one button (role and label).' });
        }

        try {
            const message = await interaction.channel.send({ embeds: [embed], components: [actionRow] });

            const dbKey = `reactionrole_button_messages_${guildId}`;
            let guildConfigs = await db.get(dbKey) || [];
            guildConfigs.push({
                messageId: message.id,
                channelId: message.channel.id,
                embedDetails: { // Storing relevant details for potential future use (e.g., editing the embed)
                    title: title,
                    constructedDescription: description, // Store the full constructed description
                    thumbnailUrl: 'https://cdn.discordapp.com/attachments/1313509092630855722/1375503075883749428/Elevate_PNG2.png?ex=6831ec90&is=68309b10&hm=c68a1b123dbd1d9e1e468f6d2aafcddaefcbf7d812bc8e353a7881a6e75c82b6&',
                    footerText: '🇪 Elevate Community', // Or your preferred footer
                    authorName: 'Elevate',
                    authorIconUrl: 'https://cdn.discordapp.com/attachments/1313509092630855722/1375503075485417703/Elevate_121.png?ex=6831ec90&is=68309b10&hm=a7de64ee3b3f67cde516b6c2bd7967418e8c5ca8e9f7d3efbdcf20afb08b0718&'
                },
                buttons: buttonsConfig
            });
            await db.set(dbKey, guildConfigs);

            await interaction.editReply({ content: 'Reaction role embed created successfully with the new style!' });

        } catch (error) {
            console.error('Error creating reaction role embed:', error);
            await interaction.editReply({ content: 'An error occurred while creating the reaction role embed. Please ensure I have permissions to send messages and embeds in this channel.' });
        }
    },
};