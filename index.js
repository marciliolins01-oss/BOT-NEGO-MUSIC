
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const fs = require('node:fs');
require('dotenv').config();

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
  console.error('Configure DISCORD_TOKEN e CLIENT_ID no arquivo .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message]
});

const player = new Player(client);
const DATA_FILE = './data.json';

let data = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    data = {};
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function guildData(guildId) {
  if (!data[guildId]) {
    data[guildId] = {
      logs: null,
      welcome: null,
      tickets: null,
      users: {},
      spam: {}
    };
  }
  return data[guildId];
}

function userData(guildId, userId) {
  const g = guildData(guildId);

  if (!g.users[userId]) {
    g.users[userId] = {
      coins: 0,
      xp: 0,
      level: 0,
      daily: 0,
      work: 0,
      lastXp: 0
    };
  }

  return g.users[userId];
}

async function sendLog(guild, message) {
  const id = guildData(guild.id).logs;
  if (!id) return;

  const channel = guild.channels.cache.get(id);
  if (!channel || !channel.isTextBased()) return;

  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00bfff)
          .setDescription(message)
          .setTimestamp()
      ]
    });
  } catch {}
}

// ===============================
// PAINEL MUSICAL
// ===============================

function criarPainelMusica(track) {
  const embed = new EmbedBuilder()
    .setColor(0x00bfff)
    .setTitle('🎵 NEGO SYSTEM • MUSIC')
    .setDescription(`**Tocando agora**\n[${track.title}](${track.url})`)
    .addFields(
      {
        name: '🎤 Artista',
        value: String(track.author || 'Desconhecido').slice(0, 1024),
        inline: true
      },
      {
        name: '⏱️ Duração',
        value: track.duration || 'Desconhecida',
        inline: true
      }
    )
    .setFooter({ text: 'NEGO SYSTEM • Painel musical' });

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_pause')
      .setLabel('Pausar/Continuar')
      .setEmoji('⏯️')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('music_skip')
      .setLabel('Pular')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('music_shuffle')
      .setLabel('Embaralhar')
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('music_queue')
      .setLabel('Fila')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('music_stop')
      .setLabel('Parar')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

// ===============================
// COMANDOS
// ===============================

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Ver a latência do bot'),

  new SlashCommandBuilder()
    .setName('sobre')
    .setDescription('Informações do NEGO SYSTEM'),

  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Abrir o painel principal'),

  new SlashCommandBuilder()
    .setName('banir')
    .setDescription('Banir um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o =>
      o.setName('membro').setDescription('Membro').setRequired(true))
    .addStringOption(o =>
      o.setName('motivo').setDescription('Motivo')),

  new SlashCommandBuilder()
    .setName('expulsar')
    .setDescription('Expulsar um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o =>
      o.setName('membro').setDescription('Membro').setRequired(true))
    .addStringOption(o =>
      o.setName('motivo').setDescription('Motivo')),

  new SlashCommandBuilder()
    .setName('castigo')
    .setDescription('Aplicar timeout')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('membro').setDescription('Membro').setRequired(true))
    .addIntegerOption(o =>
      o.setName('minutos')
        .setDescription('Duração em minutos')
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true))
    .addStringOption(o =>
      o.setName('motivo').setDescription('Motivo')),

  new SlashCommandBuilder()
    .setName('retirar-castigo')
    .setDescription('Retirar timeout')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('membro').setDescription('Membro').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Limpar mensagens')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o =>
      o.setName('modo')
        .setDescription('Como deseja limpar')
        .setRequired(true)
        .addChoices(
          { name: 'Quantidade', value: 'quantidade' },
          { name: 'Por membro', value: 'membro' },
          { name: 'Por palavra', value: 'palavra' }
        ))
    .addIntegerOption(o =>
      o.setName('quantidade')
        .setDescription('Quantidade de 1 a 100')
        .setMinValue(1)
        .setMaxValue(100))
    .addUserOption(o =>
      o.setName('membro').setDescription('Membro a filtrar'))
    .addStringOption(o =>
      o.setName('palavra').setDescription('Palavra a procurar')),

  new SlashCommandBuilder()
    .setName('config-logs')
    .setDescription('Definir canal de logs')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o =>
      o.setName('canal')
        .setDescription('Canal de logs')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('config-boasvindas')
    .setDescription('Definir canal de boas-vindas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o =>
      o.setName('canal')
        .setDescription('Canal de boas-vindas')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('config-tickets')
    .setDescription('Definir categoria de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o =>
      o.setName('categoria')
        .setDescription('Categoria de tickets')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticket-painel')
    .setDescription('Publicar painel de atendimento')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('cargo-dar')
    .setDescription('Dar cargo a um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o =>
      o.setName('membro').setDescription('Membro').setRequired(true))
    .addRoleOption(o =>
      o.setName('cargo').setDescription('Cargo').setRequired(true)),

  new SlashCommandBuilder()
    .setName('cargo-remover')
    .setDescription('Remover cargo de um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o =>
      o.setName('membro').setDescription('Membro').setRequired(true))
    .addRoleOption(o =>
      o.setName('cargo').setDescription('Cargo').setRequired(true)),

  new SlashCommandBuilder()
    .setName('canal-criar')
    .setDescription('Criar canal de texto')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o =>
      o.setName('nome').setDescription('Nome do canal').setRequired(true)),

  new SlashCommandBuilder()
    .setName('saldo')
    .setDescription('Ver saldo')
    .addUserOption(o =>
      o.setName('membro').setDescription('Membro opcional')),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Receber moedas diárias'),

  new SlashCommandBuilder()
    .setName('trabalhar')
    .setDescription('Trabalhar para ganhar moedas'),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Ver nível e XP'),

  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Tocar música')
    .addStringOption(o =>
      o.setName('musica').setDescription('Nome ou link').setRequired(true)),

  new SlashCommandBuilder()
    .setName('pular')
    .setDescription('Pular música'),

  new SlashCommandBuilder()
    .setName('pausar')
    .setDescription('Pausar música'),

  new SlashCommandBuilder()
    .setName('continuar')
    .setDescription('Continuar música'),

  new SlashCommandBuilder()
    .setName('parar')
    .setDescription('Parar música'),

  new SlashCommandBuilder()
    .setName('fila')
    .setDescription('Ver fila de músicas')
].map(command => command.toJSON());

