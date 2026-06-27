require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const {
  lookupPerson,
  getActiveShift,
  startShift,
  startBreak,
  endBreak,
  endShift,
  formatDuration,
  formatClock,
  computeTimes,
} = require('./state');
const { logCompletedShift } = require('./sheets');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---------- Slash command definition ----------
const commands = [
  new SlashCommandBuilder()
    .setName('shift-manage')
    .setDescription('Start, break, or stop your shift'),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('Slash commands registered.');
}

// ---------- UI builders ----------
function buildButtons(status) {
  const startBtn = new ButtonBuilder()
    .setCustomId('shift_start')
    .setLabel('Start Shift')
    .setStyle(ButtonStyle.Success)
    .setDisabled(status !== 'none');

  const breakBtn = new ButtonBuilder()
    .setCustomId('shift_break')
    .setLabel(status === 'on_break' ? 'Resume Shift' : 'Go on Break')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(status === 'none');

  const stopBtn = new ButtonBuilder()
    .setCustomId('shift_stop')
    .setLabel('Stop Shift')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(status === 'none');

  return new ActionRowBuilder().addComponents(startBtn, breakBtn, stopBtn);
}

function buildStatusEmbed(person, shift) {
  const status = shift ? shift.status : 'none';

  let statusLabel = 'Not on shift';
  if (status === 'on_shift') statusLabel = 'On shift';
  if (status === 'on_break') statusLabel = 'On break';

  const embed = new EmbedBuilder()
    .setTitle('Shift Manager')
    .setColor(0x2b2d31)
    .addFields(
      { name: 'Name', value: person.name, inline: true },
      { name: 'Rank', value: person.rank, inline: true },
      { name: 'Status', value: statusLabel, inline: true }
    );

  if (shift) {
    const { elapsedMs, breakMs, workedMs } = computeTimes(shift);
    embed.addFields(
      { name: 'Started', value: formatClock(shift.startedAt), inline: true },
      { name: 'Elapsed Time', value: formatDuration(elapsedMs), inline: true },
      { name: 'Break Time', value: formatDuration(breakMs), inline: true },
      { name: 'Total Worked Time', value: formatDuration(workedMs), inline: false }
    );
  } else {
    embed.setDescription('Use the buttons below to start your shift.');
  }

  return embed;
}

function buildSummaryEmbed(person, shift, endedAtIso) {
  const start = new Date(shift.startedAt).getTime();
  const end = new Date(endedAtIso).getTime();
  const elapsedMs = end - start;
  const breakMs = shift.totalBreakMs;
  const workedMs = elapsedMs - breakMs;

  return new EmbedBuilder()
    .setTitle('Shift Ended')
    .setColor(0x2b2d31)
    .addFields(
      { name: 'Name', value: person.name, inline: true },
      { name: 'Rank', value: person.rank, inline: true },
      { name: 'Status', value: 'Off shift', inline: true },
      { name: 'Start Time', value: formatClock(shift.startedAt), inline: true },
      { name: 'End Time', value: formatClock(endedAtIso), inline: true },
      { name: 'Break Time', value: formatDuration(breakMs), inline: true },
      { name: 'Total Time Elapsed', value: formatDuration(workedMs), inline: false }
    );
}

// ---------- Interaction handling ----------
client.on('interactionCreate', async (interaction) => {
  // /shift-manage
  if (interaction.isChatInputCommand() && interaction.commandName === 'shift-manage') {
    const person = lookupPerson(interaction.user.id, interaction.user.username);
    const shift = getActiveShift(interaction.user.id);

    const embed = buildStatusEmbed(person, shift);
    const buttons = buildButtons(shift ? shift.status : 'none');

    const reply = await interaction.reply({
      embeds: [embed],
      components: [buttons],
      fetchReply: true,
    });

    // Store message/channel reference so future button edits target this message
    if (shift) {
      shift.messageId = reply.id;
      shift.channelId = reply.channelId;
    }
    return;
  }

  // Button presses
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    const person = lookupPerson(userId, interaction.user.username);

    if (interaction.customId === 'shift_start') {
      const existing = getActiveShift(userId);
      if (existing) {
        return interaction.reply({ content: 'You are already on a shift.', ephemeral: true });
      }
      const shift = startShift(userId, interaction.message.id, interaction.message.channelId);
      const embed = buildStatusEmbed(person, shift);
      return interaction.update({ embeds: [embed], components: [buildButtons(shift.status)] });
    }

    if (interaction.customId === 'shift_break') {
      const existing = getActiveShift(userId);
      if (!existing) {
        return interaction.reply({ content: 'You are not on a shift.', ephemeral: true });
      }

      let shift;
      if (existing.status === 'on_break') {
        shift = endBreak(userId);
      } else {
        shift = startBreak(userId);
      }

      const embed = buildStatusEmbed(person, shift);
      return interaction.update({ embeds: [embed], components: [buildButtons(shift.status)] });
    }

    if (interaction.customId === 'shift_stop') {
      const existing = getActiveShift(userId);
      if (!existing) {
        return interaction.reply({ content: 'You are not on a shift.', ephemeral: true });
      }

      const endedAtIso = new Date().toISOString();
      const finishedShift = endShift(userId);

      const summaryEmbed = buildSummaryEmbed(person, finishedShift, endedAtIso);
      await interaction.update({ embeds: [summaryEmbed], components: [buildButtons('none')] });

      const elapsedMs = new Date(endedAtIso).getTime() - new Date(finishedShift.startedAt).getTime();
      const workedMs = elapsedMs - finishedShift.totalBreakMs;

      try {
        await logCompletedShift({
          name: person.name,
          rank: person.rank,
          startTime: formatClock(finishedShift.startedAt),
          endTime: formatClock(endedAtIso),
          workedDuration: formatDuration(workedMs),
          breakDuration: formatDuration(finishedShift.totalBreakMs),
        });
      } catch (err) {
        console.error('Sheet log failed:', err.message);
        await interaction.followUp({
          content: 'Shift was ended, but logging to Google Sheets failed. Contact an admin.',
          ephemeral: true,
        });
      }
      return;
    }
  }
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.login(process.env.DISCORD_TOKEN);
