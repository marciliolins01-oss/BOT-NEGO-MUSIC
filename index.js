
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
    .setDescription('Toca uma música')
    .addStringOption(option =>
      option.setName('musica')
        .setDescription('Nome ou link da música')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa a música'),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Continua a música'),

  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Pula a música'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Para a música'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Mostra a fila de músicas'),

  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Mostra a música atual'),

  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Altera o volume')
    .addIntegerOption(option =>
      option.setName('valor')
        .setDescription('Volume de 1 a 100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
].map(comando => comando.toJSON());

async function registrarComandos() {
  if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
    throw new Error('Faltam DISCORD_TOKEN ou CLIENT_ID nas variáveis de ambiente.');
  }

  const rest = new REST({ version: '10' })
    .setToken(process.env.DISCORD_TOKEN);

  const rota = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      )
    : Routes.applicationCommands(process.env.CLIENT_ID);

  await rest.put(rota, { body: comandos });
  console.log('✅ Comandos registrados no Discord!');
}

client.once('ready', async () => {
  console.log(`🎵 NEGO MUSIC ligado como ${client.user.tag}`);

  try {
    await player.extractors.loadDefault();
    console.log('✅ Extratores carregados!');
    console.log(`📦 Total de extratores: ${player.extractors.store.size}`);
  } catch (erro) {
    console.error('❌ Erro ao carregar extratores:', erro);
  }
});

player.events.on('playerStart', (queue, track) => {
  const canal = queue.metadata?.channel;

  if (canal) {
    canal.send(`🎶 Tocando agora: **${track.title}**`)
      .catch(() => {});
  }
});

player.events.on('error', (queue, erro) => {
  console.error('❌ Erro na fila:', erro);
});

player.events.on('playerError', (queue, erro) => {
  console.error('❌ Erro ao reproduzir música:', erro);
  queue.metadata?.channel?.send(
    '❌ Não consegui reproduzir essa música. Tenta outra ou usa um link diferente.'
  ).catch(() => {});
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const { commandName, guild, member, channel } = interaction;

    if (!guild) {
      return interaction.reply({
        content: '❌ Usa esse comando dentro de um servidor.',
        ephemeral: true
      });
    }

    if (commandName === 'play') {
      const musica = interaction.options.getString('musica', true);
      const canalVoz = member.voice?.channel;

      if (!canalVoz) {
        return interaction.reply({
          content: '🔊 Entra primeiro em um canal de voz!',
          ephemeral: true
        });
      }

      await interaction.deferReply();

      const consulta = /^https?:\/\//i.test(musica)
        ? musica
        : `ytsearch:${musica}`;

      await player.play(canalVoz, consulta, {
        nodeOptions: {
          metadata: { channel },
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 300000,
          leaveOnEnd: true,
          leaveOnEndCooldown: 15000,
          leaveOnStop: true,
          volume: 80
        }
      });

      return interaction.editReply(`🔎 Procurando: **${musica}**`);
    }

    const fila = useQueue(guild.id);

    if (!fila) {
      return interaction.reply({
        content: '❌ Não tem nenhuma música tocando agora.',
        ephemeral: true
      });
    }

    switch (commandName) {
      case 'pause': {
        if (!fila.node.isPlaying()) {
          return interaction.reply('❌ Não tem música tocando.');
        }

        fila.node.pause();
        return interaction.reply('⏸️ Música pausada!');
      }

      case 'resume': {
        if (!fila.node.isPaused()) {
          return interaction.reply('❌ A música não está pausada.');
        }

        fila.node.resume();
        return interaction.reply('▶️ Música retomada!');
      }

      case 'skip': {
        if (!fila.currentTrack) {
          return interaction.reply('❌ Não há música para pular.');
        }

        fila.node.skip();
        return interaction.reply('⏭️ Música pulada!');
      }

      case 'stop': {
        fila.delete();
        return interaction.reply('⏹️ Reprodução encerrada!');
      }

      case 'queue': {
        const atual = fila.currentTrack?.title || 'Nenhuma';
        const proximas = fila.tracks.toArray().slice(0, 10);

        const lista = proximas.length
          ? proximas.map((track, i) => `${i + 1}. ${track.title}`).join('\n')
          : 'Não há próximas músicas.';

        return interaction.reply(
          `🎵 **Tocando:** ${atual}\n\n**Próximas músicas:**\n${lista}`
        );
      }

      case 'nowplaying': {
        const atual = fila.currentTrack;

        if (!atual) {
          return interaction.reply('❌ Nenhuma música está tocando.');
        }

        return interaction.reply(`🎶 **Tocando agora:** ${atual.title}`);
      }

      case 'volume': {
        const valor = interaction.options.getInteger('valor', true);
        fila.node.setVolume(valor);
        return interaction.reply(`🔊 Volume ajustado para **${valor}%**.`);
      }
    }
  } catch (erro) {
    console.error('❌ Erro no comando:', erro);

    const mensagem = {
      content: '❌ Ocorreu um erro. Confere o console da hospedagem.',
      ephemeral: true
    };

    if (interaction.deferred) {
      await interaction.editReply(mensagem.content).catch(() => {});
    } else if (interaction.replied) {
      await interaction.followUp(mensagem).catch(() => {});
    } else {
      await interaction.reply(mensagem).catch(() => {});
    }
  }
});

async function iniciar() {
  try {
    await registrarComandos();
    await client.login(process.env.DISCORD_TOKEN);
  } catch (erro) {
    console.error('❌ Não foi possível iniciar o bot:', erro);
    process.exitCode = 1;
  }
}

iniciar();
