const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus 
} = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = '!';
const queue = new Map();

client.once('ready', () => {
  console.log(`🤖 Bot online como: \${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const serverQueue = queue.get(message.guild.id);

  switch (command) {
    case 'play':
    case 'p':
      executePlay(message, args, serverQueue);
      break;
    case 'skip':
    case 's':
      skipSong(message, serverQueue);
      break;
    case 'pause':
      pauseSong(message, serverQueue);
      break;
    case 'resume':
      resumeSong(message, serverQueue);
      break;
    case 'stop':
    case 'leave':
      stopBot(message, serverQueue);
      break;
    case 'queue':
    case 'q':
      showQueue(message, serverQueue);
      break;
  }
});

async function executePlay(message, args, serverQueue) {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply('❌ Você precisa estar em um canal de voz para tocar música!');
  }

  const permissions = voiceChannel.permissionsFor(message.client.user);
  if (!permissions.has('Connect') || !permissions.has('Speak')) {
    return message.reply('❌ Preciso de permissões para conectar e falar no seu canal de voz!');
  }

  const query = args.join(' ');
  if (!query) {
    return message.reply('❌ Forneça o nome ou o link da música que deseja ouvir!');
  }

  let songInfo;
  try {
    const ytSearch = await play.search(query, { limit: 1 });
    if (!ytSearch || ytSearch.length === 0) {
      return message.reply('❌ Nenhuma música foi encontrada com essa busca.');
    }
    songInfo = ytSearch[0];
  } catch (error) {
    console.error(error);
    return message.reply('⚠️ Ocorreu um erro ao buscar a música.');
  }

  const song = {
    title: songInfo.title,
    url: songInfo.url,
    duration: songInfo.durationRaw,
    thumbnail: songInfo.thumbnails[0]?.url
  };

  if (!serverQueue) {
    const queueConstruct = {
      textChannel: message.channel,
      voiceChannel: voiceChannel,
      connection: null,
      player: createAudioPlayer(),
      songs: [],
      playing: true
    };

    queue.set(message.guild.id, queueConstruct);
    queueConstruct.songs.push(song);

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      queueConstruct.connection = connection;
      connection.subscribe(queueConstruct.player);

      queueConstruct.player.on(AudioPlayerStatus.Idle, () => {
        queueConstruct.songs.shift();
        playNextSong(message.guild.id);
      });

      queueConstruct.player.on('error', (error) => {
        console.error('Erro na reprodução:', error);
        queueConstruct.songs.shift();
        playNextSong(message.guild.id);
      });

      playNextSong(message.guild.id);

    } catch (err) {
      console.error(err);
      queue.delete(message.guild.id);
      return message.reply('⚠️ Não foi possível conectar ao canal de voz.');
    }
  } else {
    serverQueue.songs.push(song);
    
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('✅ Adicionado à Fila')
      .setDescription(`[${song.title}](${song.url})`)
      .addFields({ name: 'Duração', value: song.duration, inline: true })
      .setThumbnail(song.thumbnail);

    return message.channel.send({ embeds: [embed] });
  }
}

async function playNextSong(guildId) {
  const serverQueue = queue.get(guildId);

  if (!serverQueue) return;

  if (serverQueue.songs.length === 0) {
    if (serverQueue.connection) {
      serverQueue.connection.destroy();
    }
    queue.delete(guildId);
    return serverQueue.textChannel.send('🎶 A fila acabou. Desconectando do canal de voz.');
  }

  const song = serverQueue.songs[0];

  try {
    const stream = await play.stream(song.url);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type
    });

    serverQueue.player.play(resource);

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🎵 Tocando Agora')
      .setDescription(`[${song.title}](${song.url})`)
      .addFields({ name: 'Duração', value: song.duration, inline: true })
      .setThumbnail(song.thumbnail);

    serverQueue.textChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    serverQueue.textChannel.send(`⚠️ Erro ao tentar reproduzir **\${song.title}**. Pulando...`);
    serverQueue.songs.shift();
    playNextSong(guildId);
  }
}

function skipSong(message, serverQueue) {
  if (!message.member.voice.channel) {
    return message.reply('❌ Você precisa estar em um canal de voz para pular a música!');
  }
  if (!serverQueue || serverQueue.songs.length === 0) {
    return message.reply('❌ Não há nenhuma música tocando para pular.');
  }

  serverQueue.player.stop();
  message.reply('⏭️ Música pulada!');
}

function pauseSong(message, serverQueue) {
  if (!message.member.voice.channel) {
    return message.reply('❌ Você precisa estar no canal de voz!');
  }
  if (!serverQueue) {
    return message.reply('❌ Não há nenhuma música tocando no momento.');
  }

  if (serverQueue.player.pause()) {
    message.reply('⏸️ Música pausada.');
  } else {
    message.reply('⚠️ A música já está pausada ou não pode ser pausada.');
  }
}

function resumeSong(message, serverQueue) {
  if (!message.member.voice.channel) {
    return message.reply('❌ Você precisa estar no canal de voz!');
  }
  if (!serverQueue) {
    return message.reply('❌ Não há nenhuma música tocando no momento.');
  }

  if (serverQueue.player.unpause()) {
    message.reply('▶️ Música retomada.');
  } else {
    message.reply('⚠️ A música não está pausada.');
  }
}

function stopBot(message, serverQueue) {
  if (!message.member.voice.channel) {
    return message.reply('❌ Você precisa estar no canal de voz para parar o bot!');
  }

  if (!serverQueue) {
    return message.reply('❌ O bot não está tocando nada no momento.');
  }

  serverQueue.songs = [];
  if (serverQueue.connection) {
    serverQueue.connection.destroy();
  }
  queue.delete(message.guild.id);
  message.reply('👋 Reprodução interrompida e desconectado.');
}

function showQueue(message, serverQueue) {
  if (!serverQueue || serverQueue.songs.length === 0) {
    return message.reply('📜 A fila está vazia no momento.');
  }

  let queueList = serverQueue.songs
    .slice(0, 10)
    .map((song, index) => `\${index === 0 ? '▶️ **Tocando agora:**' : `**${index}.**`} \${song.title} \`(${song.duration})\``)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor('#FEE75C')
    .setTitle('📜 Fila de Reprodução')
    .setDescription(queueList)
    .setFooter({ text: `Total de músicas na fila: ${serverQueue.songs.length}` });

  message.channel.send({ embeds: [embed] });
}

const TOKEN = 'SEU_TOKEN_AQUI';

client.login(TOKEN);
