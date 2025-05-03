require('dotenv').config();
const express = require('express');
const WebTorrent = require('webtorrent');
const mega = require('megajs');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const client = new WebTorrent();
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// MEGA Storage Setup
const megaStorage = new mega.Storage({
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD,
    autologin: false
});

// Active downloads tracker
const activeDownloads = new Map();

app.post('/download', async (req, res) => {
    const { magnetLink } = req.body;
    if (!magnetLink) return res.status(400).json({ error: 'Magnet link required' });

    try {
        const torrent = client.add(magnetLink, { path: TEMP_DIR });
        const downloadId = Date.now().toString();
        
        activeDownloads.set(downloadId, {
            progress: 0,
            name: 'Starting...',
            status: 'downloading'
        });

        torrent.on('download', () => {
            activeDownloads.set(downloadId, {
                progress: Math.round(torrent.progress * 100),
                name: torrent.name || 'Downloading...',
                status: 'downloading'
            });
        });

        torrent.on('done', async () => {
            try {
                activeDownloads.set(downloadId, { status: 'uploading', name: torrent.name });
                
                for (const file of torrent.files) {
                    const filePath = path.join(TEMP_DIR, file.name);
                    await new Promise((resolve) => {
                        megaStorage.upload(filePath, (err) => {
                            if (err) console.error('Upload error:', err);
                            fs.unlinkSync(filePath);
                            resolve();
                        });
                    });
                }
                
                activeDownloads.set(downloadId, { status: 'completed', name: torrent.name });
            } catch (err) {
                console.error('Upload failed:', err);
                activeDownloads.set(downloadId, { status: 'failed', name: torrent.name });
            }
        });

        res.json({ 
            message: 'Download started', 
            id: downloadId,
            name: torrent.name || 'Unknown torrent'
        });
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Download failed to start' });
    }
});

app.get('/files', async (req, res) => {
    try {
        await megaStorage.login();
        const files = await megaStorage.getFiles();
        
        const fileList = Object.values(files)
            .filter(file => !file.directory)
            .map(file => ({
                name: file.name,
                size: file.size,
                url: `https://mega.nz/file/${file.downloadId}`,
                timestamp: file.timestamp
            }));
            
        res.json(fileList.sort((a,b) => b.timestamp - a.timestamp));
    } catch (err) {
        console.error('MEGA error:', err);
        res.status(500).json([]);
    }
});

app.get('/status/:id', (req, res) => {
    const status = activeDownloads.get(req.params.id) || { status: 'not-found' };
    res.json(status);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    megaStorage.login(err => {
        if (err) console.error('MEGA login failed:', err);
        else console.log('Connected to MEGA storage');
    });
});
