process.env.FFMPEG_PATH = require('ffmpeg-static');

const { Client, GatewayIntentBits, ApplicationCommandType, ContextMenuCommandBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const express = require('express'); // 外部ページ公開用の仕組み
require('dotenv').config();

// Webサーバーの初期化
const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// 配信用のフォルダがなければ自動作成
if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR);
}

// フォルダ内のファイルをインターネット上に静的公開する設定
app.use('/download', express.static(PUBLIC_DIR));

// サーバーのトップページ（確認用）
app.get('/', (req, res) => {
    res.send('MP3 Converter Bot is Running Successfully!');
});

// サーバーを起動
const server = app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

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

        await interaction.deferReply();

        // 外部に一時公開するためのランダムなIDと名前を生成
        const fileId = Math.random().toString(36).substring(2, 15);
        const inputPath = path.join('/tmp', `${fileId}_${attachment.name}`);
        
        const baseName = path.parse(attachment.name).name;
        const mp3FileName = `${baseName}.mp3`;
        // 公開用フォルダ配下に保存するパス
        const outputPath = path.join(PUBLIC_DIR, `${fileId}_${mp3FileName}`);

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
                    .setFfmpegPath(process.env.FFMPEG_PATH)
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

            // Renderサーバー自身のWebサイトのURLを取得（末尾のスラッシュを削除）
            // ※Renderの環境変数から自動取得できない場合は手動で書き換えも可能です
            let serverUrl = interaction.client.user.id; // フォールバック
            
            // 外部からアクセスできるURLを組み立てる
            // Renderでは自動的にWebサービスにURLが割り当てられます
            const renderHost = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`;
            const downloadUrl = `${renderHost}/download/${fileId}_${encodeURIComponent(mp3FileName)}`;

            await interaction.followUp({ 
                content: `✅ MP3への変換が完了しました！\n以下の外部ページURLをタップすると、ブラウザ（Safari/Chrome）から直接確実にダウンロードできます。\n\n🌐 **ダウンロード用リンク:**\n${downloadUrl}\n\n*※セキュリティのため、このリンクは15分後に自動で消去されます。*`
            });

            // 15分後（900,000ミリ秒）にサーバー内からファイルを自動消去する安全タイマー
            setTimeout(() => {
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                    console.log(`一時ファイルを自動消去しました: ${mp3FileName}`);
                }
            }, 900000);

        } catch (error) {
            console.error('全体の処理エラー:', error);
            await interaction.followUp({ content: `❌ 変換中にエラーが発生して停止しました。\n理由: ${error.message || error}` });
            // エラー時もゴミファイルを掃除
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } finally {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
