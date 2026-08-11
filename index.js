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
  { id: 'red', name: 'Red', hex: 0xe74c3c, emoji: '\u{1F7E5}' },
  { id: 'orange', name: 'Orange', hex: 0xe67e22, emoji: '\u{1F7E7}' },
  { id: 'yellow', name: 'Yellow', hex: 0xf1c40f, emoji: '\u{1F7E8}' },
  { id: 'green', name: 'Green', hex: 0x2ecc71, emoji: '\u{1F7E9}' },
  { id: 'blue', name: 'Blue', hex: 0x3498db, emoji: '\u{1F7E6}' },
  { id: 'purple', name: 'Purple', hex: 0x9b59b6, emoji: '\u{1F7EA}' },
];

const DICE_EMOJI = '\u{1F3B2}'; // used in embed titles

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
        label: `${c.emoji} ${c.name}`,
        value: c.id,
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
// `editor` is either an interaction (with .editReply) for the first call, or the raw message for later pushes.
async function runColorRound(editor, message, challenger, opponent, roundNumber) {
  const pickEmbed = new EmbedBuilder()
    .setTitle(roundNumber === 1 ? `${DICE_EMOJI} Color Dice Challenge â€” Accepted!` : `${DICE_EMOJI} Push! Roll again`)
    .setDescription(`${opponent}, pick your color below.`)
    .setColor(0x5865f2);

  if (editor && typeof editor.editReply === 'function') {
    await editor.editReply({
      embeds: [pickEmbed],
      components: [colorRow()],
    });
  } else {
    await message.edit({
      embeds: [pickEmbed],
      components: [colorRow()],
    });
  }

  const selectCollector = message.createMessageComponentCollector({
    time: ROUND_TIME,
    max: 1,
    filter: (i) => {
      if (i.customId !== 'pick_color') return false;
      if (i.user.id === opponent.id) return true;
      i.reply({ content: "This isn't your color pick to make.", ephemeral: true }).catch(() => {});
      return false;
    },
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
        .setTitle(`${DICE_EMOJI} Color Dice â€” Push!`)
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
        runColorRound(null, message, challenger, opponent, roundNumber + 1).catch((err) =>
          console.error('[push reroll] error:', err)
        );
      }, 2500);
      return;
    }

    // Final result: 0 matches = opponent loses, 1 or 4 matches = opponent wins
    const opponentWins = matches === 1 || matches === 4;
    const winner = opponentWins ? opponent : challenger;
    const loser = opponentWins ? challenger : opponent;

    const resultEmbed = new EmbedBuilder()
      .setTitle(`${DICE_EMOJI} Color Dice â€” Result`)
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
  console.log(
    `[interaction] type=${interaction.type} isCommand=${interaction.isChatInputCommand()} isButton=${interaction.isButton()} isSelect=${interaction.isStringSelectMenu()} customId=${interaction.customId ?? 'n/a'} user=${interaction.user?.tag}`
  );

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
      .setTitle(`${DICE_EMOJI} Color Dice Challenge`)
      .setDescription(
        `${challenger} has challenged ${opponent} to a game of Color Dice!\n\n${opponent}, do you accept?`
      )
      .setColor(0x5865f2);

    await interaction.reply({
      embeds: [challengeEmbed],
      components: [acceptDeclineRow()],
    });
    const message = await interaction.fetchReply();

    const buttonCollector = message.createMessageComponentCollector({
      time: ROUND_TIME,
      max: 1,
      filter: (i) => {
        if (i.user.id === opponent.id) return true;
        // Wrong person clicked â€” let them know instead of leaving it unhandled
        i.reply({
          content:
            i.user.id === challenger.id
              ? "This is your own challenge â€” wait for the person you challenged to respond."
              : "This challenge isn't for you.",
          ephemeral: true,
        }).catch(() => {});
        return false;
      },
    });

    buttonCollector.on('collect', async (btnInteraction) => {
      console.log(`[buttonCollector] collected click from ${btnInteraction.user.tag}: ${btnInteraction.customId}`);
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
      try {
        await btnInteraction.deferUpdate();
        await runColorRound(btnInteraction, message, challenger, opponent, 1);
      } catch (err) {
        console.error('[accept handler] error:', err);
      }
    });

    buttonCollector.on('end', (collected) => {
      console.log(`[buttonCollector] ended, collected=${collected.size}`);
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
