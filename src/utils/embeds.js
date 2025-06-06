const { EmbedBuilder, Colors } = require("discord.js");

const truncate = (text, maxLength) => {
    if (text === null || typeof text === 'undefined') return "(Content not available)";
    const content = String(text);
    return content.length > maxLength ? content.slice(0, maxLength - 3) + "..." : content;
};

module.exports = {
    // MessageUpdate
    messageUpdateLogEmbed: (oldMessage, newMessage) => {
        
        const oldContentText = oldMessage.content;
        const newContentText = newMessage.content;

        return new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setThumbnail('https://cdn.discordapp.com/attachments/1313509092630855722/1375503075883749428/Elevate_PNG2.png?ex=6831ec90&is=68309b10&hm=c68a1b123dbd1d9e1e468f6d2aafcddaefcbf7d812bc8e353a7881a6e75c82b6&')
            .setAuthor({ name: newMessage.author.tag, iconURL: newMessage.author.displayAvatarURL({ dynamic: true }) })
            .setTitle('Message Edited')
            .setDescription(`A message by ${newMessage.author} was edited in ${newMessage.channel} \n\ [Jump to Message](${newMessage.url})`)
            .addFields(
                { name: '📝 Before', value: `\`\`\`\n${truncate(oldContentText, 1010)}\n\`\`\`` },
                { name: '✏️ After', value: `\`\`\`\n${truncate(newContentText, 1010)}\n\`\`\`` }
            )
            .setTimestamp(newMessage.editedTimestamp || newMessage.createdTimestamp || Date.now())
    }
}
