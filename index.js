
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits
} = require('discord.js');

const { Player, useQueue } = require('discord-player');
const { YouTubeDlpExtractor } = require('discord-player-youtubedlp');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '1329595321533075547';

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ Configure DISCORD_TOKEN e CLIENT_ID no arquivo .env.');
  process.exit(1);
}

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
    .addStringOption(option =>
      option
        .setName('musica')
        .setDescription('Nome da música ou link do YouTube')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausar a música'),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Continuar a música'),

  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Pular a música atual'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Parar a música'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Ver a fila de músicas'),

  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Ver a música atual'),

  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Alterar o volume')
    .addIntegerOption(option =>
      option
        .setName('valor')
        .setDescription('Volume de 1 a 100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
].map(command => command.toJSON());

client.once('clientReady', async () => {
  console.log(`🎵 Bot ligado como ${client.user.tag}`);
  console.log('[INICIALIZAÇÃO] Processo:', process.pid);

  try {
    console.log('[PLAYER] Registrando extrator do YouTube...');

    await player.extractors.register(YouTubeDlpExtractor, {});

    console.log('✅ Extrator do YouTube registrado!');
  } catch (error) {
    console.error('❌ Erro ao registrar extrator:', error);
    return;
  }

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: comandos }
    );

    console.log('✅ Comandos registrados no servidor!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }
});

player.events.on('playerStart', (queue, track) => {
  console.log('[TOCANDO]', track.title);

  const canalTexto = queue.metadata?.channel;

  if (canalTexto) {
    canalTexto.send(`🎶 Tocando agora: **${track.title}**`)
      .catch(() => {});
  }
});

player.events.on('error', (queue, error) => {
  console.error('[ERRO NA FILA]', error);
});

player.events.on('playerError', (queue, error) => {
  console.error('[ERRO NA REPRODUÇÃO]', error);
});

player.on('error', error => {
  console.error('[ERRO DO PLAYER]', error);
});

client.on('error', error => {
  console.error('[ERRO DO DISCORD]', error);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const nome = interaction.commandName;
  const guildId = interaction.guildId;

  try {
    if (nome === 'play') {
      await interaction.deferReply();

      const membro = await interaction.guild.members.fetch(
        interaction.user.id
      );

      const canal = membro.voice.channel;

      if (!canal) {
        return interaction.editReply(
          '❌ Entra em um canal de voz primeiro!'
        );
      }

      const botMembro = await interaction.guild.members.fetchMe();
      const permissoes = canal.permissionsFor(botMembro);

      if (
        !permissoes ||
        !permissoes.has(PermissionFlagsBits.ViewChannel) ||
        !permissoes.has(PermissionFlagsBits.Connect) ||
        !permissoes.has(PermissionFlagsBits.Speak)
      ) {
        return interaction.editReply(
          '❌ Preciso das permissões Ver canal, Conectar e Falar nesse canal de voz.'
        );
      }

      const musica = interaction.options.getString('musica', true);

      console.log(
        `[PLAY SOLICITADO] Usuário: ${interaction.user.tag} | Música: ${musica} | Canal: ${canal.id}`
      );

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
        `🔎 Pedido recebido: **${musica}**. Vou tentar carregar a música.`
      );
    }

    const fila = useQueue(guildId);

    if (!fila) {
      return interaction.reply({
        content: '❌ Não existe uma fila de músicas ativa.',
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
      if (!fila.currentTrack) {
        return interaction.reply({
          content: '❌ Não tem música tocando agora.',
          ephemeral: true
        });
      }

      fila.node.skip();

      return interaction.reply('⏭️ Música pulada!');
    }

    if (nome === 'stop') {
      fila.delete();

      return interaction.reply('⏹️ Reprodução parada e fila encerrada.');
    }

    if (nome === 'queue') {
      const atual = fila.currentTrack
        ? `🎶 **Tocando:** ${fila.currentTrack.title}\n`
        : '';

      const proximas = fila.tracks.toArray().slice(0, 10);

      const lista = proximas.length
        ? proximas.map((track, index) =>
            `${index + 1}. ${track.title}`
          ).join('\n')
        : 'Nenhuma próxima música na fila.';

      return interaction.reply({
        content: `${atual}\n**📋 Próximas músicas:**\n${lista}`,
        allowedMentions: { parse: [] }
      });
    }

    if (nome === 'nowplaying') {
      if (!fila.currentTrack) {
        return interaction.reply({
          content: '❌ Não há música tocando.',
          ephemeral: true
        });
      }

      return interaction.reply(
        `🎵 **Música atual:** ${fila.currentTrack.title}`
      );
    }

    if (nome === 'volume') {
      const valor = interaction.options.getInteger('valor', true);

      fila.node.setVolume(valor);

      return interaction.reply(`🔊 Volume ajustado para **${valor}%**.`);
    }
  } catch (error) {
    console.error(`[ERRO NO COMANDO /${nome}]`, error);

    const mensagem =
      nome === 'play'
        ? '❌ Não consegui carregar a música ou conectar ao canal de voz. Confere o erro no console.'
        : '❌ Ocorreu um erro ao executar esse comando.';

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(mensagem).catch(() => {});
    }

    return interaction.reply({
      content: mensagem,
      ephemeral: true
    }).catch(() => {});
  }
});

process.on('unhandledRejection', error => {
  console.error('[ERRO NÃO TRATADO]', error);
});

client.login(TOKEN).catch(error => {
  console.error('❌ Não foi possível conectar o bot ao Discord:', error);
});
