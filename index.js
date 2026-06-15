// 1行目に環境変数を強制設定（Render上で確実に動かすため）
process.env.FFMPEG_PATH = require('ffmpeg-static');

const { Client, GatewayIntentBits, ApplicationCommandType, ContextMenuCommandBuilder } = require('discord.js');
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

        // 考え中（保留状態）を開始
        await interaction.deferReply();

        // サーバーが停止しないよう一時保存先を /tmp フォルダ（Linuxの安全な場所）に変更
        const inputPath = path.join('/tmp', attachment.name);
        const outputPath = path.join('/tmp', `${path.parse(attachment.name).name}.mp3`);

        try {
            // ファイルのダウンロード処理
            const response = await axios({ method: 'GET', url: attachment.url, responseType: 'stream' });
            const writer = fs.createWriteStream(inputPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // 音声のMP3変換処理
            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .setFfmpegPath(process.env.FFMPEG_PATH) // 明示的にパスを指定
                    .toFormat('mp3')
                    .on('end', () => {
                        console.log('FFmpegの変換が成功しました');
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error('FFmpeg内部エラー:', err.message);
                        reject(err);
                    })
                    .save(outputPath);
            });

            // 【超強力・プレイヤー化を100%阻止する設定】
            // 末尾を「.mp3.bin」という名前に偽装して送信します。
            const fileBuffer = fs.readFileSync(outputPath);
            const fileName = `${path.parse(attachment.name).name}.mp3.bin`;

            await interaction.followUp({ 
                content: '✅ MP3への変換が完了しました！ダウンロード後、ファイル名の末尾の「.bin」を消すと通常のMP3として使用できます。', 
                files: [{
                    attachment: fileBuffer,
                    name: fileName
                }] 
            });

        } catch (error) {
            console.error('全体の処理エラー:', error);
            await interaction.followUp({ content: `❌ 変換中にエラーが発生して停止しました。\n理由: ${error.message || error}` });
        } finally {
            // ファイルの片付け
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
