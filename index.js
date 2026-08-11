// Color Dice Discord Bot
// Rolls N dice, each landing on a random color, just like online-dice.com style sites.

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
} = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // your bot's application/client ID
const GUILD_ID = process.env.GUILD_ID; // optional: for instant guild-only command registration

// The six colors, each with a hex value (for the embed bar) and an emoji square
const COLORS = [
  { name: 'Red', hex: 0xe74c3c, emoji: '🟥' },
  { name: 'Orange', hex: 0xe67e22, emoji: '🟧' },
  { name: 'Yellow', hex: 0xf1c40f, emoji: '🟨' },
  { name: 'Green', hex: 0x2ecc71, emoji: '🟩' },
  { name: 'Blue', hex: 0x3498db, emoji: '🟦' },
  { name: 'Purple', hex: 0x9b59b6, emoji: '🟪' },
];

// Simple in-memory streak tracker: userId -> current streak count
// (Resets when the bot restarts. Swap for a database if you want it persistent.)
const streaks = new Map();

function rollOneDie() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function rollDice(count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(rollOneDie());
  }
  return results;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'roll') {
    const diceCount = interaction.options.getInteger('dice') ?? 4;

    if (diceCount < 1 || diceCount > 10) {
      await interaction.reply({
        content: 'Please choose between 1 and 10 dice.',
        ephemeral: true,
      });
      return;
    }

    const results = rollDice(diceCount);

    // Update the user's roll streak
    const userId = interaction.user.id;
    const currentStreak = (streaks.get(userId) ?? 0) + 1;
    streaks.set(userId, currentStreak);

    const emojiLine = results.map((r) => r.emoji).join(' ');
    const nameLine = results.map((r) => r.name).join(', ');

    const embed = new EmbedBuilder()
      .setTitle('🎲 Color Dice')
      .setDescription(`${emojiLine}\n\n**Colors:** ${nameLine}`)
      .setColor(results[0].hex)
      .setFooter({ text: `Roll Streak: ${currentStreak} 🎲` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
});

// --- Slash command registration ---
// Run this file with `node index.js` once to register the /roll command,
// then keep it running (or run register separately, see README).
const commands = [
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll colored dice')
    .addIntegerOption((option) =>
      option
        .setName('dice')
        .setDescription('Number of dice to roll (1-10)')
        .setMinValue(1)
        .setMaxValue(10)
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Registering slash command(s)...');
    if (GUILD_ID) {
      // Instant registration, scoped to one server — best for testing
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commands,
      });
    } else {
      // Global registration — can take up to an hour to propagate
      await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commands,
      });
    }
    console.log('Slash command(s) registered.');
  } catch (err) {
    console.error(err);
  }

  client.login(TOKEN);
})();
