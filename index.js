// Color Dice Discord Bot â€” 1v1 Challenge Mode
//
// /roll @opponent -> opponent accepts -> opponent picks a color -> bot rolls 4 dice
//
// Result rules (based on how many of the 4 dice match the opponent's chosen color):
//   0 matches -> opponent loses (challenger wins)
//   1 match   -> opponent wins
//   2 matches -> push: reroll all 4 dice, opponent picks a new color, repeat
//   3 matches -> push: reroll all 4 dice, opponent picks a new color, repeat
//   4 matches -> opponent wins

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // optional, for instant guild-only command registration

const COLORS = [
  { id: 'red', name: 'Red', hex: 0xe74c3c, emoji: 'ðŸŸ¥' },
  { id: 'orange', name: 'Orange', hex: 0xe67e22, emoji: 'ðŸŸ§' },
  { id: 'yellow', name: 'Yellow', hex: 0xf1c40f, emoji: 'ðŸŸ¨' },
  { id: 'green', name: 'Green', hex: 0x2ecc71, emoji: 'ðŸŸ©' },
  { id: 'blue', name: 'Blue', hex: 0x3498db, emoji: 'ðŸŸ¦' },
  { id: 'purple', name: 'Purple', hex: 0x9b59b6, emoji: 'ðŸŸª' },
];

const DICE_COUNT = 4;
const ROUND_TIME = 60_000; // 60 seconds per color pick / accept step

function rollDice(count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
  }
  return results;
}

function colorRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('pick_color')
    .setPlaceholder('Choose your color')
    .addOptions(
      COLORS.map((c) => ({
        label: c.name,
        value: c.id,
        emoji: c.emoji,
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

function acceptDeclineRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accept')
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('decline')
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
  );
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Runs one "pick a color -> roll" round. Recurses on a push (2 or 3 matches).
async function runColorRound(message, challenger, opponent, roundNumber) {
  const pickEmbed = new EmbedBuilder()
    .setTitle(roundNumber === 1 ? 'ðŸŽ² Color Dice Challenge â€” Accepted!' : 'ðŸŽ² Push! Roll again')
    .setDescription(`${opponent}, pick your color below.`)
    .setColor(0x5865f2);

  await message.edit({
    embeds: [pickEmbed],
    components: [colorRow()],
  });

  const selectCollector = message.createMessageComponentCollector({
    time: ROUND_TIME,
    max: 1,
    filter: (i) => i.user.id === opponent.id && i.customId === 'pick_color',
  });

  selectCollector.on('collect', async (selectInteraction) => {
    const chosenId = selectInteraction.values[0];
    const chosenColor = COLORS.find((c) => c.id === chosenId);

    const rolled = rollDice(DICE_COUNT);
    const matches = rolled.filter((c) => c.id === chosenId).length;

    const diceLine = rolled.map((c) => c.emoji).join(' ');
    const namesLine = rolled.map((c) => c.name).join(', ');

    if (matches === 2 || matches === 3) {
      // Push â€” reroll, opponent picks again
      const pushEmbed = new EmbedBuilder()
        .setTitle('ðŸŽ² Color Dice â€” Push!')
        .setDescription(
          `${opponent} chose ${chosenColor.emoji} **${chosenColor.name}**\n\n` +
            `**Rolled:** ${diceLine}\n(${namesLine})\n\n` +
            `${chosenColor.emoji} landed ${matches} times â€” that's a push. Rolling again...`
        )
        .setColor(0xf1c40f);

      await selectInteraction.update({
        embeds: [pushEmbed],
        components: [],
      });

      // Small delay so the push message is readable before the next round starts
      setTimeout(() => {
        runColorRound(message, challenger, opponent, roundNumber + 1).catch(() => {});
      }, 2500);
      return;
    }

    // Final result: 0 matches = opponent loses, 1 or 4 matches = opponent wins
    const opponentWins = matches === 1 || matches === 4;
    const winner = opponentWins ? opponent : challenger;
    const loser = opponentWins ? challenger : opponent;

    const resultEmbed = new EmbedBuilder()
      .setTitle('ðŸŽ² Color Dice â€” Result')
      .setDescription(
        `${opponent} chose ${chosenColor.emoji} **${chosenColor.name}**\n\n` +
          `**Rolled:** ${diceLine}\n(${namesLine})\n\n` +
          `${chosenColor.emoji} landed ${matches} time${matches === 1 ? '' : 's'}. **${winner} wins!**`
      )
      .setColor(opponentWins ? chosenColor.hex : 0x2c2f33)
      .setFooter({ text: `${loser.username} â€” better luck next time` });

    await selectInteraction.update({
      embeds: [resultEmbed],
      components: [],
    });
  });

  selectCollector.on('end', (collected) => {
    if (collected.size === 0) {
      message.edit({
        embeds: [
          pickEmbed
            .setDescription(`${opponent} didn't pick a color in time. Challenge cancelled.`)
            .setColor(0x99aab5),
        ],
        components: [],
      }).catch(() => {});
    }
  });
}

client.on('interactionCreate', async (interaction) => {
  // --- Slash command: /roll ---
  if (interaction.isChatInputCommand() && interaction.commandName === 'roll') {
    const challenger = interaction.user;
    const opponent = interaction.options.getUser('opponent');

    if (opponent.bot) {
      await interaction.reply({ content: "You can't challenge a bot.", ephemeral: true });
      return;
    }
    if (opponent.id === challenger.id) {
      await interaction.reply({ content: "You can't challenge yourself.", ephemeral: true });
      return;
    }

    const challengeEmbed = new EmbedBuilder()
      .setTitle('ðŸŽ² Color Dice Challenge')
      .setDescription(
        `${challenger} has challenged ${opponent} to a game of Color Dice!\n\n${opponent}, do you accept?`
      )
      .setColor(0x5865f2);

    const message = await interaction.reply({
      embeds: [challengeEmbed],
      components: [acceptDeclineRow()],
      fetchReply: true,
    });

    const buttonCollector = message.createMessageComponentCollector({
      time: ROUND_TIME,
      max: 1,
      filter: (i) => i.user.id === opponent.id,
    });

    buttonCollector.on('collect', async (btnInteraction) => {
      if (btnInteraction.customId === 'decline') {
        await btnInteraction.update({
          embeds: [
            challengeEmbed
              .setDescription(`${opponent} declined the challenge from ${challenger}.`)
              .setColor(0x99aab5),
          ],
          components: [],
        });
        return;
      }

      // Accepted â€” hand off to the color-pick/roll loop
      await btnInteraction.deferUpdate();
      await runColorRound(message, challenger, opponent, 1);
    });

    buttonCollector.on('end', (collected) => {
      if (collected.size === 0) {
        message.edit({
          embeds: [
            challengeEmbed
              .setDescription(`${opponent} didn't respond in time. Challenge cancelled.`)
              .setColor(0x99aab5),
          ],
          components: [],
        }).catch(() => {});
      }
    });
  }
});

// --- Slash command registration ---
const commands = [
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Challenge someone to a game of Color Dice')
    .addUserOption((option) =>
      option
        .setName('opponent')
        .setDescription('The person you want to challenge')
        .setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Registering slash command(s)...');
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commands,
      });
    } else {
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
