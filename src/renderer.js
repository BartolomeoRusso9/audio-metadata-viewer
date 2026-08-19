const dropzone = document.getElementById('dropzone');
const dashboard = document.getElementById('dashboard');
const errorMsg = document.getElementById('error-msg');

document.getElementById('btn-close').addEventListener('click', () => window.api.close());
document.getElementById('btn-min').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-browse').addEventListener('click', browse);
document.getElementById('btn-new').addEventListener('click', showDropzone);

// ---------- Drag & drop ----------

['dragenter', 'dragover'].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(evt => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) analyze(file.path);
});

async function browse() {
  const filePath = await window.api.openFile();
  if (filePath) analyze(filePath);
}

function showDropzone() {
  dashboard.classList.add('hidden');
  dropzone.classList.remove('hidden');
  errorMsg.textContent = '';
}

// ---------- Analysis ----------

async function analyze(filePath) {
  errorMsg.textContent = '';
  try {
    const { data } = await window.api.analyze(filePath);
    render(data, filePath);
    dropzone.classList.add('hidden');
    dashboard.classList.remove('hidden');
  } catch (err) {
    errorMsg.textContent = err.message || 'Unable to analyze the file.';
  }
}

function render(data, filePath) {
  const format = data.format || {};
  const streams = data.streams || [];
  const audio = streams.find(s => s.codec_type === 'audio') || {};
  const video = streams.find(s => s.codec_type === 'video');

  const fileName = filePath.split(/[\\/]/).pop();
  document.getElementById('file-name').textContent = fileName;

  // ---- tags row under filename ----
  const tagsEl = document.getElementById('file-tags');
  tagsEl.innerHTML = '';
  const summaryTags = [
    audio.codec_name ? audio.codec_name.toUpperCase() : null,
    format.duration ? formatDuration(format.duration) : null,
    format.size ? formatBytes(format.size) : null,
    isLossless(audio.codec_name) ? 'LOSSLESS' : (audio.codec_name ? 'LOSSY' : null)
  ].filter(Boolean);
  summaryTags.forEach((t, i) => {
    const span = document.createElement('span');
    span.className = 'tag' + (i === summaryTags.length - 1 && isLossless(audio.codec_name) ? ' accent' : '');
    span.textContent = t;
    tagsEl.appendChild(span);
  });

  // ---- LED meter panel ----
  renderMeter('samplerate', audio.sample_rate);
  renderBitDepthMeter(audio);
  renderBitrateMeter(format.bit_rate || audio.bit_rate);

  // ---- Format card ----
  fillKv('format-list', [
    ['Container', format.format_long_name || format.format_name],
    ['Typical extensions', format.format_name],
    ['Duration', format.duration ? `${formatDuration(format.duration)} (${Number(format.duration).toFixed(3)} s)` : null],
    ['Size', format.size ? `${formatBytes(format.size)} (${Number(format.size).toLocaleString('en-US')} bytes)` : null],
    ['Total bitrate', format.bit_rate ? formatBitrate(format.bit_rate) : null],
    ['Stream count', format.nb_streams],
    ['Path', filePath]
  ]);

  // ---- Audio stream card ----
  const bitDepth = getBitDepth(audio);
  fillKv('audio-list', [
    ['Codec', audio.codec_long_name || audio.codec_name],
    ['Profile', audio.profile],
    ['Sample rate', audio.sample_rate ? `${Number(audio.sample_rate).toLocaleString('en-US')} Hz` : null],
    ['Bit depth', bitDepth ? `${bitDepth} bit` : (audio.sample_fmt ? audio.sample_fmt : null)],
    ['Sample format', audio.sample_fmt],
    ['Channels', audio.channels ? `${audio.channels} (${audio.channel_layout || '—'})` : null],
    ['Stream bitrate', audio.bit_rate ? formatBitrate(audio.bit_rate) : null],
    ['Total frames', audio.nb_frames],
    ['Time base', audio.time_base]
  ]);

  // ---- Video / cover stream card ----
  const videoCard = document.getElementById('video-card');
  if (video) {
    videoCard.style.display = '';
    fillKv('video-list', [
      ['Codec', video.codec_long_name || video.codec_name],
      ['Resolution', video.width ? `${video.width}×${video.height}` : null],
      ['Type', video.disposition && video.disposition.attached_pic ? 'Embedded cover art' : 'Video stream'],
      ['Pixel format', video.pix_fmt]
    ]);
  } else {
    videoCard.style.display = 'none';
  }

  // ---- Tags / metadata card ----
  const tagsMerged = { ...(format.tags || {}), ...(audio.tags || {}) };
  const tagEntries = Object.entries(tagsMerged);
  const tagsDl = document.getElementById('tags-list');
  tagsDl.innerHTML = '';
  if (tagEntries.length === 0) {
    tagsDl.innerHTML = '<div class="empty">No metadata/tags found in this file.</div>';
  } else {
    tagEntries.forEach(([k, v]) => addKv(tagsDl, prettify(k), String(v)));
  }

  // ---- Raw JSON ----
  document.getElementById('raw-json').textContent = JSON.stringify(data, null, 2);
}

