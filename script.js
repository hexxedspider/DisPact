const CHUNK_SIZE = 9.99 * 1024 * 1024; // 9.99 is okay but 10 is too much ?? thats a very fine line
const DISCORD_RATE_LIMIT_DELAY = 1000;
const CORS_PROXY = 'https://corsproxy.io/?';
const RECENT_MANIFESTS_KEY = 'dispact_recent_manifests';
const MAX_RECENT_MANIFESTS = 10;

const webhookUrlInput = document.getElementById('webhook-url');
const toggleWebhookBtn = document.getElementById('toggle-webhook-visibility');
const fileInput = document.getElementById('file-input');
const fileUploadZone = document.getElementById('file-upload-zone');
const fileInfo = document.getElementById('file-info');
const fileList = document.getElementById('file-list');
const removeFileBtn = document.getElementById('remove-file');
const uploadBtn = document.getElementById('upload-btn');
const uploadProgress = document.getElementById('upload-progress');
const progressText = document.getElementById('progress-text');
const progressPercentage = document.getElementById('progress-percentage');
const progressFill = document.getElementById('progress-fill');
const chunkInfo = document.getElementById('chunk-info');
const uploadResult = document.getElementById('upload-result');
const manifestKey = document.getElementById('manifest-key');
const copyManifestBtn = document.getElementById('copy-manifest');

const manifestInput = document.getElementById('manifest-input');
const downloadBtn = document.getElementById('download-btn');
const downloadProgress = document.getElementById('download-progress');
const downloadProgressText = document.getElementById('download-progress-text');
const downloadProgressPercentage = document.getElementById('download-progress-percentage');
const downloadProgressFill = document.getElementById('download-progress-fill');
const downloadChunkInfo = document.getElementById('download-chunk-info');

let selectedFiles = [];
let isUploading = false;
let uploadQueue = [];
let activeUploads = 0;
const MAX_CONCURRENT = 3;

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRecentManifests() {
    try {
        const stored = localStorage.getItem(RECENT_MANIFESTS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error loading recent manifests:', e);
        return [];
    }
}

// im not trynna save all my manifests to one file lol
function saveRecentManifest(fileName, manifestUrl, uploadDate) {
    try {
        const manifests = getRecentManifests();
        const newManifest = {
            fileName,
            manifestUrl,
            uploadDate: uploadDate || new Date().toISOString()
        };

        const filtered = manifests.filter(m => m.manifestUrl !== manifestUrl);

        filtered.unshift(newManifest);

        const recent = filtered.slice(0, MAX_RECENT_MANIFESTS);

        localStorage.setItem(RECENT_MANIFESTS_KEY, JSON.stringify(recent));
        displayRecentManifests();
    } catch (e) {
        console.error('Error saving recent manifest:', e);
    }
}

function displayRecentManifests() {
    const container = document.getElementById('recent-manifests');
    const manifests = getRecentManifests();

    if (manifests.length === 0) {
        container.innerHTML = '<p class="no-manifests">No recent manifests yet</p>';
        return;
    }

    container.innerHTML = manifests.map(manifest => {
        const date = new Date(manifest.uploadDate);
        const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="manifest-item" data-url="${manifest.manifestUrl}">
                <div class="manifest-name">${manifest.fileName}</div>
                <div class="manifest-date">${formattedDate}</div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.manifest-item').forEach(item => {
        item.addEventListener('click', () => {
            const url = item.dataset.url;
            manifestInput.value = url;
            downloadBtn.disabled = false;
        });
    });
}

toggleWebhookBtn.addEventListener('click', () => {
    const input = webhookUrlInput;
    if (input.type === 'password') {
        input.type = 'text';
        toggleWebhookBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        `;
    } else {
        input.type = 'password';
        toggleWebhookBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        `;
    }
});

fileUploadZone.addEventListener('click', () => {
    fileInput.click();
});

fileUploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadZone.classList.add('drag-over');
});

fileUploadZone.addEventListener('dragleave', () => {
    fileUploadZone.classList.remove('drag-over');
});

fileUploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(Array.from(files));
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(Array.from(e.target.files));
    }
});

removeFileBtn.addEventListener('click', () => {
    selectedFiles = [];
    fileList.innerHTML = '';
    fileInfo.classList.add('hidden');
    fileUploadZone.classList.remove('hidden');
    fileInput.value = '';
    updateUploadButton();
    displayRecentManifests();
});

