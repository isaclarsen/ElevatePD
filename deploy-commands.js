// deploy-commands.js
const { REST, Routes } = require('discord.js');
const { clientId, guildId } = require('./config.json'); // Assuming config.json is in the root
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');

dotenv.config();
const token = process.env.DISCORD_TOKEN;

const commands = [];
// THE IMPORTANT CHANGE IS HERE:
const commandsPath = path.join(__dirname, 'src', 'commands'); // Point to src/commands
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file); // This will now be src/commands/yourcommand.js
    const command = require(filePath);
    if (command.data && command.data.name) { // Good to check for command.data.name too
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" property or "data.name".`);
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        if (!clientId || !guildId || !token) {
            console.error('Error: clientId, guildId, or DISCORD_TOKEN is missing. Check your .env and config.json files.');
            process.exit(1); // Exit if essential config is missing
        }
        if (commands.length === 0) {
            console.log('No commands found to deploy.');
            return;
        }

        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();