// ---------- Meter rendering ----------

function buildLeds(containerId, litCount, total, colorClass) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const led = document.createElement('div');
    led.className = 'led' + (i < litCount ? ` ${colorClass}` : '');
    el.appendChild(led);
  }
}

function renderMeter(kind, sampleRateRaw) {
  const sampleRate = Number(sampleRateRaw) || 0;
  document.getElementById('val-samplerate').textContent = sampleRate
    ? `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)} kHz`
    : '—';
  // 8 segments, tier by common sample rates
  const tiers = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000];
  const idx = tiers.findIndex(t => sampleRate <= t);
  const lit = sampleRate === 0 ? 0 : Math.max(1, Math.round(((idx === -1 ? tiers.length : idx + 1) / tiers.length) * 8));
  const color = sampleRate >= 96000 ? 'lit-green' : sampleRate >= 44100 ? 'lit-amber' : 'lit-red';
  buildLeds('led-samplerate', lit, 8, color);
}

function renderBitDepthMeter(audio) {
  const depth = getBitDepth(audio);
  document.getElementById('val-bitdepth').textContent = depth ? `${depth}-bit` : (audio.sample_fmt || '—');
  const lit = depth ? Math.min(8, Math.round((depth / 32) * 8)) : 0;
  const color = depth >= 24 ? 'lit-green' : depth >= 16 ? 'lit-amber' : 'lit-red';
  buildLeds('led-bitdepth', lit || (depth ? 1 : 0), 8, color);
}

function renderBitrateMeter(bitRateRaw) {
  const br = Number(bitRateRaw) || 0;
  document.getElementById('val-bitrate').textContent = br ? formatBitrate(br) : '—';
  const kbps = br / 1000;
  const lit = br === 0 ? 0 : Math.max(1, Math.min(8, Math.round((kbps / 1411) * 8)));
  const color = kbps >= 900 ? 'lit-green' : kbps >= 192 ? 'lit-amber' : 'lit-red';
  buildLeds('led-bitrate', lit, 8, color);
}

// ---------- Helpers ----------

function getBitDepth(audio) {
  if (!audio) return null;
  if (audio.bits_per_raw_sample && Number(audio.bits_per_raw_sample) > 0) {
    return Number(audio.bits_per_raw_sample);
  }
  if (audio.bits_per_sample && Number(audio.bits_per_sample) > 0) {
    return Number(audio.bits_per_sample);
  }
  const fmt = audio.sample_fmt || '';
  const map = {
    u8: 8, u8p: 8,
    s16: 16, s16p: 16,
    s32: 32, s32p: 32,
    s64: 64, s64p: 64,
    flt: 32, fltp: 32,
    dbl: 64, dblp: 64
  };
  return map[fmt] || null;
}

function isLossless(codecName) {
  if (!codecName) return false;
  return ['flac', 'alac', 'wavpack', 'ape', 'tak', 'truehd', 'mlp', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'dsd_lsbf', 'dsd_msbf']
    .some(c => codecName.toLowerCase().includes(c));
}

function formatDuration(seconds) {
  seconds = Number(seconds);
  if (!seconds || Number.isNaN(seconds)) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatBytes(bytes) {
  bytes = Number(bytes);
  if (!bytes) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function formatBitrate(bitRate) {
  const n = Number(bitRate);
  if (!n) return null;
  return `${Math.round(n / 1000).toLocaleString('en-US')} kb/s`;
}

function prettify(key) {
  return key.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fillKv(containerId, pairs) {
  const dl = document.getElementById(containerId);
  dl.innerHTML = '';
  const valid = pairs.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (valid.length === 0) {
    dl.innerHTML = '<div class="empty">No data available.</div>';
    return;
  }
  valid.forEach(([k, v]) => addKv(dl, k, v));
}

function addKv(dl, key, value) {
  const dt = document.createElement('dt');
  dt.textContent = key;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dl.appendChild(dt);
  dl.appendChild(dd);
}
