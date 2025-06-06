const { Events } = require('discord.js');
const embeds = require('../utils/embeds.js');

    module.exports = {
        name: Events.MessageUpdate,
        async execute(oldMessage, newMessage, db, client){
            //If dm, return
            // if(newMessage.guild){
            //     console.log("message update - dm");
            //     return;
            // }
            //if bot, return
            if(newMessage.author.bot || newMessage.partial){
                console.log("[MESSAGE UPDATE] - Bot, ignoring...");
                
                return;
            }
            //If partial (old), return
            if(oldMessage.partial){
                console.log([`[MESSAGE UPDATE] - Message ${oldMessage.id} was partial.`]);
                
            }
            //No change, return
            if(newMessage.content === oldMessage.content){
                console.log(`[MESSAGE UPDATE] - Content for message ${newMessage.id} did not change`);
                return;
            }

            const guildId = newMessage.guild.id;

            const logChannelId = await db.get(`logchannel_edit_logs_${guildId}`)

            if(!logChannelId){
                console.log(`[MESSAGE UPDATE] - Couldn't find any edit logchannel for guild ${guildId}`);
                return;
            }

            const logChannel = newMessage.guild.channels.cache.get(logChannelId)

            if(!logChannel){
                console.log(`[MESSAGE UPDATE] - Edit log channel ${logChannel} not found in guild ${guildId}. `);
                return;
            }

            if (!logChannel.permissionsFor(client.user).has("SendMessages") || !logChannel.permissionsFor(client.user).has("EmbedLinks")) {
                console.warn(`[MessageUpdate] Missing SendMessages or EmbedLinks permission in edit log channel ${logChannel.name} for guild ${guildId}.`);
                return;
            }

            try {
                const logEmbed = embeds.messageUpdateLogEmbed(oldMessage, newMessage);
                await logChannel.send({embeds: [logEmbed]});
                
            } catch (error) {
                console.error(`[MESSAGE UPDATE] - Could not send edit log to channel ${logChannel.id} in guild ${guildId}:`, error);
            }

            
            console.log("[MESSAGE UPDATE] - New message edit detected" + "\n" +
                        `[MESSAGE UPDATE] - Message ${newMessage.id} was updated
                         in channel ${newMessage.channel.id}`);
        }
    };
            
    
