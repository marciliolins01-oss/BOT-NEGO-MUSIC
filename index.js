
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const { Player, useQueue } = require('discord-player');
require('@discord-player/extractor');
require('dotenv').config();

// FFmpeg para a hospedagem Linux
try {
  const ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
} catch (e) {
  console.log('FFmpeg estático não encontrado:', e.message);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = new Player(client);

// Avisar quando a música começar
player.events.on('playerStart', (queue, track) => {
  const channel = queue.metadata?.channel;

  if (channel) {
    channel.send(`🎶 Tocando agora: **${track.title}**`).catch(() => {});
  }
});

// Avisar quando uma música entrar na fila
player.events.on('audioTrackAdd', (queue, track) => {
  const channel = queue.metadata?.channel;

  if (channel) {
    channel.send(`➕ Adicionada à fila: **${track.title}**`).catch(() => {});
  }
});

// Erros da fila
player.events.on('error', (queue, error) => {
  console.error('[Erro na fila]:', error);
});

// Erros durante a reprodução
player.events.on('playerError', (queue, error) => {
  console.error('[Erro de reprodução]:', error);
  if (queue) queue.node.skip();
});

// Comandos do bot
const comandos = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Pesquisar e tocar música')
    .addStringOption(o =>
      o.setName('musica')
        .setDescription('Nome da música ou link direto')
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
    .setDescription('Alterar o volume')
    .addIntegerOption(o =>
      o.setName('valor')
        .setDescription('Volume de 1 a 100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
].map(c => c.toJSON());

// Inicialização
client.once('ready', async () => {
  console.log(`🎵 NEGO MUSIC ligado como ${client.user.tag}`);

  // Carregar os extratores
  try {
    await player.extractors.loadDefault();
    console.log('✅ Extratores padrão carregados!');
    console.log('Total de extratores:', player.extractors.store.size);
  } catch (e) {
    console.error('❌ Erro ao carregar extratores:', e);
  }

  // Registrar comandos no Discord
  try {
    const rest = new REST({ version: '10' })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: comandos }
    );

    console.log('✅ Comandos registrados!');
  } catch (e) {
    console.error('❌ Erro nos comandos:', e);
  }
});

// Processar comandos
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const nome = interaction.commandName;
  const guild = interaction.guild;

  try {
    if (nome === 'play') {
      const canal = interaction.member.voice?.channel;

      if (!canal) {
        return interaction.reply({
          content: '❌ Entra num canal de voz primeiro!',
          ephemeral: true
        });
      }

      const musica = interaction.options.getString('musica');

      if (musica.includes('list=')) {
        return interaction.reply({
          content: '⚠️ Links de playlists não são permitidos! Envie o link direto de uma música ou pesquise pelo nome.',
          ephemeral: true
        });
      }

      await interaction.deferReply();

      await player.play(canal, musica, {
        nodeOptions: {
          metadata: { channel: interaction.channel },
          leaveOnEmpty: false,
          leaveOnEnd: false,
          leaveOnStop: false,
          bufferingTimeout: 10000
        }
      });

      return interaction.editReply(
        `🔎 Pedido recebido: **${musica}**`
      );
    }

    const fila = useQueue(guild?.id);

    if (!fila) {
      return interaction.reply({
        content: '❌ Não há nenhuma música na fila neste momento!',
        ephemeral: true
      });
    }

    if (nome === 'pause') {
      fila.node.pause();
      return interaction.reply('⏸️ Música pausada!');
    }

    if (nome === 'resume') {
      fila.node.resume();
      return interaction.reply('▶️ Música retomada!');
    }

    if (nome === 'skip') {
      fila.node.skip();
      return interaction.reply('⏭️ Música pulada!');
    }

    if (nome === 'stop') {
      await fila.delete();
      return interaction.reply('⏹️ Reprodução encerrada!');
    }

    if (nome === 'queue') {
      const musicas = fila.tracks.toArray();

      const lista = musicas.slice(0, 10)
        .map((m, i) => `${i + 1}. ${m.title}`)
        .join('\n');

      return interaction.reply(
        `🎶 **Fila de reprodução**\n${lista || 'Sem próximas músicas.'}`
      );
    }

    if (nome === 'nowplaying') {
      return interaction.reply(
        `🎧 Tocando agora: **${fila.currentTrack?.title || 'Desconhecida'}**`
      );
    }

    if (nome === 'volume') {
      const valor = interaction.options.getInteger('valor');
      fila.node.setVolume(valor);

      return interaction.reply(`🔊 Volume ajustado para ${valor}%`);
    }
  } catch (e) {
    console.error('❌ Erro no comando:', e);

    const mensagem =
      '❌ Não consegui processar a música. Tente pesquisar pelo nome exato.';

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(mensagem).catch(() => {});
    }

    return interaction.reply({
      content: mensagem,
      ephemeral: true
    }).catch(() => {});
  }
});

// Ligar o bot
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN não foi configurado no arquivo .env!');
} else {
  client.login(process.env.DISCORD_TOKEN);
}
