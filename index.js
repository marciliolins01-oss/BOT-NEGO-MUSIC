
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const { Player, useQueue } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeiExtractor } = require('discord-player-youtubei');

require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = new Player(client);

const comandos = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Pesquisar e tocar música')
    .addStringOption(o =>
      o.setName('musica')
        .setDescription('Nome da música ou link do YouTube')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausar música'),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Continuar música'),

  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Pular música'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Parar música'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Ver fila de músicas'),

  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Ver música atual'),

  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Alterar volume')
    .addIntegerOption(o =>
      o.setName('valor')
        .setDescription('Volume de 1 a 100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
].map(c => c.toJSON());

client.once('clientReady', async () => {
  console.log(`🎵 Bot ligado como ${client.user.tag}`);

  try {
    await player.extractors.loadMulti(DefaultExtractors);
await player.extractors.register(YoutubeiExtractor);
console.log('🎶 Extratores carregados!');
  } catch (error) {
    console.error('Erro ao carregar extratores:', error);
  }

  try {
    const rest = new REST({ version: '10' })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        '1329595321533075547'
      ),
      { body: comandos }
    );

    console.log('✅ Comandos registrados!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

player.events.on('playerStart', (queue, track) => {
  console.log(`🎶 Começou a tocar: ${track.title}`);

  queue.metadata?.channel?.send(
    `🎵 Tocando agora: **${track.title}**`
  ).catch(() => {});
});

player.events.on('error', (queue, error) => {
  console.error('Erro no player:', error);
});

player.events.on('playerError', (queue, error) => {
  console.error('Erro ao tocar áudio:', error);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const nome = interaction.commandName;
  const guild = interaction.guild;

  try {
    if (nome === 'play') {
      const canal = interaction.member?.voice?.channel;

      if (!canal) {
        return interaction.reply({
          content: '❌ Entra em um canal de voz primeiro!',
          ephemeral: true
        });
      }

      await interaction.deferReply();

      const musica = interaction.options.getString('musica');

      await player.play(canal, musica, {
        nodeOptions: {
          metadata: {
            channel: interaction.channel
          },
          leaveOnEmpty: false,
          leaveOnEmptyCooldown: 300000,
          leaveOnEnd: false,
          leaveOnEndCooldown: 15000,
          leaveOnStop: false,
          leaveOnStopCooldown: 5000
        }
      });

      return interaction.editReply(
        `🔎 Pedido enviado: **${musica}**. Vou tentar carregar o áudio!`
      );
    }

    const fila = useQueue(guild?.id);

    if (!fila) {
      return interaction.reply({
        content: '❌ Não tem música na fila!',
        ephemeral: true
      });
    }

    if (nome === 'pause') {
      fila.node.pause();
      return interaction.reply('⏸️ Música pausada!');
    }

    if (nome === 'resume') {
      fila.node.resume();
      return interaction.reply('▶️ Música continuando!');
    }

    if (nome === 'skip') {
      fila.node.skip();
      return interaction.reply('⏭️ Música pulada!');
    }

    if (nome === 'stop') {
      fila.delete();
      return interaction.reply('⏹️ Reprodução encerrada!');
    }

    if (nome === 'queue') {
      const musicas = fila.tracks.toArray();

      const lista = musicas
        .slice(0, 10)
        .map((m, i) => `${i + 1}. ${m.title}`)
        .join('\n');

      return interaction.reply(
        `🎶 **Próximas músicas**\n${lista || 'Não há próximas músicas.'}`
      );
    }

    if (nome === 'nowplaying') {
      return interaction.reply(
        `🎧 Tocando: **${fila.currentTrack?.title || 'Nenhuma música'}**`
      );
    }

    if (nome === 'volume') {
      const valor = interaction.options.getInteger('valor');
      fila.node.setVolume(valor);

      return interaction.reply(`🔊 Volume ajustado para ${valor}%!`);
    }
  } catch (error) {
    console.error('Erro no comando:', error);

    const mensagem =
      '❌ Não consegui executar esse comando. Tenta novamente com o nome da música ou um link direto do vídeo.';

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(mensagem).catch(() => {});
    }

    return interaction.reply({
      content: mensagem,
      ephemeral: true
    }).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