function handleFileSelect(files) {
    selectedFiles = files;
    fileList.innerHTML = files.map(file => `<div class="file-item">${file.name} (${formatBytes(file.size)})</div>`).join('');
    fileUploadZone.classList.add('hidden');
    fileInfo.classList.remove('hidden');
    updateUploadButton();
}

function updateUploadButton() {
    uploadBtn.disabled = selectedFiles.length === 0 || !webhookUrlInput.value.trim() || isUploading;
}

webhookUrlInput.addEventListener('input', updateUploadButton);

uploadBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0 || !webhookUrlInput.value.trim()) return;

    isUploading = true;
    updateUploadButton();
    uploadResult.classList.add('hidden');
    uploadProgress.classList.remove('hidden');

    progressText.textContent = `Uploading ${selectedFiles.length} files...`;
    progressPercentage.textContent = '';
    progressFill.style.width = '0%';
    chunkInfo.textContent = '';

    try {
        const webhookUrl = webhookUrlInput.value.trim();
        await uploadFiles(selectedFiles, webhookUrl);

        uploadResult.classList.remove('hidden');
        uploadProgress.classList.add('hidden');

        // clear after upload
        selectedFiles = [];
        fileList.innerHTML = '';
        fileInfo.classList.add('hidden');
        fileUploadZone.classList.remove('hidden');
        fileInput.value = '';
        displayRecentManifests();

    } catch (error) {
        alert(`Upload failed: ${error.message}`);
        uploadProgress.classList.add('hidden');
    } finally {
        isUploading = false;
        updateUploadButton();
    }
});

