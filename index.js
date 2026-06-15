// 一番最初（1行目）にこれを追加します
process.env.FFMPEG_PATH = require('ffmpeg-static');
const { Client, GatewayIntentBits, ApplicationCommandType, ContextMenuCommandBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// 長押しメニューに表示する名前の定義
const mp3Command = new ContextMenuCommandBuilder()
    .setName('MP3に変換する') 
    .setType(ApplicationCommandType.Message);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        await client.application.commands.set([mp3Command]);
        console.log('コマンドの登録に成功しました！');
    } catch (error) {
        console.error('コマンドの登録エラー:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isMessageContextMenuCommand()) return;

    if (interaction.commandName === 'MP3に変換する') {
        const targetMessage = interaction.targetMessage;
        
        if (targetMessage.attachments.size === 0) {
            return interaction.reply({ content: '❌ このメッセージにはファイルが添付されていません。', ephemeral: true });
        }

        const attachment = targetMessage.attachments.first();
        
        if (!attachment.contentType || !attachment.contentType.startsWith('audio/')) {
            return interaction.reply({ content: '❌ 添付されているファイルは音声データではありません。', ephemeral: true });
        }

        await interaction.deferReply();

        const inputPath = path.join(__dirname, attachment.name);
        const outputPath = path.join(__dirname, `${path.parse(attachment.name).name}.mp3`);

        try {
            const response = await axios({ method: 'GET', url: attachment.url, responseType: 'stream' });
            const writer = fs.createWriteStream(inputPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .toFormat('mp3')
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err))
                    .save(outputPath);
            });

            const file = new AttachmentBuilder(outputPath);
            await interaction.followup({ content: '✅ MP3への変換が完了しました！', files: [file] });

        } catch (error) {
            console.error(error);
            await interaction.followup({ content: '❌ 変換中にエラーが発生しました。' });
        } finally {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }
    }
});

const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!\n');
}).listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);
