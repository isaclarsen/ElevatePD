// deploy-commands.js
const { REST, Routes } = require('discord.js');
const { clientId, guildId } = require('./config.json'); // Assuming config.json is in the root
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');

dotenv.config();
const token = process.env.DISCORD_TOKEN;

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');

// --- MODIFIED SECTION TO READ COMMANDS RECURSIVELY ---
function readCommandsRecursive(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            // If it's a directory, recurse into it
            readCommandsRecursive(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            // If it's a .js file, require it and add to commands array
            const command = require(fullPath);
            if (command.data && command.data.name) {
                commands.push(command.data.toJSON());
                console.log(`[Deploy] Loaded command: ${command.data.name} from ${fullPath}`);
            } else {
                console.log(`[WARNING] The command at ${fullPath} is missing a required "data" property or "data.name".`);
            }
        }
    }
}

// Start reading from the base commands path
readCommandsRecursive(commandsPath);
// --- END OF MODIFIED SECTION ---


const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        if (!clientId || !guildId || !token) {
            console.error('Error: clientId, guildId, or DISCORD_TOKEN is missing. Check your .env and config.json files.');
            process.exit(1);
        }
        if (commands.length === 0) {
            console.log('[Deploy] No commands found to deploy.');
            return;
        }

        console.log(`[Deploy] Started refreshing ${commands.length} application (/) commands for guild ${guildId}.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log(`[Deploy] Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`);
    } catch (error) {
        console.error('[Deploy] Error during command deployment:', error);
    }
})();