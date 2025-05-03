document.addEventListener('DOMContentLoaded', () => {
    const magnetInput = document.getElementById('magnet-input');
    const downloadBtn = document.getElementById('download-btn');
    const refreshBtn = document.getElementById('refresh-files');
    const activeDownloadsEl = document.getElementById('active-downloads');
    const fileListEl = document.getElementById('file-list');
    
    let activeDownloads = {};
    let refreshInterval;
    
    // Format file size
    const formatSize = bytes => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    // Start download
    downloadBtn.addEventListener('click', async () => {
        const magnetLink = magnetInput.value.trim();
        if (!magnetLink) return alert('Please enter a magnet link');
        
        try {
            const response = await fetch('/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnetLink })
            });
            
            const result = await response.json();
            if (response.ok) {
                magnetInput.value = '';
                startTrackingDownloads();
            } else {
                alert(result.error || 'Download failed to start');
            }
        } catch (err) {
            console.error('Error:', err);
            alert('Failed to connect to server');
        }
    });
    
    // Refresh file list
    refreshBtn.addEventListener('click', fetchFiles);
    
    // Track active downloads
    const startTrackingDownloads = () => {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(updateDownloadStatuses, 2000);
    };
    
    const updateDownloadStatuses = async () => {
        try {
            const response = await fetch('/files');
            const files = await response.json();
            renderFileList(files);
        } catch (err) {
            console.error('Error fetching files:', err);
        }
    };
    
    // Render active downloads
    const renderActiveDownloads = downloads => {
        if (!downloads || Object.keys(downloads).length === 0) {
            activeDownloadsEl.innerHTML = '<p>No active downloads</p>';
            return;
        }
        
        activeDownloadsEl.innerHTML = Object.entries(downloads).map(([id, download]) => `
            <div class="download-item">
                <div>
                    <strong>${download.name}</strong>
                    <div class="status status-${download.status}">${download.status.toUpperCase()}</div>
                    ${download.progress !== undefined ? `
                        <div>${download.progress}%</div>
                        <div class="progress-bar">
                            <div class="progress" style="width: ${download.progress}%"></div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    };
    
    // Render file list
    const renderFileList = files => {
        if (!files || files.length === 0) {
            fileListEl.innerHTML = '<p>No files found in your MEGA storage</p>';
            return;
        }
        
        fileListEl.innerHTML = files.map(file => `
            <div class="file-item">
                <a href="${file.url}" target="_blank">${file.name}</a>
                <span>${formatSize(file.size)}</span>
            </div>
        `).join('');
    };
    
    // Initial load
    fetchFiles();
    startTrackingDownloads();
    
    // Fetch files from MEGA
    async function fetchFiles() {
        try {
            const response = await fetch('/files');
            const files = await response.json();
            renderFileList(files);
        } catch (err) {
            console.error('Error fetching files:', err);
            fileListEl.innerHTML = '<p>Error loading files. Please try again.</p>';
        }
    }
});
