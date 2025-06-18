// src/events/messageReactionRemove.js
const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageReactionRemove,
    // Signature to catch all args from main.js: (reaction, user, [mysteryArgIfPresent], db, client)
    // The last two will always be db and client from your main.js dispatcher.
    // The "mysteryArg" would be the 3rd if discord.js sends 3 args.
    async execute(reaction, user, arg3, arg4, arg5) {
        let db;
        let client;
        let potentialMysteryArg;

        if (arg5 !== undefined) { // 5 arguments total to execute means discord.js sent 3
            potentialMysteryArg = arg3;
            db = arg4;
            client = arg5;
        } else { // 4 arguments total to execute means discord.js sent 2
            potentialMysteryArg = undefined; // No mystery arg
            db = arg3;
            client = arg4;
        }

        console.log(`[ReactionRemove V2 Debug] Event triggered. Emoji: ${reaction.emoji.name}, User: ${user.tag}`);
        console.log(`[ReactionRemove V2 Debug] reaction type: ${reaction ? reaction.constructor.name : typeof reaction}`);
        console.log(`[ReactionRemove V2 Debug] user type: ${user ? user.constructor.name : typeof user}`);
        
        if (potentialMysteryArg !== undefined) {
            console.log(`[ReactionRemove V2 Debug] potentialMysteryArg type: ${potentialMysteryArg ? (potentialMysteryArg.constructor ? potentialMysteryArg.constructor.name : typeof potentialMysteryArg) : typeof potentialMysteryArg}`);
            if (typeof potentialMysteryArg === 'object' && potentialMysteryArg !== null) {
                console.log(`[ReactionRemove V2 Debug] potentialMysteryArg keys: ${Object.keys(potentialMysteryArg).join(', ')}`);
            }
        } else {
            console.log(`[ReactionRemove V2 Debug] No 'potentialMysteryArg' received (discord.js likely sent 2 event args).`);
        }
        console.log(`[ReactionRemove V2 Debug] DB type: ${db ? db.constructor.name : typeof db}`);
        console.log(`[ReactionRemove V2 Debug] Client type: ${client ? client.constructor.name : typeof client}`);


        if (user.bot) {
            console.log("[ReactionRemove V2] User is a bot, ignoring.");
            return;
        }

        if (reaction.partial) {
            try {
                console.log("[ReactionRemove V2] Reaction is partial, fetching...");
                await reaction.fetch();
            } catch (error) {
                console.error('[ReactionRemove V2] Error fetching partial reaction:', error);
                return;
            }
        }
        if (reaction.message.partial) {
            try {
                console.log("[ReactionRemove V2] Message is partial, fetching...");
                await reaction.message.fetch();
            } catch (error) {
                console.error('[ReactionRemove V2] Error fetching partial message:', error);
                return;
            }
        }

        if (!reaction.message.guild) { // Important check
            console.log("[ReactionRemove V2] Reaction not from a guild. Ignoring.");
            return;
        }
        const guildId = reaction.message.guild.id;
        const dbKey = `reactionrole_configs_${guildId}`; // Assuming this is for your old emoji reaction roles
        console.log(`[ReactionRemove V2] Using DB key: ${dbKey}`);

        if (!db || typeof db.get !== 'function') {
            console.error('[ReactionRemove V2 Critical] db is not a valid QuickDB object before calling .get()!');
            return;
        }

        const configs = await db.get(dbKey) || [];

        const reactionConfig = configs.find(
            c => c.messageId === reaction.message.id && (c.emoji === reaction.emoji.name || c.emoji === reaction.emoji.toString())
        );

        if (!reactionConfig) {
            console.log(`[ReactionRemove V2] No matching reaction role config found for emoji "${reaction.emoji.name}" (toString: "${reaction.emoji.toString()}") on message ${reaction.message.id}.`);
            return;
        }
        console.log(`[ReactionRemove V2] Found matching config:`, reactionConfig);

        const roleId = reactionConfig.roleId;
        const guild = reaction.message.guild; // Already checked reaction.message.guild exists
        const role = guild.roles.cache.get(roleId);

        if (!role) {
            console.warn(`[ReactionRemove V2] Role ID ${roleId} not found in guild ${guildId}.`);
            return;
        }
        console.log(`[ReactionRemove V2] Found role: ${role.name} (ID: ${role.id})`);

        let member; // Define member outside try-catch
        try {
            member = await guild.members.fetch(user.id);
        } catch (error) {
             console.error("[ReactionRemove V2] Error fetching member:", error);
             return null; // Or handle differently
        }


        if (!member) {
            console.log(`[ReactionRemove V2] Could not fetch member ${user.tag}.`);
            return;
        }
        console.log(`[ReactionRemove V2] Fetched member: ${member.user.tag}`);

        try {
            if (!member.roles.cache.has(role.id)) {
                console.log(`[ReactionRemove V2] Member ${member.user.tag} does not have role ${role.name}. No action taken.`);
                return;
            }
            await member.roles.remove(role);
            console.log(`[ReactionRemove V2] SUCCESS: Removed role ${role.name} from ${user.tag}`);
        } catch (error) {
            console.error(`[ReactionRemove V2] FAILED to remove role ${role.name} from ${user.tag}:`, error);
        }
    },
};