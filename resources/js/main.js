const YTDLP_URLS = {
  win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
  linux: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
  darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
};
const FFMPEG_URLS = {
  win32: { url: 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip', extract: 'bin/ffmpeg.exe' },
  linux: { url: 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz', extract: 'bin/ffmpeg' },
  darwin: { url: 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-macos-arm64-gpl.zip', extract: 'bin/ffmpeg' }
};

let currentVideo = null;
let isDownloading = false;
let DEPS_DIR = '';
let downloadFolder = '';
const platform = NL_OS === 'Windows' || NL_OS === 'Windows_NT' ? 'win32' : NL_OS === 'Darwin' || NL_OS === 'macOS' ? 'darwin' : 'linux';
const depExt = platform === 'win32' ? '.exe' : '';

function getDepPath(name) {
  return `${DEPS_DIR}/${name}${depExt}`;
}

async function checkDep(name) {
  const path = getDepPath(name);
  try {
    const stats = await Neutralino.filesystem.getStats(path);
    return stats && stats.size > 0;
  } catch (err) {
    debugLog(`checkDep(${name}): not found at ${path}`);
    return false;
  }
}

function debugLog(msg) {
  Neutralino.debug.log(msg, 'INFO');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function getFileSize(url) {
  try {
    if (platform === 'win32') {
      const cmd = `powershell -NoProfile -Command "(Invoke-WebRequest -Uri '${url}' -Method Head -UseBasicParsing).Headers.'Content-Length'[0]"`;
      const result = await Neutralino.os.execCommand(cmd);
      const size = parseInt((result.data || '').trim());
      return isNaN(size) ? 0 : size;
    } else {
      const cmd = `curl -sI '${url}' | grep -i content-length | awk '{print $2}' | tr -d '\\r\\n'`;
      const result = await Neutralino.os.execCommand(cmd);
      const size = parseInt((result.data || '').trim());
      return isNaN(size) ? 0 : size;
    }
  } catch {
    return 0;
  }
}

async function downloadWithProgress(url, dest, onProgress) {
  const totalSize = await getFileSize(url);
  debugLog(`Download size: ${formatBytes(totalSize)}`);

  if (platform === 'win32') {
    const psCmd = `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;(New-Object Net.WebClient).DownloadFile('${url}','${dest}')`;
    const cmd = `powershell -WindowStyle Hidden -NoProfile -Command "${psCmd}"`;
    Neutralino.os.execCommand(cmd);
  } else {
    Neutralino.os.execCommand(`curl -L '${url}' -o '${dest}'`);
  }

  return new Promise((resolve, reject) => {
    let lastSize = 0;
    let stalledCount = 0;
    const interval = setInterval(async () => {
      try {
        const stats = await Neutralino.filesystem.getStats(dest);
        const currentSize = stats.size || 0;
        const percent = totalSize > 0 ? Math.min((currentSize / totalSize) * 100, 100) : 0;
        onProgress(percent, currentSize, totalSize);

        if (currentSize === lastSize && currentSize > 0) {
          stalledCount++;
          if (stalledCount > 20) {
            clearInterval(interval);
            resolve();
          }
        } else {
          stalledCount = 0;
        }
        lastSize = currentSize;

        if (totalSize > 0 && currentSize >= totalSize) {
          clearInterval(interval);
          await new Promise(r => setTimeout(r, 500));
          resolve();
        }
      } catch {
        // File not yet created
      }
    }, 500);
  });
}

async function downloadFile(url, dest) {
  await downloadWithProgress(url, dest, (percent, current, total) => {
    debugLog(`Download progress: ${percent.toFixed(1)}% (${formatBytes(current)} / ${formatBytes(total)})`);
  });
}

async function extractArchive(archivePath, destDir, extractPath) {
  let cmd;
  if (archivePath.endsWith('.zip')) {
    if (platform === 'win32') {
      cmd = `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`;
    } else {
      cmd = `unzip -o '${archivePath}' -d '${destDir}'`;
    }
  } else if (archivePath.endsWith('.tar.xz')) {
    cmd = `tar -xJf '${archivePath}' -C '${destDir}'`;
  }
  await Neutralino.os.execCommand(cmd);
  await Neutralino.filesystem.remove(archivePath);
}

function setSetupStatus(text, progress) {
  document.getElementById('setupStatus').textContent = text;
  if (progress !== undefined) {
    document.getElementById('setupProgressFill').style.width = `${progress}%`;
  }
}

function hideSetupOverlay() {
  document.getElementById('setupOverlay').classList.add('hidden');
}

async function setupDeps() {
  DEPS_DIR = `${NL_CWD}/.deps`;
  debugLog(`NL_OS value: ${NL_OS}`);
  debugLog(`Detected platform: ${platform}`);
  debugLog(`DEPS_DIR: ${DEPS_DIR}`);
  debugLog(`yt-dlp path: ${getDepPath('yt-dlp')}`);
  debugLog(`ffmpeg path: ${getDepPath('ffmpeg')}`);

  const ytdlpExists = await checkDep('yt-dlp');
  const ffmpegExists = await checkDep('ffmpeg');

  debugLog(`yt-dlp exists: ${ytdlpExists}, ffmpeg exists: ${ffmpegExists}`);

  if (ytdlpExists && ffmpegExists) {
    hideSetupOverlay();
    setStatus('ready', 'Ready');
    return;
  }

  setSetupStatus('Setting up dependencies...', 10);

  try {
    await Neutralino.filesystem.createDirectory(DEPS_DIR);
  } catch {}

  if (!ytdlpExists) {
    setSetupStatus('Downloading yt-dlp...', 20);
    await downloadWithProgress(YTDLP_URLS[platform], getDepPath('yt-dlp'), (percent, current, total) => {
      setSetupStatus(`Downloading yt-dlp... ${formatBytes(current)} / ${formatBytes(total)}`, 20 + (percent * 0.2));
    });
    if (platform !== 'win32') {
      await Neutralino.os.execCommand(`chmod +x ${getDepPath('yt-dlp')}`);
    }
    setSetupStatus('yt-dlp descargado', 40);
  }

  if (!ffmpegExists) {
    const ffmpegInfo = FFMPEG_URLS[platform];
    const archiveName = ffmpegInfo.url.split('/').pop();
    const archivePath = `${DEPS_DIR}/${archiveName}`;
    setSetupStatus('Downloading ffmpeg...', 50);
    await downloadWithProgress(ffmpegInfo.url, archivePath, (percent, current, total) => {
      setSetupStatus(`Downloading ffmpeg... ${formatBytes(current)} / ${formatBytes(total)}`, 50 + (percent * 0.25));
    });
    setSetupStatus('Extrayendo ffmpeg...', 75);
    await extractArchive(archivePath, DEPS_DIR, ffmpegInfo.extract);
    const ffmpegDest = getDepPath('ffmpeg');
    const extractedFolder = archiveName.replace(/\.(zip|tar\.xz)$/, '');
    const tempFfmpeg = `${DEPS_DIR}/${extractedFolder}/${ffmpegInfo.extract}`;
    try {
      const tempStats = await Neutralino.filesystem.getStats(tempFfmpeg);
      if (tempStats) {
        try {
          await Neutralino.filesystem.remove(ffmpegDest);
        } catch {}
        const copyCmd = platform === 'win32' ? `powershell -NoProfile -Command "Copy-Item '${tempFfmpeg}' '${ffmpegDest}'"` : `cp '${tempFfmpeg}' '${ffmpegDest}'`;
        await Neutralino.os.execCommand(copyCmd);
        if (platform !== 'win32') {
          await Neutralino.os.execCommand(`chmod +x ${ffmpegDest}`);
        }
        debugLog(`ffmpeg copied to ${ffmpegDest}`);
        setSetupStatus('Configuración completa', 100);
      } else {
        debugLog(`ffmpeg not found at expected path: ${tempFfmpeg}`);
      }
    } catch (err) {
      debugLog(`ffmpeg copy error: ${err.message || err}`);
    }
  }

  await new Promise(r => setTimeout(r, 500));
  hideSetupOverlay();
  setStatus('ready', 'Ready');
}

function setStatus(type, text) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = `status ${type}`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function fetchVideoInfo() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;

  const fetchBtn = document.getElementById('fetchBtn');
  fetchBtn.disabled = true;
  setStatus('loading', 'Loading info...');

  try {
    const ytdlp = getDepPath('yt-dlp');
    const cmd = `"${ytdlp}" --dump-single-json --no-download --flat-playlist "${url}"`;
    debugLog(`Running: ${cmd}`);
    const result = await Neutralino.os.execCommand(cmd);
    debugLog(`execCommand result: pid=${result.pid}, exitCode=${result.exitCode}`);
    debugLog(`stdOut length: ${result.stdOut?.length || 0}, stdErr length: ${result.stdErr?.length || 0}`);
    const output = result.stdOut.trim();
    let info;
    try {
      const firstLine = output.split('\n')[0];
      info = JSON.parse(firstLine);
    } catch (parseErr) {
      debugLog(`JSON parse error. Raw output: ${output?.substring(0, 500)}`);
      debugLog(`stdErr: ${result.stdErr?.substring(0, 500)}`);
      throw parseErr;
    }
    currentVideo = info;

    const isPlaylist = info._type === 'playlist';
    document.getElementById('thumbnail').src = info.thumbnail || '';
    document.getElementById('title').textContent = info.title;
    document.getElementById('duration').textContent = info.duration ? formatDuration(info.duration) : (isPlaylist ? '' : 'N/A');
    document.getElementById('type').textContent = isPlaylist ? `Playlist (${info.entries?.length || 0} videos)` : 'Video';

    const formatSelect = document.getElementById('formatSelect');
    formatSelect.innerHTML = '';

    if (info.formats && !isPlaylist) {
      const videoFormats = info.formats.filter(f => f.height && f.vcodec !== 'none').sort((a, b) => (b.height || 0) - (a.height || 0));
      const seen = new Set();
      videoFormats.forEach(f => {
        if (!seen.has(f.height)) {
          seen.add(f.height);
          const opt = document.createElement('option');
          opt.value = String(f.height);
          const ext = f.ext || 'mp4';
          opt.textContent = `${f.height}p (${ext})`;
          formatSelect.appendChild(opt);
        }
      });
    }

    if (!formatSelect.options.length) {
      const opt = document.createElement('option');
      opt.value = 'best';
      opt.textContent = 'Best quality';
      formatSelect.appendChild(opt);
    }

    document.getElementById('videoInfo').classList.remove('hidden');
    setStatus('ready', 'Info loaded');
  } catch (err) {
    setStatus('error', 'Error fetching info');
    console.error(err);
  } finally {
    fetchBtn.disabled = false;
  }
}

async function chooseDownloadFolder() {
  try {
    const folder = await Neutralino.os.showFolderDialog('Select download folder');
    if (folder) {
      downloadFolder = folder;
      await Neutralino.storage.setData('downloadFolder', folder);
      updateFolderUI();
    }
    return folder;
  } catch {
    return null;
  }
}

function updateFolderUI() {
  const el = document.getElementById('folderPath');
  if (downloadFolder) {
    el.textContent = downloadFolder;
    el.classList.remove('empty');
  } else {
    el.textContent = 'Select a download folder';
    el.classList.add('empty');
  }
}

async function loadDownloadFolder() {
  try {
    const stored = await Neutralino.storage.getData('downloadFolder');
    if (stored) {
      downloadFolder = stored;
      updateFolderUI();
    }
  } catch {
    downloadFolder = '';
  }
}

async function startDownload() {
  if (!currentVideo || isDownloading) return;

  const downloadBtn = document.getElementById('downloadBtn');
  const audioOnly = document.getElementById('audioOnly').checked;
  const format = document.getElementById('formatSelect').value;

  if (!downloadFolder) {
    await chooseDownloadFolder();
    if (!downloadFolder) return;
  }

  const folder = downloadFolder;

  isDownloading = true;
  downloadBtn.disabled = true;
  document.getElementById('progressSection').classList.remove('hidden');
  setStatus('loading', 'Downloading...');

  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressPercent').textContent = '0%';
  document.getElementById('progressText').textContent = 'Starting download...';

  const ytdlp = getDepPath('yt-dlp');
  const ffmpegDir = DEPS_DIR;
  const isPlaylist = currentVideo._type === 'playlist';
  const videoUrl = currentVideo.webpage_url || currentVideo.url;
  const outTemplate = isPlaylist ? `${folder}/%(playlist_index)s - %(title)s.%(ext)s` : `${folder}/%(title)s.%(ext)s`;

  let cmd;
  if (audioOnly) {
    cmd = `"${ytdlp}" -x --audio-format mp3 --ffmpeg-location "${ffmpegDir}" --restrict-filenames --newline --no-warnings -o "${outTemplate}" "${videoUrl}"`;
  } else if (format === 'best') {
    cmd = `"${ytdlp}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" --ffmpeg-location "${ffmpegDir}" --merge-output-format mp4 --restrict-filenames --newline --no-warnings -o "${outTemplate}" "${videoUrl}"`;
  } else {
    cmd = `"${ytdlp}" -f "bestvideo[height=${format}]+bestaudio/best[height=${format}]" --ffmpeg-location "${ffmpegDir}" --merge-output-format mp4 --restrict-filenames --newline --no-warnings -o "${outTemplate}" "${videoUrl}"`;
  }

  debugLog(`Download cmd: ${cmd}`);

  const spawn = await Neutralino.os.spawnProcess(cmd);
  const spawnId = spawn.id;

  let playlistTotal = 1;
  let playlistCurrent = 0;

  function onSpawnedProcess(evt) {
    if (evt.detail.id !== spawnId) return;

    if (evt.detail.action === 'stdErr' || evt.detail.action === 'stdOut') {
      const line = evt.detail.data || '';
      debugLog(`ytdlp: ${line.substring(0, 200)}`);

      const itemMatch = line.match(/\[download\]\s+Downloading item (\d+) of (\d+)/);
      if (itemMatch) {
        playlistCurrent = parseInt(itemMatch[1]) - 1;
        playlistTotal = parseInt(itemMatch[2]);
        document.getElementById('progressText').textContent = `Downloading video ${itemMatch[1]} of ${itemMatch[2]}...`;
      }

      const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
      if (progressMatch) {
        const itemPercent = parseFloat(progressMatch[1]);
        let totalPercent = itemPercent;
        if (isPlaylist && playlistTotal > 1) {
          totalPercent = ((playlistCurrent / playlistTotal) + (itemPercent / 100 / playlistTotal)) * 100;
        }
        totalPercent = Math.min(totalPercent, 99.9);
        document.getElementById('progressFill').style.width = `${totalPercent}%`;
        document.getElementById('progressPercent').textContent = `${totalPercent.toFixed(1)}%`;
        if (!itemMatch) {
          document.getElementById('progressText').textContent = 'Downloading...';
        }
      }
    } else if (evt.detail.action === 'exit') {
      Neutralino.events.off('spawnedProcess', onSpawnedProcess);

      const success = evt.detail.data === 0;
      document.getElementById('progressFill').style.width = '100%';
      document.getElementById('progressPercent').textContent = '100%';
      document.getElementById('progressText').textContent = success ? 'Completed' : 'Error';

      setTimeout(() => {
        document.getElementById('progressSection').classList.add('hidden');
        setStatus(success ? 'ready' : 'error', success ? 'Download complete' : 'Download error');
        isDownloading = false;
        downloadBtn.disabled = false;
        document.getElementById('progressFill').style.width = '0%';
        document.getElementById('progressPercent').textContent = '0%';
        document.getElementById('progressText').textContent = 'Downloading...';
      }, 800);
    }
  }

  Neutralino.events.on('spawnedProcess', onSpawnedProcess);
}

Neutralino.init();

Neutralino.events.on('windowClose', () => {
  Neutralino.app.exit();
});

async function setDraggable() {
  try {
    if (Neutralino.window && Neutralino.window.setDraggableRegion) {
      await Neutralino.window.setDraggableRegion('titlebarDrag');
    }
  } catch (e) {
    debugLog('setDraggableRegion error: ' + (e.message || e));
  }
}

async function initWindowControls() {
  await setDraggable();

  document.getElementById('minimizeBtn').addEventListener('click', async () => {
    try {
      if (Neutralino.window && Neutralino.window.minimize) await Neutralino.window.minimize();
    } catch (e) {
      debugLog('minimize error: ' + (e.message || e));
    }
  });

  document.getElementById('maximizeBtn').addEventListener('click', async () => {
    try {
      if (!Neutralino.window) return;
      const maximized = await Neutralino.window.isMaximized();
      if (maximized) {
        await Neutralino.window.unmaximize();
      } else {
        await Neutralino.window.maximize();
      }
    } catch (e) {
      debugLog('maximize error: ' + (e.message || e));
    }
  });

  document.getElementById('closeBtn').addEventListener('click', async () => {
    try {
      if (Neutralino.app && Neutralino.app.exit) {
        await Neutralino.app.exit();
      } else if (Neutralino.window && Neutralino.window.close) {
        await Neutralino.window.close();
      }
    } catch (e) {
      debugLog('close error: ' + (e.message || e));
    }
  });
}

document.getElementById('fetchBtn').addEventListener('click', fetchVideoInfo);
document.getElementById('downloadBtn').addEventListener('click', startDownload);
document.getElementById('urlInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') fetchVideoInfo();
});

document.getElementById('audioOnly').addEventListener('change', (e) => {
  const formatSelect = document.getElementById('formatSelect');
  if (e.target.checked) {
    formatSelect.innerHTML = '<option value="best">Best audio</option>';
  } else if (currentVideo?.formats) {
    formatSelect.innerHTML = '';
    const videoFormats = currentVideo.formats.filter(f => f.height && f.vcodec !== 'none').sort((a, b) => (b.height || 0) - (a.height || 0));
    const seen = new Set();
    videoFormats.forEach(f => {
      if (!seen.has(f.height)) {
        seen.add(f.height);
        const opt = document.createElement('option');
        opt.value = String(f.height);
        opt.textContent = `${f.height}p (${f.ext || 'mp4'})`;
        formatSelect.appendChild(opt);
      }
    });
    if (!formatSelect.options.length) {
      const opt = document.createElement('option');
      opt.value = 'best';
      opt.textContent = 'Best quality';
      formatSelect.appendChild(opt);
    }
  }
});

initWindowControls();
loadDownloadFolder();
setupDeps();

document.getElementById('changeFolderBtn').addEventListener('click', chooseDownloadFolder);
