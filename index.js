
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const { Player, useQueue } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');

const youtubeiModule = require('discord-player-youtubei');

const YoutubeExtractor = youtubeiModule.YoutubeExtractor;

require('dotenv').config();

if (!process.env.DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN não foi configurado na FadeHost.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = new Player(client);
```js
console.log('[DIAGNÓSTICO] Dependências:', player.scanDeps());

player.on('debug', (mensagem) => {
  console.log('[PLAYER DEBUG]', mensagem);
});

player.events.on('debug', (fila, mensagem) => {
  console.log('[VOZ DEBUG]', mensagem);
});
```

console.log('📋 Dependências do player:', player.scanDeps());

player.on('debug', mensagem => {
  console.log('[PLAYER DEBUG]', mensagem);
});

player.events.on('debug', (fila, mensagem) => {
  console.log('[FILA DEBUG]', mensagem);
});

const GUILD_ID = '1329595321533075547';

const comandos = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Pesquisar e tocar música')
    .addStringOption(o =>
      o.setName('musica')
        .setDescription('Nome da música ou link')
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

  // Carrega os extratores padrão.
  try {
    await player.extractors.loadMulti(DefaultExtractors);
    console.log('✅ Extratores padrão carregados!');
  } catch (error) {
    console.error('Erro nos extratores padrão:', error);
  }

  // Tenta registrar o extrator do YouTube.
  try {
    console.log(
      'Exportações do pacote YouTube:',
      Object.keys(youtubeiModule)
    );

    if (typeof YoutubeExtractor !== 'function') {
  throw new Error('YoutubeExtractor não foi encontrado no pacote.');
}

console.log('Identificador:', YoutubeExtractor.identifier);

await player.extractors.register(YoutubeExtractor);

console.log('✅ Extrator do YouTube registrado!');
    console.log('✅ Extrator do YouTube registrado!');
  } catch (error) {
    console.error('Erro no extrator do YouTube:', error);
  }

  // Registra os comandos do servidor.
  try {
    const rest = new REST({ version: '10' })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: comandos }
    );

    console.log('✅ Comandos registrados!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

// Aviso quando uma música começar.
player.events.on('playerStart', (queue, track) => {
  console.log('🎶 Faixa iniciada:', {
    title: track?.title,
    url: track?.url,
    duration: track?.duration,
    extractor: track?.extractor
  });

  const titulo = track?.title || 'Título não identificado';

  queue.metadata?.channel?.send(
    `🎵 Tocando agora: **${titulo}**`
  ).catch(console.error);
});

player.events.on('error', (queue, error) => {
  console.error('Erro no player:', error);
});

player.events.on('playerError', (queue, error) => {
  console.error('Erro ao tocar áudio:', error);
});

// Comandos de música.
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guild) return;

  const nome = interaction.commandName;
  const guildId = interaction.guild.id;

  try {
    if (nome === 'play') {
      const canal = interaction.member?.voice?.channel;

      if (!canal) {
        return interaction.reply({
          content: '❌ Entra em um canal de voz primeiro!',
          ephemeral: true
        });
      }

      const musica = interaction.options.getString('musica', true);

try {
  await interaction.deferReply();
} catch (erro) {
  console.error('Falha ao responder à interação:', erro.code, erro.message);
  return;
}

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
        `🔎 Pedido recebido: **${musica}**.`
      );
    }

    const fila = useQueue(guildId);

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
      await fila.delete();
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
      const valor = interaction.options.getInteger('valor', true);
      fila.node.setVolume(valor);

      return interaction.reply(
        `🔊 Volume ajustado para ${valor}%!`
      );
    }
  } catch (error) {
    console.error(`Erro no comando /${nome}:`, error);

    const mensagem =
      '❌ Não consegui executar esse comando. Verifica se há música disponível e tenta novamente.';

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
