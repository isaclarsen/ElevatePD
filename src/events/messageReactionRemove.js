// src/events/messageReactionRemove.js
const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageReactionRemove,
    async execute(reaction, user, potentialMysteryArg, actual_db) { // MODIFIED: Added potentialMysteryArg, actual_db
        // If actual_db is undefined, it means only 3 args were passed, so potentialMysteryArg is the db
        const db = actual_db !== undefined ? actual_db : potentialMysteryArg; // ADDED THIS LINE

        // ADDED/MODIFIED DEBUG LOGS (optional but good for confirmation)
        console.log(`[ReactionRemove V2 Debug] Event triggered. Emoji: ${reaction.emoji.name}, User: ${user.tag}`);
        console.log(`[ReactionRemove V2 Debug] reaction type: ${reaction ? reaction.constructor.name : typeof reaction}`);
        console.log(`[ReactionRemove V2 Debug] user type: ${user ? user.constructor.name : typeof user}`);
        console.log(`[ReactionRemove V2 Debug] potentialMysteryArg type: ${potentialMysteryArg ? (potentialMysteryArg.constructor ? potentialMysteryArg.constructor.name : typeof potentialMysteryArg) : typeof potentialMysteryArg}`);
        if (potentialMysteryArg && typeof potentialMysteryArg === 'object') console.log(`[ReactionRemove V2 Debug] potentialMysteryArg keys: ${Object.keys(potentialMysteryArg).join(', ')}`);
        console.log(`[ReactionRemove V2 Debug] actual_db type: ${actual_db ? (actual_db.constructor ? actual_db.constructor.name : typeof actual_db) : typeof actual_db}`);
        console.log(`[ReactionRemove V2 Debug] Using 'db' variable of type: ${db ? (db.constructor ? db.constructor.name : typeof db) : typeof db}`);
        console.log(`[ReactionRemove V2 Debug] Does selected 'db' have .get? ${db && typeof db.get === 'function'}`);


        // Ignore bot reactions
        if (user.bot) {
            console.log("[ReactionRemove V2] User is a bot, ignoring."); // Updated log prefix
            return;
        }

        // When a reaction is received, check if the structure is partial
        if (reaction.partial) {
            try {
                console.log("[ReactionRemove V2] Reaction is partial, fetching..."); // Updated log prefix
                await reaction.fetch();
            } catch (error) {
                console.error('[ReactionRemove V2] Something went wrong when fetching the partial reaction:', error); // Updated log prefix
                return;
            }
        }
        // Also fetch message if partial
        if (reaction.message.partial) {
            try {
                console.log("[ReactionRemove V2] Message is partial, fetching..."); // Updated log prefix
                await reaction.message.fetch();
            } catch (error) {
                console.error('[ReactionRemove V2] Something went wrong when fetching the partial message:', error); // Updated log prefix
                return;
            }
        }

        const guildId = reaction.message.guild.id;
        const dbKey = `reactionrole_configs_${guildId}`;
        console.log(`[ReactionRemove V2] Using DB key: ${dbKey}`); // Updated log prefix

        // ADDED: Check if db is valid
        if (!db || typeof db.get !== 'function') {
            console.error('[ReactionRemove V2 Critical] db is not a valid QuickDB object before calling .get()!');
            console.error(`[ReactionRemove V2 Critical] db type: ${typeof db}, constructor: ${db ? db.constructor.name : 'N/A'}`);
            return;
        }

        const configs = await db.get(dbKey) || []; // THIS LINE SHOULD NOW WORK
        // console.log(`[ReactionRemove V2] Fetched configs from DB:`, JSON.stringify(configs, null, 2)); // Updated log prefix

        const reactionConfig = configs.find(
            c => c.messageId === reaction.message.id && (c.emoji === reaction.emoji.name || c.emoji === reaction.emoji.toString())
        );

        if (!reactionConfig) {
            console.log(`[ReactionRemove V2] No matching reaction role config found for emoji "${reaction.emoji.name}" (toString: "${reaction.emoji.toString()}") on message ${reaction.message.id}.`); // Updated log prefix
            return;
        }
        console.log(`[ReactionRemove V2] Found matching config:`, reactionConfig); // Updated log prefix

        const roleId = reactionConfig.roleId;
        const guild = reaction.message.guild;
        if (!guild) {
            console.error("[ReactionRemove V2] reaction.message.guild is null. This should not happen if message is properly fetched."); // Updated log prefix
            return;
        }
        const role = guild.roles.cache.get(roleId);

        if (!role) {
            console.warn(`[ReactionRemove V2] Role ID ${roleId} not found in guild ${guildId}. Reaction role setup might be outdated or incorrect.`); // Updated log prefix
            return;
        }
        console.log(`[ReactionRemove V2] Found role: ${role.name} (ID: ${role.id})`); // Updated log prefix

        const member = await guild.members.fetch(user.id).catch(err => {
            console.error("[ReactionRemove V2] Error fetching member:", err); // Updated log prefix
            return null;
        });

        if (!member) {
            console.log(`[ReactionRemove V2] Could not fetch member ${user.tag}.`); // Updated log prefix
            return;
        }
        console.log(`[ReactionRemove V2] Fetched member: ${member.user.tag}`); // Updated log prefix

        try {
            if (!member.roles.cache.has(role.id)) {
                console.log(`[ReactionRemove V2] Member ${member.user.tag} does not have role ${role.name}. No action taken.`); // Updated log prefix
                return;
            }
            await member.roles.remove(role);
            console.log(`[ReactionRemove V2] SUCCESS: Removed role ${role.name} from ${user.tag}`); // Updated log prefix
        } catch (error) {
            console.error(`[ReactionRemove V2] FAILED to remove role ${role.name} from ${user.tag}:`, error); // Updated log prefix
        }
    },
};