// ===============================
// INICIALIZAÇÃO
// ===============================

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} está online!`);

  try {
    await player.extractors.loadMulti(DefaultExtractors);
    console.log('🎵 Extratores carregados.');
  } catch (error) {
    console.error('Erro ao carregar extratores:', error);
  }

  try {
    const rest = new REST({ version: '10' })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Comandos registrados.');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

player.events.on('playerStart', (queue, track) => {
  const channel = queue.metadata;

  if (channel?.isTextBased()) {
    channel.send(criarPainelMusica(track)).catch(() => {});
  }
});

player.events.on('error', (queue, error) => {
  console.error('Erro no player:', error.message);
});

player.events.on('playerError', (queue, error) => {
  console.error('Erro ao tocar música:', error.message);
});

// ===============================
// BOAS-VINDAS E LOGS
// ===============================

client.on('guildMemberAdd', async member => {
  const g = guildData(member.guild.id);

  if (g.welcome) {
    const channel = member.guild.channels.cache.get(g.welcome);

    if (channel) {
      channel.send(
        `👋 Boas-vindas, ${member}! Seja bem-vindo(a) ao **${member.guild.name}**!`
      ).catch(() => {});
    }
  }

  await sendLog(member.guild, `📥 ${member.user.tag} entrou no servidor.`);
});

client.on('guildMemberRemove', async member => {
  await sendLog(member.guild, `📤 ${member.user.tag} saiu do servidor.`);
});

client.on('messageDelete', async message => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    `🗑️ Mensagem apagada de **${message.author?.tag || 'desconhecido'}** em ${message.channel}.`
  );
});

// ===============================
// XP E ANTI-SPAM
// ===============================

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  const g = guildData(message.guild.id);
  const id = message.author.id;
  const now = Date.now();

  if (!g.spam[id]) g.spam[id] = [];

  g.spam[id] = g.spam[id].filter(time => now - time < 6000);
  g.spam[id].push(now);

  if (g.spam[id].length >= 6) {
    g.spam[id] = [];

    try {
      if (message.member?.moderatable) {
        await message.member.timeout(60000, 'Anti-spam automático');
        await sendLog(
          message.guild,
          `🛡️ ${message.author.tag} recebeu timeout por spam.`
        );
      }
    } catch {}

    saveData();
    return;
  }

  const user = userData(message.guild.id, id);

  if (!user.lastXp || now - user.lastXp >= 60000) {
    user.lastXp = now;
    user.xp += Math.floor(Math.random() * 8) + 5;

    const needed = (user.level + 1) * 100;

    if (user.xp >= needed) {
      user.xp -= needed;
      user.level++;

      message.channel.send(
        `🎉 ${message.author}, você chegou ao nível **${user.level}**!`
      ).catch(() => {});
    }

    saveData();
  }
});

// ===============================
// INTERAÇÕES
// ===============================

client.on('interactionCreate', async interaction => {
  try {
    // COMANDOS SLASH
    if (interaction.isChatInputCommand()) {
      const { commandName, guild, member } = interaction;
      const g = guild ? guildData(guild.id) : null;

      if (commandName === 'ping') {
        return interaction.reply(`🏓 Pong! ${client.ws.ping} ms`);
      }

      if (commandName === 'sobre') {
        const embed = new EmbedBuilder()
          .setColor(0x00bfff)
          .setTitle('NEGO SYSTEM')
          .setDescription('Bot multifunções para servidores Discord.')
          .addFields(
            { name: '🛡️ Moderação', value: 'Banimentos, expulsões, castigos e clear', inline: true },
            { name: '🎫 Atendimento', value: 'Tickets privados', inline: true },
            { name: '🎵 Música', value: 'Player com painel interativo', inline: true },
            { name: '💰 Economia', value: 'Moedas e trabalho', inline: true },
            { name: '📈 Níveis', value: 'XP por mensagens', inline: true },
            { name: '🔐 Segurança', value: 'Proteção contra spam', inline: true }
          );

        return interaction.reply({ embeds: [embed] });
      }

      if (commandName === 'painel') {
        const embed = new EmbedBuilder()
          .setColor(0x00bfff)
          .setTitle('⚙️ NEGO SYSTEM — Painel')
          .setDescription('Comandos principais do servidor')
          .addFields(
            { name: '🛡️ Moderação', value: '`/banir` `/expulsar` `/castigo` `/clear`' },
            { name: '🎫 Tickets', value: '`/config-tickets` `/ticket-painel`' },
            { name: '📋 Registros', value: '`/config-logs` `/config-boasvindas`' },
            { name: '🎵 Música', value: '`/play` `/pausar` `/continuar` `/pular` `/parar` `/fila`' },
            { name: '💰 Comunidade', value: '`/saldo` `/daily` `/trabalhar` `/rank`' }
          );

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // BANIR
      if (commandName === 'banir') {
        const user = interaction.options.getUser('membro');
        const reason = interaction.options.getString('motivo') || 'Sem motivo informado';
        const target = await guild.members.fetch(user.id);

        if (!target.bannable) {
          return interaction.reply({
            content: '❌ Não consigo banir esse membro. Confira a hierarquia dos cargos.',
            ephemeral: true
          });
        }

        await target.ban({ reason });
        await interaction.reply(`🔨 ${user.tag} foi banido. Motivo: ${reason}`);
        await sendLog(guild, `🔨 **${user.tag}** foi banido por ${interaction.user.tag}. Motivo: ${reason}`);
        return;
      }

      // EXPULSAR
      if (commandName === 'expulsar') {
        const user = interaction.options.getUser('membro');
        const reason = interaction.options.getString('motivo') || 'Sem motivo informado';
        const target = await guild.members.fetch(user.id);

        if (!target.kickable) {
          return interaction.reply({
            content: '❌ Não consigo expulsar esse membro. Confira a hierarquia dos cargos.',
            ephemeral: true
          });
        }

        await target.kick(reason);
        await interaction.reply(`👢 ${user.tag} foi expulso. Motivo: ${reason}`);
        await sendLog(guild, `👢 ${user.tag} foi expulso por ${interaction.user.tag}. Motivo: ${reason}`);
        return;
      }

      // CASTIGO
      if (commandName === 'castigo') {
        const user = interaction.options.getUser('membro');
        const minutes = interaction.options.getInteger('minutos');
        const reason = interaction.options.getString('motivo') || 'Sem motivo informado';
        const target = await guild.members.fetch(user.id);

        if (!target.moderatable) {
          return interaction.reply({
            content: '❌ Não consigo aplicar castigo nesse membro.',
            ephemeral: true
          });
        }

        await target.timeout(minutes * 60000, reason);
        await interaction.reply(`🔇 ${user.tag} recebeu castigo por ${minutes} minuto(s).`);
        await sendLog(guild, `🔇 ${user.tag} recebeu castigo por ${minutes} minuto(s). Motivo: ${reason}`);
        return;
      }

      // RETIRAR CASTIGO
      if (commandName === 'retirar-castigo') {
        const user = interaction.options.getUser('membro');
        const target = await guild.members.fetch(user.id);

        if (!target.moderatable) {
          return interaction.reply({
            content: '❌ Não consigo alterar esse membro.',
            ephemeral: true
          });
        }

        await target.timeout(null);
        return interaction.reply(`🔊 Castigo retirado de ${user.tag}.`);
      }

      // CLEAR
      if (commandName === 'clear') {
        const mode = interaction.options.getString('modo');
        const amount = interaction.options.getInteger('quantidade');
        const target = interaction.options.getUser('membro');
        const word = interaction.options.getString('palavra');

        if (mode === 'quantidade' && !amount) {
          return interaction.reply({
            content: '❌ Informe a quantidade de 1 a 100.',
            ephemeral: true
          });
        }

        if (mode === 'membro' && !target) {
          return interaction.reply({
            content: '❌ Escolha o membro a filtrar.',
            ephemeral: true
          });
        }

        if (mode === 'palavra' && !word?.trim()) {
          return interaction.reply({
            content: '❌ Informe a palavra a procurar.',
            ephemeral: true
          });
        }

        if (!interaction.channel?.messages) {
          return interaction.reply({
            content: '❌ Use esse comando em um canal de texto.',
            ephemeral: true
          });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
          let deleted;

          if (mode === 'quantidade') {
            deleted = await interaction.channel.bulkDelete(amount, true);
          } else {
            const recent = await interaction.channel.messages.fetch({ limit: 100 });

            const filtered = recent.filter(message => {
              if (message.author?.bot) return false;

              if (mode === 'membro') {
                return message.author?.id === target.id;
              }

              if (mode === 'palavra') {
                return message.content.toLowerCase().includes(word.trim().toLowerCase());
              }

              return false;
            });

            deleted = await interaction.channel.bulkDelete(filtered, true);
          }

          await sendLog(
            guild,
            `🧹 ${interaction.user.tag} apagou ${deleted.size} mensagem(ns) em ${interaction.channel}.`
          );

          return interaction.editReply(
            `🧹 Foram apagadas **${deleted.size} mensagem(ns)**.`
          );
        } catch (error) {
          console.error('Erro no /clear:', error);

          return interaction.editReply(
            '❌ Não consegui limpar. Confira a permissão Gerenciar mensagens. Mensagens com mais de 14 dias não podem ser apagadas em lote.'
          );
        }
      }

      // CONFIGURAR LOGS
      if (commandName === 'config-logs') {
        const channel = interaction.options.getChannel('canal');
        g.logs = channel.id;
        saveData();

        return interaction.reply(`✅ Canal de logs definido para ${channel}.`);
      }

      // CONFIGURAR BOAS-VINDAS
      if (commandName === 'config-boasvindas') {
        const channel = interaction.options.getChannel('canal');
        g.welcome = channel.id;
        saveData();

        return interaction.reply(`✅ Canal de boas-vindas definido para ${channel}.`);
      }

      // CONFIGURAR TICKETS
      if (commandName === 'config-tickets') {
        const category = interaction.options.getChannel('categoria');
        g.tickets = category.id;
        saveData();

        return interaction.reply(`✅ Categoria de tickets definida para **${category.name}**.`);
      }

      // DAR OU REMOVER CARGO
      if (commandName === 'cargo-dar' || commandName === 'cargo-remover') {
        const user = interaction.options.getUser('membro');
        const role = interaction.options.getRole('cargo');
        const target = await guild.members.fetch(user.id);

        if (role.managed || role.position >= guild.members.me.roles.highest.position) {
          return interaction.reply({
            content: '❌ Meu cargo precisa estar acima do cargo escolhido.',
            ephemeral: true
          });
        }

        if (commandName === 'cargo-dar') {
          await target.roles.add(role);
        } else {
          await target.roles.remove(role);
        }

        return interaction.reply(
          `✅ Cargo ${commandName === 'cargo-dar' ? 'adicionado a' : 'removido de'} ${user}.`
        );
      }

      // CRIAR CANAL
      if (commandName === 'canal-criar') {
        const name = interaction.options.getString('nome')
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, '-')
          .slice(0, 90);

        const channel = await guild.channels.create({
          name,
          type: ChannelType.GuildText
        });

        return interaction.reply(`✅ Canal criado: ${channel}`);
      }

      // SALDO
      if (commandName === 'saldo') {
        const user = interaction.options.getUser('membro') || interaction.user;
        const account = userData(guild.id, user.id);
        saveData();

        return interaction.reply(
          `💰 ${user.username} possui **${account.coins} moedas**.`
        );
      }

      // DAILY
      if (commandName === 'daily') {
        const account = userData(guild.id, interaction.user.id);
        const now = Date.now();

        if (account.daily && now - account.daily < 86400000) {
          const hours = Math.ceil((86400000 - (now - account.daily)) / 3600000);

          return interaction.reply({
            content: `⏳ Volte em aproximadamente ${hours} hora(s).`,
            ephemeral: true
          });
        }

        account.daily = now;
        account.coins += 500;
        saveData();

        return interaction.reply('🎁 Você recebeu **500 moedas** diárias!');
      }

      // TRABALHAR
      if (commandName === 'trabalhar') {
        const account = userData(guild.id, interaction.user.id);
        const now = Date.now();

        if (account.work && now - account.work < 3600000) {
          return interaction.reply({
            content: '⏳ Você só pode trabalhar uma vez por hora.',
            ephemeral: true
          });
        }

        const earned = Math.floor(Math.random() * 251) + 100;
        account.work = now;
        account.coins += earned;
        saveData();

        return interaction.reply(`💼 Você ganhou **${earned} moedas**!`);
      }

      // RANK
      if (commandName === 'rank') {
        const account = userData(guild.id, interaction.user.id);

        return interaction.reply(
          `📈 **${interaction.user.username}** — Nível ${account.level} | XP: ${account.xp}/${(account.level + 1) * 100}`
        );
      }

      // PLAY
      if (commandName === 'play') {
        const voice = member.voice?.channel;

        if (!voice) {
          return interaction.reply({
            content: '🔊 Entre em um canal de voz primeiro.',
            ephemeral: true
          });
        }

        await interaction.deferReply();

        try {
          await player.play(
            voice,
            interaction.options.getString('musica'),
            { nodeOptions: { metadata: interaction.channel } }
          );

          return interaction.editReply(
            '🎵 Pedido enviado! O painel aparece quando a música começar.'
          );
        } catch (error) {
          console.error('Erro no /play:', error);

          return interaction.editReply(
            '❌ Não consegui tocar. Confira as fontes de música e as permissões de voz.'
          );
        }
      }

      // COMANDOS DE MÚSICA
      if (['pular', 'pausar', 'continuar', 'parar', 'fila'].includes(commandName)) {
        const queue = player.nodes.get(guild.id);

        if (!queue) {
          return interaction.reply({
            content: '❌ Não há música tocando.',
            ephemeral: true
          });
        }

        if (commandName !== 'fila') {
          const voice = member.voice?.channel;
          const botVoice = guild.members.me?.voice?.channel;

          if (!voice || (botVoice && voice.id !== botVoice.id)) {
            return interaction.reply({
              content: '🔊 Entre no mesmo canal de voz que o bot.',
              ephemeral: true
            });
          }
        }

        if (commandName === 'pular') {
          queue.node.skip();
          return interaction.reply('⏭️ Música pulada.');
        }

        if (commandName === 'pausar') {
          queue.node.pause();
          return interaction.reply('⏸️ Música pausada.');
        }

        if (commandName === 'continuar') {
          queue.node.resume();
          return interaction.reply('▶️ Música retomada.');
        }

        if (commandName === 'parar') {
          queue.delete();
          return interaction.reply('⏹️ Música parada e fila limpa.');
        }

        const tracks = queue.tracks.toArray().slice(0, 10);

        return interaction.reply(
          tracks.length
            ? `🎶 **Próximas músicas:**\n${tracks.map((track, i) => `${i + 1}. ${track.title}`).join('\n')}`
            : '🎶 Não há próximas músicas na fila.'
        );
      }

      // PUBLICAR PAINEL DE TICKETS
      if (commandName === 'ticket-painel') {
        const embed = new EmbedBuilder()
          .setColor(0x00bfff)
          .setTitle('🎫 Atendimento')
          .setDescription('Clique no botão abaixo para abrir um ticket privado com a equipe.');

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_abrir')
            .setLabel('Abrir ticket')
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({
          embeds: [embed],
          components: [row]
        });
      }
    }

    // ===============================
    // BOTÕES
    // ===============================

    if (interaction.isButton()) {
      // BOTÕES DE MÚSICA
      if (interaction.customId.startsWith('music_')) {
        const queue = interaction.guild
          ? player.nodes.get(interaction.guild.id)
          : null;

        if (!queue) {
          return interaction.reply({
            content: '❌ Não há música tocando.',
            ephemeral: true
          });
        }

        const voice = interaction.member?.voice?.channel;
        const botVoice = interaction.guild.members.me?.voice?.channel;

        if (!voice || (botVoice && voice.id !== botVoice.id)) {
          return interaction.reply({
            content: '🔊 Entre no mesmo canal de voz que o bot.',
            ephemeral: true
          });
        }

        if (interaction.customId === 'music_pause') {
          if (queue.node.isPaused()) {
            queue.node.resume();

            return interaction.reply({
              content: '▶️ Música retomada!',
              ephemeral: true
            });
          }

          queue.node.pause();

          return interaction.reply({
            content: '⏸️ Música pausada!',
            ephemeral: true
          });
        }

        if (interaction.customId === 'music_skip') {
          queue.node.skip();

          return interaction.reply({
            content: '⏭️ Música pulada!',
            ephemeral: true
          });
        }

        if (interaction.customId === 'music_stop') {
          queue.delete();

          return interaction.reply({
            content: '⏹️ Música parada e fila limpa!',
            ephemeral: true
          });
        }

        if (interaction.customId === 'music_shuffle') {
          if (queue.tracks.size < 2) {
            return interaction.reply({
              content: '❌ Adicione pelo menos duas músicas à fila.',
              ephemeral: true
            });
          }

          queue.tracks.shuffle();

          return interaction.reply({
            content: '🔀 Fila embaralhada!',
            ephemeral: true
          });
        }

        if (interaction.customId === 'music_queue') {
          const tracks = queue.tracks.toArray().slice(0, 10);

          return interaction.reply({
            content: tracks.length
              ? `📜 **Próximas músicas:**\n${tracks.map((track, i) => `${i + 1}. ${track.title}`).join('\n')}`
              : '📜 A fila está vazia.',
            ephemeral: true
          });
        }
      }

      // ABRIR TICKET
      if (interaction.customId === 'ticket_abrir') {
        const guild = interaction.guild;
        const g = guildData(guild.id);

        const existing = guild.channels.cache.find(channel =>
          channel.type === ChannelType.GuildText &&
          channel.topic === `ticket-user:${interaction.user.id}`
        );

        if (existing) {
          return interaction.reply({
            content: `Você já tem um ticket aberto: ${existing}`,
            ephemeral: true
          });
        }

        const options = {
          name: `ticket-${interaction.user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .slice(0, 90),
          type: ChannelType.GuildText,
          topic: `ticket-user:${interaction.user.id}`,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
              ]
            },
            {
              id: client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ReadMessageHistory
              ]
            }
          ]
        };

        if (g.tickets) options.parent = g.tickets;

        const channel = await guild.channels.create(options);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_fechar')
            .setLabel('Fechar ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
        );

        await channel.send({
          content: `${interaction.user} conte à equipe como podemos ajudar.`,
          embeds: [
            new EmbedBuilder()
              .setColor(0x00bfff)
              .setTitle('🎫 Ticket aberto')
          ],
          components: [row]
        });

        return interaction.reply({
          content: `✅ Seu ticket foi criado: ${channel}`,
          ephemeral: true
        });
      }

      // FECHAR TICKET
      if (interaction.customId === 'ticket_fechar') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
          const ownerId = interaction.channel.topic?.replace('ticket-user:', '');

          if (ownerId !== interaction.user.id) {
            return interaction.reply({
              content: '❌ Só o dono do ticket ou a equipe pode fechá-lo.',
              ephemeral: true
            });
          }
        }

        await interaction.reply('🔒 Ticket será fechado em 5 segundos.');

        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 5000);

        return;
      }
    }
  } catch (error) {
    console.error('Erro na interação:', error);

    const message =
      '❌ Ocorreu um erro. Confira as permissões do bot e o terminal.';

    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: message,
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: message,
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
});

process.on('unhandledRejection', error => {
  console.error('Erro não tratado:', error);
});

client.login(process.env.DISCORD_TOKEN);
