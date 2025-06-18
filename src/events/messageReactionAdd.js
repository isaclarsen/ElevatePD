// src/events/messageReactionAdd.js
const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageReactionAdd,
    // Signature to catch all args from main.js: (reaction, user, [mysteryArgIfPresent], db, client)
    async execute(reaction, user, arg3, arg4, arg5) { // Use generic arg names
        let db;
        let client;
        let potentialMysteryArg;

        // Determine what arg3, arg4, arg5 are based on how many args discord.js sent
        if (arg5 !== undefined) { // 5 arguments total to execute means discord.js sent 3 (+ db, client from main)
            potentialMysteryArg = arg3;
            db = arg4;
            client = arg5;
        } else { // 4 arguments total to execute means discord.js sent 2 (+ db, client from main)
            potentialMysteryArg = undefined; 
            db = arg3;
            client = arg4;
        }

        // Your V2 Debug Logs (now potentialMysteryArg is correctly defined before use if it exists)
        console.log(`[ReactionAdd V2 Debug] Event triggered. Emoji: ${reaction.emoji.name}, User: ${user.tag}`);
        console.log(`[ReactionAdd V2 Debug] reaction type: ${reaction ? reaction.constructor.name : typeof reaction}`);
        console.log(`[ReactionAdd V2 Debug] user type: ${user ? user.constructor.name : typeof user}`);
        
        if (potentialMysteryArg !== undefined) {
            console.log(`[ReactionAdd V2 Debug] potentialMysteryArg type: ${potentialMysteryArg ? (potentialMysteryArg.constructor ? potentialMysteryArg.constructor.name : typeof potentialMysteryArg) : typeof potentialMysteryArg}`);
            if (typeof potentialMysteryArg === 'object' && potentialMysteryArg !== null) {
                 console.log(`[ReactionAdd V2 Debug] potentialMysteryArg keys: ${Object.keys(potentialMysteryArg).join(', ')}`);
            }
        } else {
            console.log(`[ReactionAdd V2 Debug] No 'potentialMysteryArg' received (discord.js likely sent 2 event args).`);
        }
        console.log(`[ReactionAdd V2 Debug] DB type: ${db ? db.constructor.name : typeof db}`); // Should now show QuickDB
        console.log(`[ReactionAdd V2 Debug] Client type: ${client ? client.constructor.name : typeof client}`);
        // --- END OF V2 DEBUG LOGS ---

        if (user.bot) {
            console.log("[ReactionAdd V2] User is a bot, ignoring.");
            return;
        }

        if (reaction.partial) {
            try {
                console.log("[ReactionAdd V2] Reaction is partial, fetching...");
                await reaction.fetch();
            } catch (error) {
                console.error('[ReactionAdd V2] Error fetching partial reaction:', error);
                return;
            }
        }
        if (reaction.message.partial) {
            try {
                console.log("[ReactionAdd V2] Message is partial, fetching...");
                await reaction.message.fetch();
            } catch (error) {
                console.error('[ReactionAdd V2] Error fetching partial message:', error);
                return;
            }
        }

        if (!reaction.message.guild) { // Important safety check
            console.log("[ReactionAdd V2] Reaction not from guild. Ignoring.");
            return;
        }
        const guildId = reaction.message.guild.id;
        const dbKey = `reactionrole_configs_${guildId}`; // For old emoji reaction roles
        console.log(`[ReactionAdd V2] Using DB key: ${dbKey}`);

        if (!db || typeof db.get !== 'function') {
            console.error('[ReactionAdd V2 Critical] db is not a valid QuickDB object before calling .get()!');
            console.error(`[ReactionAdd V2 Critical] db actual type: ${typeof db}, constructor: ${db ? db.constructor.name : 'N/A'}`);
            return;
        }

        const configs = await db.get(dbKey) || [];
        console.log(`[ReactionAdd V2] Fetched configs (count): ${configs.length}`); // Log count for brevity

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
            console.warn(`[ReactionAdd V2] Role ID ${roleId} not found in guild ${guildId}.`);
            return;
        }
        console.log(`[ReactionAdd V2] Found role: ${role.name} (ID: ${role.id})`);
        
        let member;
        try {
            member = await guild.members.fetch(user.id);
        } catch (e) {
            console.error(`[ReactionAdd V2] Error fetching member ${user.id}:`, e);
            return; // Stop if member can't be fetched
        }

        if (!member) {
            console.log(`[ReactionAdd V2] Could not fetch member (returned null/undefined) ${user.tag}.`);
            return;
        }
        console.log(`[ReactionAdd V2] Fetched member: ${member.user.tag}`);

        try {
            if (member.roles.cache.has(role.id)) {
                console.log(`[ReactionAdd V2] Member ${member.user.tag} already has role ${role.name}.`);
                return;
            }
            await member.roles.add(role);
            console.log(`[ReactionAdd V2] SUCCESS: Added role ${role.name} to ${user.tag}`);
        } catch (error) {
            console.error(`[ReactionAdd V2] FAILED to add role ${role.name} to ${user.tag}:`, error);
        }
    },
};