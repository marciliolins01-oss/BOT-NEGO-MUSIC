
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    NoSubscriberBehavior
} = require('@discordjs/voice');

const play = require('play-dl');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('❌ Configure DISCORD_TOKEN (ou TOKEN) e CLIENT_ID nas variáveis de ambiente.');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Toca uma música do YouTube')
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
        .setDescription('Pula a música atual'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Para a música e limpa a fila'),

    new SlashCommandBuilder()
        .setName('fila')
        .setDescription('Mostra a fila de músicas')
].map(command => command.toJSON());

const queues = new Map();

function createQueue(guildId) {
    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Pause
        }
    });

    const queue = {
        songs: [],
        connection: null,
        player,
        playing: false,
        textChannel: null
    };

    player.on(AudioPlayerStatus.Idle, () => {
        queue.playing = false;
        queue.songs.shift();
        playNext(guildId).catch(console.error);
    });

    player.on('error', error => {
        console.error('Erro no player:', error);
        if (queue.textChannel) {
            queue.textChannel.send(
                '❌ Erro ao reproduzir a música. Tentando a próxima...'
            ).catch(() => {});
        }
    });

    queues.set(guildId, queue);
    return queue;
}

async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.playing) return;

    if (queue.songs.length === 0) {
        return;
    }

    const song = queue.songs[0];
    queue.playing = true;

    try {
        const stream = await play.stream(song.url);

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });

        resource.volume.setVolume(0.7);
        queue.player.play(resource);

        if (queue.textChannel) {
            const embed = new EmbedBuilder()
                .setColor(0x8A2BE2)
                .setTitle('🎶 Tocando agora')
                .setDescription(`**[${song.title}](${song.url})**`)
                .setFooter({ text: `Pedido por ${song.requestedBy}` });

            queue.textChannel.send({ embeds: [embed] }).catch(() => {});
        }
    } catch (error) {
        console.error('Erro ao carregar música:', error);
        queue.playing = false;
        queue.songs.shift();
        playNext(guildId).catch(console.error);
    }
}

client.once('clientReady', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, guild, member, channel } = interaction;

    if (!guild) {
        await interaction.reply({
            content: '❌ Use este comando dentro de um servidor.',
            ephemeral: true
        }).catch(() => {});
        return;
    }

    // Reconhece a interação imediatamente para evitar expiração.
    try {
        await interaction.deferReply();
    } catch (error) {
        console.error('Não foi possível reconhecer a interação:', error.code || error.message);
        return;
    }

    try {
        if (commandName === 'play') {
            const voiceChannel = member.voice?.channel;

            if (!voiceChannel) {
                await interaction.editReply(
                    '❌ Entre em um canal de voz primeiro.'
                );
                return;
            }

            const query = interaction.options.getString('musica', true);
            await interaction.editReply('🔎 Procurando música...');

            let url;
            let title;

            if (play.yt_validate(query) === 'video') {
                url = query;
                const info = await play.video_basic_info(url);
                title = info.video_details.title;
            } else {
                const results = await play.search(query, {
                    limit: 1,
                    source: { youtube: 'video' }
                });

                if (!results.length) {
                    await interaction.editReply('❌ Não encontrei essa música.');
                    return;
                }

                url = results[0].url;
                title = results[0].title;
            }

            let queue = queues.get(guild.id);
            if (!queue) queue = createQueue(guild.id);

            if (
                queue.connection &&
                queue.connection.joinConfig.channelId !== voiceChannel.id
            ) {
                await interaction.editReply(
                    '❌ Já estou tocando em outro canal de voz neste servidor.'
                );
                return;
            }

            if (!queue.connection) {
                queue.connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfDeaf: true
                });

                queue.connection.subscribe(queue.player);

                queue.connection.on(
                    VoiceConnectionStatus.Disconnected,
                    () => {
                        queue.connection?.destroy();
                        queue.connection = null;
                        queue.player.stop(true);
                        queue.songs = [];
                        queue.playing = false;
                    }
                );

                await entersState(
                    queue.connection,
                    VoiceConnectionStatus.Ready,
                    20_000
                );
            }

            queue.textChannel = channel;
            queue.songs.push({
                title,
                url,
                requestedBy: interaction.user.username
            });

            if (!queue.playing) {
                await playNext(guild.id);
            }

            await interaction.editReply(
                queue.songs.length === 1 && queue.playing
                    ? `🎶 Carregando: **${title}**`
                    : `✅ Adicionada à fila: **${title}**`
            );

        } else if (commandName === 'pause') {
            const queue = queues.get(guild.id);

            if (!queue || !queue.playing) {
                await interaction.editReply('❌ Não tem música tocando.');
                return;
            }

            queue.player.pause();
            await interaction.editReply('⏸️ Música pausada.');

        } else if (commandName === 'resume') {
            const queue = queues.get(guild.id);

            if (!queue || !queue.player.unpause()) {
                await interaction.editReply('❌ Não há música pausada.');
                return;
            }

            await interaction.editReply('▶️ Música retomada.');

        } else if (commandName === 'skip') {
            const queue = queues.get(guild.id);

            if (!queue || !queue.playing) {
                await interaction.editReply('❌ Não tem música tocando.');
                return;
            }

            queue.player.stop(true);
            await interaction.editReply('⏭️ Música pulada.');

        } else if (commandName === 'stop') {
            const queue = queues.get(guild.id);

            if (!queue) {
                await interaction.editReply('❌ Não tem música tocando.');
                return;
            }

            queue.songs = [];
            queue.playing = false;
            queue.player.stop(true);

            if (queue.connection) {
                queue.connection.destroy();
                queue.connection = null;
            }

            queues.delete(guild.id);
            await interaction.editReply('⏹️ Música parada e fila limpa.');

        } else if (commandName === 'fila') {
            const queue = queues.get(guild.id);

            if (!queue || queue.songs.length === 0) {
                await interaction.editReply('📭 A fila está vazia.');
                return;
            }

            const description = queue.songs
                .slice(0, 10)
                .map((song, index) =>
                    `${index === 0 ? '🎵 **Tocando:**' : `${index}.`} [${song.title}](${song.url})`
                )
                .join('\n');

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x8A2BE2)
                        .setTitle('🎶 Fila de músicas')
                        .setDescription(description)
                ]
            });
        }
    } catch (error) {
        console.error(`Erro no comando /${commandName}:`, error);

        await interaction.editReply(
            '❌ Ocorreu um erro. Tente novamente em instantes.'
        ).catch(() => {});
    }
});

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        if (GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
            console.log('✅ Comandos registrados no servidor!');
        } else {
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands }
            );
            console.log('✅ Comandos globais registrados!');
        }
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
}

client.login(TOKEN)
    .then(registerCommands)
    .catch(error => {
        console.error('❌ Erro ao conectar ao Discord:', error);
    });
