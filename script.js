(function() {
    // ──────────────────────────────────────
    // IndexedDB Helpers
    // ──────────────────────────────────────
    const DB_NAME = 'KlipikDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'videos';

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function dbAddVideo(videoRecord) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(videoRecord);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
            tx.oncomplete = () => db.close();
        });
    }

    async function dbGetAllVideos() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
            tx.oncomplete = () => db.close();
        });
    }

    async function dbDeleteVideo(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
            tx.oncomplete = () => db.close();
        });
    }

    async function dbUpdateVideo(id, updates) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const record = getReq.result;
                if (!record) { resolve(); return; }
                Object.assign(record, updates);
                store.put(record);
            };
            getReq.onerror = (e) => reject(e.target.error);
            tx.oncomplete = () => db.close();
        });
    }

    // ──────────────────────────────────────
    // State
    // ──────────────────────────────────────
    let videoList = [];
    let currentVideoId = null;
    let searchQuery = '';
    let isDarkTheme = true;
    let activeObjectURLs = new Map();

    // ──────────────────────────────────────
    // DOM References
    // ──────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const searchInput = $('#searchInput');
    const searchClear = $('#searchClear');
    const videoGrid = $('#videoGrid');
    const emptyState = $('#emptyState');
    const resultCount = $('#resultCount');
    const sectionTitle = $('#sectionTitle');
    const playerSection = $('#playerSection');
    const videoElement = $('#videoElement');
    const videoContainer = $('#videoContainer');
    const playOverlay = $('#playOverlay');
    const playerTitle = $('#playerTitle');
    const playerViews = $('#playerViews');
    const playerDate = $('#playerDate');
    const btnLike = $('#btnLike');
    const likeCount = $('#likeCount');
    const seekBar = $('#seekBar');
    const volumeBar = $('#volumeBar');
    const timeDisplay = $('#timeDisplay');
    const btnPlayPause = $('#btnPlayPause');
    const iconPlay = $('#iconPlay');
    const iconPause = $('#iconPause');
    const btnMute = $('#btnMute');
    const iconVolumeHigh = $('#iconVolumeHigh');
    const iconVolumeMuted = $('#iconVolumeMuted');
    const btnFullscreen = $('#btnFullscreen');
    const dropOverlay = $('#dropOverlay');
    const toastContainer = $('#toastContainer');
    const fileInput = $('#fileInput');
    const themeIconSun = $('#themeIconSun');
    const themeIconMoon = $('#themeIconMoon');
    const btnClosePlayer = $('#btnClosePlayer');
    const playerControls = $('#playerControls');
    const youtubePlayer = $('#youtubePlayer');
    const shortsStack = $('#shortsStack');

    // ──────────────────────────────────────
    // Theme
    // ──────────────────────────────────────
    function applyTheme() {
        document.documentElement.setAttribute('data-theme', isDarkTheme ? 'dark' : 'light');
        themeIconSun.style.display = isDarkTheme ? 'none' : '';
        themeIconMoon.style.display = isDarkTheme ? '' : 'none';
        try { localStorage.setItem('klipik_theme', isDarkTheme ? 'dark' : 'light'); } catch (e) {}
    }

    function toggleTheme() {
        isDarkTheme = !isDarkTheme;
        applyTheme();
    }

    function loadTheme() {
        try {
            const saved = localStorage.getItem('klipik_theme');
            if (saved === 'light') isDarkTheme = false;
            else if (saved === 'dark') isDarkTheme = true;
        } catch (e) {}
        applyTheme();
    }

    // ──────────────────────────────────────
    // Toast
    // ──────────────────────────────────────
    function showToast(message, type = '') {
        const toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 3000);
    }

    // ──────────────────────────────────────
    // Utility
    // ──────────────────────────────────────
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    function formatDate(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return mins + ' min ago';
        if (hours < 24) return hours + ' hour' + (hours > 1 ? 's' : '') + ' ago';
        if (days < 30) return days + ' day' + (days > 1 ? 's' : '') + ' ago';
        const d = new Date(timestamp);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function generateId() {
        return 'vid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    function formatViews(count) {
        if (count < 1000) return count + ' view' + (count !== 1 ? 's' : '');
        if (count < 1000000) return (count / 1000).toFixed(1) + 'K views';
        return (count / 1000000).toFixed(1) + 'M views';
    }

    // ──────────────────────────────────────
    // YouTube oEmbed Fetch
    // ──────────────────────────────────────
    async function fetchYouTubeMeta(url) {
        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            const resp = await fetch(oembedUrl);
            if (!resp.ok) throw new Error('Invalid YouTube URL');
            const data = await resp.json();
            const videoId = extractYouTubeId(url);
            const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            return {
                title: data.title,
                thumbnail: thumbnail,
                videoId: videoId,
            };
        } catch (err) {
            throw new Error('Could not fetch video information. Make sure the URL is correct.');
        }
    }

    function extractYouTubeId(url) {
        const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[7].length === 11) ? match[7] : null;
    }

    // ──────────────────────────────────────
    // Thumbnail Generation (local)
    // ──────────────────────────────────────
    function generateThumbnail(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';
            tempVideo.muted = true;
            tempVideo.playsInline = true;
            tempVideo.style.position = 'absolute';
            tempVideo.style.width = '1px';
            tempVideo.style.height = '1px';
            tempVideo.style.opacity = '0';
            tempVideo.style.pointerEvents = 'none';
            document.body.appendChild(tempVideo);
            tempVideo.src = url;

            const cleanup = () => {
                tempVideo.pause();
                tempVideo.removeAttribute('src');
                tempVideo.load();
                if (tempVideo.parentNode) tempVideo.remove();
                URL.revokeObjectURL(url);
            };

            const timeout = setTimeout(() => {
                cleanup();
                resolve(null);
            }, 6000);

            tempVideo.onloadedmetadata = () => {
                const duration = tempVideo.duration;
                if (!isFinite(duration) || duration <= 0) {
                    clearTimeout(timeout);
                    cleanup();
                    resolve(null);
                    return;
                }
                const seekTime = Math.min(duration * 0.15, 2);
                tempVideo.currentTime = seekTime;
            };

            tempVideo.onseeked = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    const vw = tempVideo.videoWidth;
                    const vh = tempVideo.videoHeight;
                    if (vw <= 0 || vh <= 0) {
                        cleanup();
                        resolve(null);
                        return;
                    }
                    canvas.width = 320;
                    canvas.height = 180;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    cleanup();
                    resolve(dataUrl);
                } catch (e) {
                    cleanup();
                    resolve(null);
                }
            };

            tempVideo.onerror = () => {
                clearTimeout(timeout);
                cleanup();
                resolve(null);
            };
        });
    }

    // ──────────────────────────────────────
    // Video Upload (local)
    // ──────────────────────────────────────
    async function handleFileUpload(file) {
        if (!file || !file.type.startsWith('video/')) {
            const ext = file ? file.name.split('.').pop().toLowerCase() : '';
            const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi', 'm4v', '3gp'];
            if (!videoExts.includes(ext) && file && !file.type.startsWith('video/')) {
                showToast('Please select a valid video file (MP4, WebM, OGG, MOV, MKV)', 'error');
                return;
            }
        }

        const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim() || 'Untitled Video';
        const id = generateId();
        const timestamp = Date.now();
        const objectURL = URL.createObjectURL(file);

        showToast('Processing video...', '');

        let thumbnail = null;
        try {
            thumbnail = await generateThumbnail(file);
        } catch (e) {}

        const videoRecord = {
            id: id,
            type: 'local',
            title: title,
            timestamp: timestamp,
            blob: file,
            thumbnail: thumbnail,
            likes: 0,
            views: 0,
            liked: false
        };

        try {
            await dbAddVideo(videoRecord);
            activeObjectURLs.set(id, objectURL);
            const videoObj = {
                id: id,
                type: 'local',
                title: title,
                timestamp: timestamp,
                url: objectURL,
                thumbnail: thumbnail,
                likes: 0,
                views: 0,
                liked: false
            };
            videoList.unshift(videoObj);
            renderLibrary();
            showToast('Video uploaded successfully!', 'success');
        } catch (e) {
            URL.revokeObjectURL(objectURL);
            showToast('Failed to store video. It may be too large for browser storage.', 'error');
            console.error('Upload error:', e);
        }
    }

    // ──────────────────────────────────────
    // Add YouTube Video
    // ──────────────────────────────────────
    async function addYouTubeVideo() {
        let url = prompt('Enter YouTube video URL:');
        if (!url) return;
        url = url.trim();
        const videoId = extractYouTubeId(url);
        if (!videoId) {
            showToast('Invalid YouTube URL.', 'error');
            return;
        }

        showToast('Fetching video info...', '');
        try {
            const meta = await fetchYouTubeMeta(url);
            const id = generateId();
            const timestamp = Date.now();

            const videoRecord = {
                id: id,
                type: 'youtube',
                title: meta.title,
                timestamp: timestamp,
                youtubeId: videoId,
                url: url,
                thumbnail: meta.thumbnail,
                likes: 0,
                views: 0,
                liked: false
            };

            await dbAddVideo(videoRecord);
            const videoObj = {
                id: id,
                type: 'youtube',
                title: meta.title,
                timestamp: timestamp,
                youtubeId: videoId,
                url: url,
                thumbnail: meta.thumbnail,
                likes: 0,
                views: 0,
                liked: false
            };
            videoList.unshift(videoObj);
            renderLibrary();
            showToast('YouTube video added!', 'success');
        } catch (err) {
            showToast(err.message || 'Failed to add YouTube video.', 'error');
        }
    }

    // ──────────────────────────────────────
    // Delete Video
    // ──────────────────────────────────────
    async function deleteVideo(id) {
        const video = videoList.find(v => v.id === id);
        if (!video) return;
        if (!confirm('Delete "' + video.title + '"? This cannot be undone.')) return;

        if (video.type === 'local' && activeObjectURLs.has(id)) {
            URL.revokeObjectURL(activeObjectURLs.get(id));
            activeObjectURLs.delete(id);
        }
        try {
            await dbDeleteVideo(id);
        } catch (e) {
            console.error('Delete error:', e);
        }
        videoList = videoList.filter(v => v.id !== id);
        if (currentVideoId === id) {
            closePlayer();
        }
        renderLibrary();
        showToast('Video deleted', '');
    }

    // ──────────────────────────────────────
    // Player
    // ──────────────────────────────────────
    function openPlayer(videoId) {
        const video = videoList.find(v => v.id === videoId);
        if (!video) return;
        currentVideoId = videoId;
        video.views = (video.views || 0) + 1;
        dbUpdateVideo(videoId, { views: video.views }).catch(() => {});

        playerTitle.textContent = video.title;
        playerViews.textContent = formatViews(video.views);
        playerDate.textContent = formatDate(video.timestamp);
        likeCount.textContent = video.likes || 0;
        if (video.liked) {
            btnLike.classList.add('liked');
        } else {
            btnLike.classList.remove('liked');
        }

        // Reset both players
        videoElement.style.display = 'none';
        youtubePlayer.style.display = 'none';
        youtubePlayer.innerHTML = '';
        videoElement.src = '';
        videoContainer.style.aspectRatio = '';
        videoContainer.style.maxHeight = '65vh';

        if (video.type === 'youtube') {
            // Fix: set aspect ratio to make iframe visible
            videoContainer.style.aspectRatio = '16 / 9';
            videoContainer.style.maxHeight = '';
            videoContainer.style.width = '100%';

            const iframe = document.createElement('iframe');
            iframe.width = '100%';
            iframe.height = '100%';
            iframe.src = `https://www.youtube.com/embed/${video.youtubeId}?autoplay=1&controls=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
            iframe.allow = 'autoplay; encrypted-media; fullscreen';
            iframe.style.position = 'absolute';
            iframe.style.top = '0';
            iframe.style.left = '0';
            iframe.style.border = 'none';
            iframe.setAttribute('allowfullscreen', 'true');
            youtubePlayer.appendChild(iframe);
            youtubePlayer.style.display = 'block';
            playerControls.style.display = 'none';
            playOverlay.classList.remove('visible');
        } else {
            // Local video
            videoContainer.style.aspectRatio = '';
            videoContainer.style.maxHeight = '65vh';
            videoElement.src = video.url;
            videoElement.load();
            videoElement.currentTime = 0;
            videoElement.style.display = 'block';
            playerControls.style.display = '';
            seekBar.value = 0;
            timeDisplay.textContent = '0:00 / 0:00';
            iconPlay.style.display = '';
            iconPause.style.display = 'none';
            playOverlay.classList.add('visible');
        }

        playerSection.classList.add('active');
        playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        renderLibrary();
        updateResultCount();
    }

    function closePlayer() {
        currentVideoId = null;
        videoElement.pause();
        videoElement.src = '';
        videoElement.removeAttribute('src');
        videoElement.style.display = 'none';
        youtubePlayer.innerHTML = '';
        youtubePlayer.style.display = 'none';
        playerControls.style.display = '';
        playerSection.classList.remove('active');
        iconPlay.style.display = '';
        iconPause.style.display = 'none';
        playOverlay.classList.add('visible');
        seekBar.value = 0;
        timeDisplay.textContent = '0:00 / 0:00';
        // Reset container styles
        videoContainer.style.aspectRatio = '';
        videoContainer.style.maxHeight = '65vh';
        renderLibrary();
        updateResultCount();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function togglePlayPause() {
        if (!currentVideoId || videoElement.style.display === 'none' || !videoElement.src) return;
        if (videoElement.paused) {
            videoElement.play().catch(() => {});
            iconPlay.style.display = 'none';
            iconPause.style.display = '';
            playOverlay.classList.remove('visible');
        } else {
            videoElement.pause();
            iconPlay.style.display = '';
            iconPause.style.display = 'none';
        }
    }

    function toggleMute() {
        if (!currentVideoId || videoElement.style.display === 'none') return;
        videoElement.muted = !videoElement.muted;
        updateMuteIcon();
    }

    function updateMuteIcon() {
        if (videoElement.muted || videoElement.volume === 0) {
            iconVolumeHigh.style.display = 'none';
            iconVolumeMuted.style.display = '';
            volumeBar.value = 0;
        } else {
            iconVolumeHigh.style.display = '';
            iconVolumeMuted.style.display = 'none';
            volumeBar.value = videoElement.volume;
        }
    }

    function toggleFullscreen() {
        const wrapper = playerSection.querySelector('.player-wrapper');
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (wrapper.requestFullscreen) {
                wrapper.requestFullscreen();
            } else if (wrapper.webkitRequestFullscreen) {
                wrapper.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    function handleLike() {
        if (!currentVideoId) return;
        const video = videoList.find(v => v.id === currentVideoId);
        if (!video) return;
        video.liked = !video.liked;
        video.likes = (video.likes || 0) + (video.liked ? 1 : -1);
        if (video.likes < 0) video.likes = 0;
        likeCount.textContent = video.likes;
        if (video.liked) {
            btnLike.classList.add('liked');
        } else {
            btnLike.classList.remove('liked');
        }
        dbUpdateVideo(currentVideoId, { likes: video.likes, liked: video.liked }).catch(() => {});
        renderLibrary();
    }

    // ──────────────────────────────────────
    // Render Library
    // ──────────────────────────────────────
    function getFilteredVideos() {
        if (!searchQuery.trim()) return videoList;
        const q = searchQuery.toLowerCase().trim();
        return videoList.filter(v => v.title.toLowerCase().includes(q));
    }

    function renderLibrary() {
        const filtered = getFilteredVideos();
        videoGrid.innerHTML = '';
        if (filtered.length === 0 && videoList.length === 0) {
            emptyState.style.display = '';
            videoGrid.style.display = 'none';
            resultCount.textContent = '';
            sectionTitle.textContent = 'Your Library';
        } else if (filtered.length === 0 && videoList.length > 0) {
            emptyState.style.display = '';
            videoGrid.style.display = 'none';
            emptyState.querySelector('h3').textContent = 'No matches';
            emptyState.querySelector('p').textContent = 'Try a different search term.';
            const uploadBtn = emptyState.querySelector('#emptyUploadBtn');
            if (uploadBtn) uploadBtn.style.display = 'none';
            resultCount.textContent = '0 of ' + videoList.length + ' videos';
            sectionTitle.textContent = 'Search Results';
        } else {
            emptyState.style.display = 'none';
            videoGrid.style.display = '';
            const uploadBtn = emptyState.querySelector('#emptyUploadBtn');
            if (uploadBtn) uploadBtn.style.display = '';
            emptyState.querySelector('h3').textContent = 'No videos yet';
            emptyState.querySelector('p').textContent =
                'Upload your first video to get started. Click the Upload button or drag and drop a video file here.';
            sectionTitle.textContent = searchQuery.trim() ? 'Search Results' : 'Your Library';
            updateResultCount();
        }

        filtered.forEach(video => {
            const card = createVideoCard(video);
            videoGrid.appendChild(card);
        });

        if (currentVideoId) {
            const cv = videoList.find(v => v.id === currentVideoId);
            if (cv) {
                likeCount.textContent = cv.likes || 0;
                if (cv.liked) {
                    btnLike.classList.add('liked');
                } else {
                    btnLike.classList.remove('liked');
                }
                playerViews.textContent = formatViews(cv.views);
            }
        }
    }

    function updateResultCount() {
        const filtered = getFilteredVideos();
        if (videoList.length > 0) {
            if (searchQuery.trim()) {
                resultCount.textContent = filtered.length + ' of ' + videoList.length + ' videos';
            } else {
                resultCount.textContent = videoList.length + ' video' + (videoList.length !== 1 ? 's' : '');
            }
        } else {
            resultCount.textContent = '';
        }
    }

    function createVideoCard(video) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.setAttribute('data-id', video.id);
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', 'Play ' + video.title);

        const isActive = currentVideoId === video.id;
        if (isActive) {
            card.style.borderColor = 'var(--accent)';
            card.style.boxShadow = '0 0 0 2px var(--accent-soft)';
        }

        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'thumbnail-wrap';
        if (video.thumbnail) {
            const img = document.createElement('img');
            img.src = video.thumbnail;
            img.alt = video.title;
            img.loading = 'lazy';
            thumbWrap.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'thumbnail-placeholder';
            placeholder.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            thumbWrap.appendChild(placeholder);
        }
        const badge = document.createElement('span');
        badge.className = 'duration-badge';
        badge.textContent = video.type === 'youtube' ? 'YouTube' : 'VIDEO';
        badge.style.fontSize = '0.65rem';
        badge.style.letterSpacing = '0.5px';
        thumbWrap.appendChild(badge);
        card.appendChild(thumbWrap);

        const info = document.createElement('div');
        info.className = 'card-info';
        const textDiv = document.createElement('div');
        textDiv.className = 'card-text';
        const titleEl = document.createElement('div');
        titleEl.className = 'card-title';
        titleEl.textContent = video.title;
        const metaEl = document.createElement('div');
        metaEl.className = 'card-meta';
        metaEl.innerHTML = '<span>' + formatViews(video.views || 0) +
            '</span><span>•</span><span>' + formatDate(video.timestamp) + '</span>';
        textDiv.appendChild(titleEl);
        textDiv.appendChild(metaEl);
        info.appendChild(textDiv);

        const actions = document.createElement('div');
        actions.className = 'card-actions';
        const delBtn = document.createElement('button');
        delBtn.className = 'card-btn';
        delBtn.setAttribute('aria-label', 'Delete ' + video.title);
        delBtn.title = 'Delete video';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteVideo(video.id);
        });
        actions.appendChild(delBtn);
        info.appendChild(actions);
        card.appendChild(info);

        card.addEventListener('click', () => {
            openPlayer(video.id);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPlayer(video.id);
            }
        });

        return card;
    }


    function setupShortsController() {
        if (!shortsStack) return;
        const cards = Array.from(shortsStack.querySelectorAll('.short-card'));
        const state = cards.map(card => ({
            id: card.dataset.shortId,
            likes: Number(card.querySelector('[data-role="like-count"]')?.textContent || 0),
            comments: Number(card.querySelector('[data-role="comment-count"]')?.textContent || 0),
            creatorHref: card.querySelector('[data-role="creator-link"]')?.href || '#'
        }));
        let activeIndex = 0;
        let touchStartY = 0;

        function syncCard(card, data) {
            const likeEl = card.querySelector('[data-role="like-count"]');
            const commentEl = card.querySelector('[data-role="comment-count"]');
            const creatorEl = card.querySelector('[data-role="creator-link"]');
            if (likeEl) likeEl.textContent = String(data.likes);
            if (commentEl) commentEl.textContent = String(data.comments);
            if (creatorEl) creatorEl.href = data.creatorHref;
        }

        function setActive(index) {
            if (index < 0 || index >= cards.length) return;
            activeIndex = index;
            cards.forEach((card, i) => {
                const vid = card.querySelector('.short-video');
                if (!vid) return;
                if (i === activeIndex) vid.play().catch(() => {});
                else vid.pause();
            });
        }

        function scrollToIndex(index) {
            if (index < 0 || index >= cards.length) return;
            cards[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActive(index);
        }

        cards.forEach((card, index) => {
            syncCard(card, state[index]);
            card.addEventListener('click', (e) => {
                const btn = e.target.closest('.short-action-btn');
                if (!btn) return;
                const action = btn.dataset.action;
                if (action === 'like') state[index].likes += 1;
                if (action === 'comment') state[index].comments += 1;
                syncCard(card, state[index]);
            });
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
                    const idx = cards.indexOf(entry.target);
                    if (idx !== -1) setActive(idx);
                }
            });
        }, { root: shortsStack, threshold: [0.6, 0.9] });

        cards.forEach(card => observer.observe(card));

        shortsStack.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY > 0) scrollToIndex(Math.min(cards.length - 1, activeIndex + 1));
            else if (e.deltaY < 0) scrollToIndex(Math.max(0, activeIndex - 1));
        }, { passive: false });

        shortsStack.addEventListener('touchstart', (e) => {
            touchStartY = e.changedTouches[0].clientY;
        }, { passive: true });

        shortsStack.addEventListener('touchend', (e) => {
            const delta = touchStartY - e.changedTouches[0].clientY;
            if (delta > 40) scrollToIndex(Math.min(cards.length - 1, activeIndex + 1));
            else if (delta < -40) scrollToIndex(Math.max(0, activeIndex - 1));
        }, { passive: true });

        document.addEventListener('keydown', (e) => {
            if (!shortsStack.matches(':hover') && !shortsStack.contains(document.activeElement)) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                scrollToIndex(Math.min(cards.length - 1, activeIndex + 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                scrollToIndex(Math.max(0, activeIndex - 1));
            }
        });

        setActive(0);
    }

    // ──────────────────────────────────────
    // Load from IndexedDB
    // ──────────────────────────────────────
    async function loadVideosFromDB() {
        try {
            const records = await dbGetAllVideos();
            videoList = [];
            for (const url of activeObjectURLs.values()) {
                URL.revokeObjectURL(url);
            }
            activeObjectURLs.clear();

            records.sort((a, b) => b.timestamp - a.timestamp);
            for (const rec of records) {
                if (rec.type === 'youtube') {
                    videoList.push({
                        id: rec.id,
                        type: 'youtube',
                        title: rec.title,
                        timestamp: rec.timestamp,
                        youtubeId: rec.youtubeId,
                        url: rec.url,
                        thumbnail: rec.thumbnail || null,
                        likes: rec.likes || 0,
                        views: rec.views || 0,
                        liked: rec.liked || false
                    });
                } else {
                    const objectURL = URL.createObjectURL(rec.blob);
                    activeObjectURLs.set(rec.id, objectURL);
                    videoList.push({
                        id: rec.id,
                        type: 'local',
                        title: rec.title,
                        timestamp: rec.timestamp,
                        url: objectURL,
                        thumbnail: rec.thumbnail || null,
                        likes: rec.likes || 0,
                        views: rec.views || 0,
                        liked: rec.liked || false
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load videos from IndexedDB:', e);
            videoList = [];
        }
        renderLibrary();
    }

    // ──────────────────────────────────────
    // Event Listeners
    // ──────────────────────────────────────
    document.getElementById('uploadBtn').addEventListener('click', () => {
        fileInput.click();
    });
    document.getElementById('youtubeBtn').addEventListener('click', addYouTubeVideo);
    document.getElementById('emptyUploadBtn').addEventListener('click', () => {
        fileInput.click();
    });
    document.getElementById('logoBtn').addEventListener('click', () => {
        closePlayer();
        searchInput.value = '';
        searchQuery = '';
        searchClear.classList.remove('visible');
        renderLibrary();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            Array.from(files).forEach(f => handleFileUpload(f));
        }
        fileInput.value = '';
    });

    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    btnClosePlayer.addEventListener('click', closePlayer);
    btnPlayPause.addEventListener('click', togglePlayPause);
    videoContainer.addEventListener('click', (e) => {
        if (currentVideoId && videoElement.style.display !== 'none' && videoElement.src) {
            if (e.target === videoContainer || e.target === videoElement || e.target === playOverlay || playOverlay.contains(e.target)) {
                togglePlayPause();
            }
        }
    });
    btnMute.addEventListener('click', toggleMute);
    btnFullscreen.addEventListener('click', toggleFullscreen);
    btnLike.addEventListener('click', handleLike);

    seekBar.addEventListener('input', () => {
        if (!videoElement.duration || !isFinite(videoElement.duration)) return;
        const seekTime = (parseFloat(seekBar.value) / 100) * videoElement.duration;
        videoElement.currentTime = seekTime;
        timeDisplay.textContent = formatTime(videoElement.currentTime) + ' / ' + formatTime(videoElement.duration);
    });

    volumeBar.addEventListener('input', () => {
        videoElement.volume = parseFloat(volumeBar.value);
        videoElement.muted = (videoElement.volume === 0);
        updateMuteIcon();
    });

    videoElement.addEventListener('timeupdate', () => {
        if (videoElement.duration && isFinite(videoElement.duration)) {
            const pct = (videoElement.currentTime / videoElement.duration) * 100;
            seekBar.value = pct;
            timeDisplay.textContent = formatTime(videoElement.currentTime) + ' / ' + formatTime(videoElement.duration);
        }
    });
    videoElement.addEventListener('loadedmetadata', () => {
        if (videoElement.duration && isFinite(videoElement.duration)) {
            timeDisplay.textContent = '0:00 / ' + formatTime(videoElement.duration);
            seekBar.value = 0;
        }
    });
    videoElement.addEventListener('play', () => {
        iconPlay.style.display = 'none';
        iconPause.style.display = '';
        playOverlay.classList.remove('visible');
    });
    videoElement.addEventListener('pause', () => {
        iconPlay.style.display = '';
        iconPause.style.display = 'none';
        if (videoElement.currentTime < 0.3 && videoElement.ended === false && videoElement.seeking === false) {
            playOverlay.classList.add('visible');
        }
    });
    videoElement.addEventListener('ended', () => {
        iconPlay.style.display = '';
        iconPause.style.display = 'none';
        playOverlay.classList.add('visible');
    });
    videoElement.addEventListener('volumechange', updateMuteIcon);
    videoElement.addEventListener('error', () => {
        showToast('Error playing video. The file may be corrupted or unsupported.', 'error');
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (!currentVideoId) return;
        if (videoElement.style.display === 'none') return;
        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'f':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    toggleFullscreen();
                }
                break;
            case 'm':
                e.preventDefault();
                toggleMute();
                break;
            case 'arrowleft':
                e.preventDefault();
                videoElement.currentTime = Math.max(0, videoElement.currentTime - 5);
                break;
            case 'arrowright':
                e.preventDefault();
                videoElement.currentTime = Math.min(videoElement.duration || Infinity, videoElement.currentTime + 5);
                break;
            case 'escape':
                e.preventDefault();
                closePlayer();
                break;
        }
    });

    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        if (searchQuery.trim()) {
            searchClear.classList.add('visible');
        } else {
            searchClear.classList.remove('visible');
        }
        renderLibrary();
    });
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        searchClear.classList.remove('visible');
        renderLibrary();
        searchInput.focus();
    });

    let dragCounter = 0;
    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) {
            dropOverlay.classList.add('active');
        }
    });
    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            dropOverlay.classList.remove('active');
        }
    });
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropOverlay.classList.remove('active');
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            Array.from(files).forEach(f => {
                if (f.type.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv|avi|m4v|3gp)$/i.test(f.name)) {
                    handleFileUpload(f);
                } else {
                    showToast('Skipped non-video file: ' + f.name, 'error');
                }
            });
        }
    });

    window.addEventListener('beforeunload', () => {
        for (const url of activeObjectURLs.values()) {
            URL.revokeObjectURL(url);
        }
        activeObjectURLs.clear();
    });

    // ──────────────────────────────────────
    // Initialization
    // ──────────────────────────────────────
    function init() {
        loadTheme();
        loadVideosFromDB();
        setupShortsController();
        updateMuteIcon();
        videoElement.volume = 1;
        volumeBar.value = 1;
    }

    init();
})(); 
