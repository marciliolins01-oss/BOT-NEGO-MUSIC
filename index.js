const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const { Player, useQueue } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
require('dotenv').config();

// FORÇA O FFMPEG ESTÁTICO PARA O AMBIENTE LINUX DA HOSPEDAGEM
try {
  process.env.FFMPEG_PATH = require('ffmpeg-static');
} catch (e) {
  console.log('FFmpeg estático não encontrado, usando padrão do sistema.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = new Player(client, {
  ytdlOptions: {
    filter: 'audioonly',
    highWaterMark: 1 << 25
  }
});

// Eventos do Player
player.events.on('playerStart', (queue, track) => {
  const channel = queue.metadata?.channel;
  if (channel) {
    channel.send(`🎶 Tocando agora: **${track.title}**`).catch(() => {});
  }
});

player.events.on('audioTrackAdd', (queue, track) => {
  const channel = queue.metadata?.channel;
  if (channel && queue.tracks.size > 0) {
    channel.send(`➕ Adicionada à fila: **${track.title}**`).catch(() => {});
  }
});

player.events.on('error', (queue, error) => {
  console.error(`[Erro na Fila]:`, error);
});

player.events.on('playerError', (queue, error) => {
  console.error(`[Erro de Reprodução]:`, error);
  if (queue) queue.node.skip();
});

const comandos = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Pesquisar e tocar música')
    .addStringOption(o =>
      o.setName('musica')
        .setDescription('Ex: Nome da música ou link do YouTube (sem list=)')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('pause').setDescription('Pausar música'),
  new SlashCommandBuilder().setName('resume').setDescription('Continuar música'),
  new SlashCommandBuilder().setName('skip').setDescription('Pular música'),
  new SlashCommandBuilder().setName('stop').setDescription('Parar música'),
  new SlashCommandBuilder().setName('queue').setDescription('Ver fila de músicas'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Ver música atual'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Alterar o volume da música')
    .addIntegerOption(o =>
      o.setName('valor')
        .setDescription('Volume de 1 a 100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`🎵 NEGO MUSIC ligado como ${client.user.tag}`);

  try {
    try {
  console.log('Extratores disponíveis:', DefaultExtractors.length);

  await player.extractors.loadDefault();
console.log('✅ Extratores padrão carregados!');

  console.log('Resultado do carregamento:', resultado);
  console.log('Total registrado:', player.extractors.store.size);
} catch (e) {
  console.error('Erro ao carregar extratores:', e);
}

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: comandos }
    );

    console.log('✅ Comandos registrados!');
  } catch (e) {
    console.error('Erro nos comandos:', e);
  }
});

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
          content: '⚠️ **Links de playlists não são permitidos!** Envie apenas o link direto da música ou pesquise pelo nome.',
          ephemeral: true
        });
      }

      await interaction.deferReply();

      const result = await player.play(canal, musica, {
        nodeOptions: {
          metadata: { channel: interaction.channel },
          leaveOnEmpty: false,
          leaveOnEnd: false,
          leaveOnStop: false,
          bufferingTimeout: 10000
        }
      });

      return interaction.editReply(`🔎 Processando pedido: **${musica}**`);
    }

    const fila = useQueue(guild.id);

    if (!fila) {
      return interaction.reply({
        content: '❌ Não há nenhuma música a tocar neste momento!',
        ephemeral: true
      });
    }

    if (nome === 'pause') {
      fila.node.pause();
      return interaction.reply('⏸️ Música pausada!');
    }

    if (nome === 'resume') {
      fila.node.resume();
      return interaction.reply('▶️ Música a continuar!');
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
      const lista = musicas.slice(0, 10)
        .map((m, i) => `${i + 1}. ${m.title}`)
        .join('\n');

      return interaction.reply(`🎶 **Fila de Reprodução**\n${lista || 'Sem próximas músicas.'}`);
    }

    if (nome === 'nowplaying') {
      return interaction.reply(
        `🎧 A tocar agora: **${fila.currentTrack?.title || 'Desconhecida'}**`
      );
    }

    if (nome === 'volume') {
      const valor = interaction.options.getInteger('valor');
      fila.node.setVolume(valor);
      return interaction.reply(`🔊 Volume ajustado para: ${valor}%`);
    }
  } catch (e) {
    console.error('Erro no comando:', e);

    const mensagem = '❌ Erro ao processar a música. Tente pesquisar pelo nome exato (ex: `/play DJ Arana`).';

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
