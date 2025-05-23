// src/events/messageReactionAdd.js
const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user, potentialMysteryArg, actual_db) {
        // If actual_db is undefined, it means only 3 args were passed, so potentialMysteryArg is the db
        const db = actual_db !== undefined ? actual_db : potentialMysteryArg;

        console.log(`[ReactionAdd V2 Debug] Event triggered. Emoji: ${reaction.emoji.name}, User: ${user.tag}`);
        console.log(`[ReactionAdd V2 Debug] reaction type: ${reaction ? reaction.constructor.name : typeof reaction}`);
        console.log(`[ReactionAdd V2 Debug] user type: ${user ? user.constructor.name : typeof user}`);
        console.log(`[ReactionAdd V2 Debug] potentialMysteryArg type: ${potentialMysteryArg ? (potentialMysteryArg.constructor ? potentialMysteryArg.constructor.name : typeof potentialMysteryArg) : typeof potentialMysteryArg}`);
        if (potentialMysteryArg && typeof potentialMysteryArg === 'object') console.log(`[ReactionAdd V2 Debug] potentialMysteryArg keys: ${Object.keys(potentialMysteryArg).join(', ')}`);
        console.log(`[ReactionAdd V2 Debug] actual_db type: ${actual_db ? (actual_db.constructor ? actual_db.constructor.name : typeof actual_db) : typeof actual_db}`);
        console.log(`[ReactionAdd V2 Debug] Using 'db' variable of type: ${db ? (db.constructor ? db.constructor.name : typeof db) : typeof db}`);
        console.log(`[ReactionAdd V2 Debug] Does selected 'db' have .get? ${db && typeof db.get === 'function'}`);


        if (user.bot) {
            console.log("[ReactionAdd V2] User is a bot, ignoring.");
            return;
        }

        if (reaction.partial) {
            try {
                console.log("[ReactionAdd V2] Reaction is partial, fetching...");
                await reaction.fetch();
            } catch (error) {
                console.error('[ReactionAdd V2] Something went wrong when fetching the partial reaction:', error);
                return;
            }
        }
        if (reaction.message.partial) {
            try {
                console.log("[ReactionAdd V2] Message is partial, fetching...");
                await reaction.message.fetch();
            } catch (error) {
                console.error('[ReactionAdd V2] Something went wrong when fetching the partial message:', error);
                return;
            }
        }

        const guildId = reaction.message.guild.id;
        const dbKey = `reactionrole_configs_${guildId}`;
        console.log(`[ReactionAdd V2] Using DB key: ${dbKey}`);

        if (!db || typeof db.get !== 'function') {
            console.error('[ReactionAdd V2 Critical] db is not a valid QuickDB object before calling .get()!');
            console.error(`[ReactionAdd V2 Critical] db type: ${typeof db}, constructor: ${db ? db.constructor.name : 'N/A'}`);
            return;
        }

        const configs = await db.get(dbKey) || [];
        console.log(`[ReactionAdd V2] Fetched configs:`, configs);

        const reactionConfig = configs.find(
            c => c.messageId === reaction.message.id && (c.emoji === reaction.emoji.name || c.emoji === reaction.emoji.toString())
        );

        if (!reactionConfig) {
            console.log(`[ReactionAdd V2] No matching reaction role config found for emoji ${reaction.emoji.name} on message ${reaction.message.id}.`);
            return;
        }
        console.log(`[ReactionAdd V2] Found matching config:`, reactionConfig);

        const roleId = reactionConfig.roleId;
        const guild = reaction.message.guild;
        const role = guild.roles.cache.get(roleId);

        if (!role) {
            console.warn(`[ReactionAdd V2] Role ID ${roleId} not found in guild ${guildId}. Reaction role setup might be outdated.`);
            return;
        }
        console.log(`[ReactionAdd V2] Found role: ${role.name} (ID: ${role.id})`);

        const member = await guild.members.fetch(user.id).catch(err => {
            console.error("[ReactionAdd V2] Error fetching member:", err);
            return null;
        });

        if (!member) {
            console.log(`[ReactionAdd V2] Could not fetch member ${user.tag}.`);
            return;
        }
        console.log(`[ReactionAdd V2] Fetched member: ${member.user.tag}`);

        try {
            if (member.roles.cache.has(role.id)) {
                console.log(`[ReactionAdd V2] Member ${member.user.tag} already has role ${role.name}.`);
                return;
            }
            await member.roles.add(role);
            console.log(`[ReactionAdd V2] Added role ${role.name} to ${user.tag}`);
        } catch (error) {
            console.error(`[ReactionAdd V2] Failed to add role ${role.name} to ${user.tag}:`, error);
        }
    },
};