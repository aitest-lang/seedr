require('dotenv').config();
const express = require('express');
const WebTorrent = require('webtorrent');
const Mega = require('megajs'); // Correct import
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

// MEGA Storage Setup - NEW CORRECT INITIALIZATION
const mega = Mega({
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD
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
                
                // Wait for MEGA to be ready
                await new Promise(resolve => mega.once('ready', resolve));
                
                for (const file of torrent.files) {
                    const filePath = path.join(TEMP_DIR, file.name);
                    
                    await new Promise((resolve, reject) => {
                        fs.readFile(filePath, async (err, data) => {
                            if (err) return reject(err);
                            
                            try {
                                await mega.upload(file.name, data);
                                console.log('Uploaded:', file.name);
                                fs.unlinkSync(filePath);
                                resolve();
                            } catch (uploadErr) {
                                reject(uploadErr);
                            }
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
        await new Promise(resolve => mega.once('ready', resolve));
        const files = mega.files;
        
        const fileList = Object.keys(files).map(key => {
            const file = files[key];
            return {
                name: file.name,
                size: file.size,
                url: file.downloadId ? `https://mega.nz/file/${file.downloadId}` : null,
                timestamp: file.timestamp
            };
        }).filter(file => file.url); // Only include files with valid URLs
        
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
    mega.on('ready', () => {
        console.log('Connected to MEGA storage');
    });
    mega.on('error', (err) => {
        console.error('MEGA error:', err);
    });
});