async function uploadFileInChunks(file, webhookUrl, updateProgress = true) {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunks = [];

    if (updateProgress) {
        progressText.textContent = 'Preparing chunks...';
        progressPercentage.textContent = '0%';
        progressFill.style.width = '0%';
    }

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        if (updateProgress) {
            progressText.textContent = `Uploading chunk ${i + 1} of ${totalChunks}...`;
            const percentage = Math.round(((i + 1) / totalChunks) * 100);
            progressPercentage.textContent = `${percentage}%`;
            progressFill.style.width = `${percentage}%`;
            chunkInfo.textContent = `Chunk ${i + 1}/${totalChunks} - ${formatBytes(chunk.size)}`;
        }

        const formData = new FormData();
        formData.append('file', chunk, `${file.name}.part${i}`);

        let response;
        try {
            response = await fetch(webhookUrl + '?wait=true', {
                method: 'POST',
                body: formData
            });
        } catch (fetchError) {
            console.error('Fetch error:', fetchError);
            throw new Error(`Network error uploading chunk ${i + 1}. Make sure you're running from a local server (e.g., 'python -m http.server') not file:// protocol. Error: ${fetchError.message}`);
        }

        if (!response.ok) {
            let errorText = 'Unknown error';
            try {
                errorText = await response.text();
            } catch (e) {
                errorText = response.statusText;
            }
            throw new Error(`Failed to upload chunk ${i + 1}: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (data.attachments && data.attachments.length > 0) {
            chunks.push({
                index: i,
                url: data.attachments[0].url,
                size: chunk.size
            });
        } else {
            throw new Error(`No attachment URL in response for chunk ${i + 1}`);
        }

        if (i < totalChunks - 1) {
            await sleep(DISCORD_RATE_LIMIT_DELAY);
        }
    }

    if (updateProgress) {
        progressText.textContent = 'Uploading manifest...';
        progressPercentage.textContent = '100%';
        chunkInfo.textContent = 'Finalizing upload...';
    }

    const manifest = {
        fileName: file.name,
        fileSize: file.size,
        totalChunks: totalChunks,
        chunkSize: CHUNK_SIZE,
        chunks: chunks,
        uploadDate: new Date().toISOString()
    };

    const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const manifestFormData = new FormData();
    manifestFormData.append('file', manifestBlob, `${file.name}.manifest.json`);

    let manifestResponse;
    try {
        manifestResponse = await fetch(webhookUrl + '?wait=true', {
            method: 'POST',
            body: manifestFormData
        });
    } catch (fetchError) {
        console.error('Manifest fetch error:', fetchError);
        throw new Error(`Network error uploading manifest. Make sure you're running from a local server. Error: ${fetchError.message}`);
    }

    if (!manifestResponse.ok) {
        let errorText = 'Unknown error';
        try {
            errorText = await manifestResponse.text();
        } catch (e) {
            errorText = manifestResponse.statusText;
        }
        throw new Error(`Failed to upload manifest: ${manifestResponse.status} - ${errorText}`);
    }

    const manifestData = await manifestResponse.json();

    if (manifestData.attachments && manifestData.attachments.length > 0) {
        return manifestData.attachments[0].url;
    } else {
        throw new Error('No manifest URL in response');
    }
}

function addToQueue(file, webhookUrl) {
    uploadQueue.push({ file, webhookUrl });
    processQueue();
}

async function processQueue() {
    if (activeUploads >= MAX_CONCURRENT || uploadQueue.length === 0) return;

    activeUploads++;
    const { file, webhookUrl } = uploadQueue.shift();

    try {
        const manifestUrl = await uploadFileInChunks(file, webhookUrl, false);
        saveRecentManifest(file.name, manifestUrl);
    } catch (error) {
        console.error(`Upload failed for ${file.name}: ${error.message}`);
    } finally {
        activeUploads--;
        processQueue();
    }
}

async function uploadFiles(files, webhookUrl) {
    files.forEach(file => addToQueue(file, webhookUrl));

    return new Promise((resolve) => {
        const checkDone = () => {
            if (uploadQueue.length === 0 && activeUploads === 0) {
                resolve();
            } else {
                setTimeout(checkDone, 100);
            }
        };
        checkDone();
    });
}

copyManifestBtn.addEventListener('click', async () => {
    const text = manifestKey.textContent;
    try {
        await navigator.clipboard.writeText(text);
        const originalHTML = copyManifestBtn.innerHTML;
        copyManifestBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"></path>
            </svg>
        `;
        setTimeout(() => {
            copyManifestBtn.innerHTML = originalHTML;
        }, 2000);
    } catch (err) {
        alert('Failed to copy to clipboard');
    }
});

manifestInput.addEventListener('input', () => {
    downloadBtn.disabled = !manifestInput.value.trim();
});

downloadBtn.addEventListener('click', async () => {
    const manifestUrl = manifestInput.value.trim();
    if (!manifestUrl) return;

    downloadProgress.classList.remove('hidden');
    downloadProgressText.textContent = 'Fetching manifest...';
    downloadProgressPercentage.textContent = '0%';
    downloadProgressFill.style.width = '0%';

    try {
        let manifestResponse;
        try {
            manifestResponse = await fetch(CORS_PROXY + encodeURIComponent(manifestUrl));
        } catch (fetchError) {
            console.error('Manifest fetch error:', fetchError);
            throw new Error(`Failed to fetch manifest. Make sure the URL is correct and accessible. Error: ${fetchError.message}`);
        }

        if (!manifestResponse.ok) {
            throw new Error(`Failed to fetch manifest: ${manifestResponse.status} ${manifestResponse.statusText}`);
        }

        const manifest = await manifestResponse.json();
        await downloadFileFromChunks(manifest);
    } catch (error) {
        console.error('Download error:', error);
        alert(`Download failed: ${error.message}`);
        downloadProgress.classList.add('hidden');
    }
});

async function downloadFileFromChunks(manifest) {
    const chunks = [];

    for (let i = 0; i < manifest.totalChunks; i++) {
        const chunkData = manifest.chunks[i];

        downloadProgressText.textContent = `Downloading chunk ${i + 1} of ${manifest.totalChunks}...`;
        const percentage = Math.round(((i + 1) / manifest.totalChunks) * 100);
        downloadProgressPercentage.textContent = `${percentage}%`;
        downloadProgressFill.style.width = `${percentage}%`;
        downloadChunkInfo.textContent = `Chunk ${i + 1}/${manifest.totalChunks}`;

        let response;
        try {
            response = await fetch(CORS_PROXY + encodeURIComponent(chunkData.url));
        } catch (fetchError) {
            console.error(`Chunk ${i + 1} fetch error:`, fetchError);
            throw new Error(`Failed to download chunk ${i + 1}. The Discord CDN URL may have expired or is invalid. Error: ${fetchError.message}`);
        }

        if (!response.ok) {
            throw new Error(`Failed to download chunk ${i + 1}: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        chunks.push(blob);
    }

    downloadProgressText.textContent = 'Combining chunks...';
    const completeFile = new Blob(chunks);

    const url = URL.createObjectURL(completeFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = manifest.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    downloadProgressText.textContent = 'Download complete!';
    downloadProgressPercentage.textContent = '100%';
    downloadProgressFill.style.width = '100%';

    setTimeout(() => {
        downloadProgress.classList.add('hidden');
    }, 3000);
}

updateUploadButton();
