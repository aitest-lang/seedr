require('dotenv').config();
const express = require('express');
const WebTorrent = require('webtorrent');
const Mega = require('megajs').default; // Changed import
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
                
                await mega.ready;
                const root = mega.root;
                
                for (const file of torrent.files) {
                    const filePath = path.join(TEMP_DIR, file.name);
                    const uploadStream = fs.createReadStream(filePath);
                    
                    await new Promise((resolve, reject) => {
                        root.upload(file.name, uploadStream, (err, uploadedFile) => {
                            if (err) return reject(err);
                            console.log('Uploaded:', uploadedFile.name);
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
        await mega.ready;
        const files = [];
        
        // Recursive function to get all files
        function traverse(folder) {
            folder.children.forEach(item => {
                if (item.directory) {
                    traverse(item);
                } else {
                    files.push({
                        name: item.name,
                        size: item.size,
                        url: item.downloadURL,
                        timestamp: item.timestamp
                    });
                }
            });
        }
        
        traverse(mega.root);
        
        res.json(files.sort((a,b) => b.timestamp - a.timestamp));
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
    mega.ready.then(() => {
        console.log('Connected to MEGA storage');
    }).catch(err => {
        console.error('MEGA login failed:', err);
    });
});
