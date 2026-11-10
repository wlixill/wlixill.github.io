import { icon } from './icons.js';
import { $, $$, esc, toast, copyText, formatBytes } from './ui.js';

/* ==========================================================================
   视频格式转换 — 本地 ffmpeg.wasm 引擎
   ========================================================================== */

const ENGINE_BASE = new URL('../vendor/media-engine/', import.meta.url);
const SAMPLE_URL = new URL('./sample/demo.mp4', import.meta.url).href;

const FORMATS = [
  { id: 'mp4', label: 'MP4', kind: 'video', ext: 'mp4', mime: 'video/mp4', hint: '通用 · H.264' },
  { id: 'mov', label: 'MOV', kind: 'video', ext: 'mov', mime: 'video/quicktime', hint: 'Apple · 剪辑' },
  { id: 'mkv', label: 'MKV', kind: 'video', ext: 'mkv', mime: 'video/x-matroska', hint: '开放容器' },
  { id: 'webm', label: 'WebM', kind: 'video', ext: 'webm', mime: 'video/webm', hint: '网页视频' },
  { id: 'avi', label: 'AVI', kind: 'video', ext: 'avi', mime: 'video/x-msvideo', hint: '传统容器' },
  { id: 'm4v', label: 'M4V', kind: 'video', ext: 'm4v', mime: 'video/x-m4v', hint: 'Apple 视频' },
  { id: 'flv', label: 'FLV', kind: 'video', ext: 'flv', mime: 'video/x-flv', hint: '直播归档' },
  { id: 'wmv', label: 'WMV', kind: 'video', ext: 'wmv', mime: 'video/x-ms-wmv', hint: 'Windows' },
  { id: 'ts', label: 'TS', kind: 'video', ext: 'ts', mime: 'video/mp2t', hint: '传输流' },
  { id: 'mpeg', label: 'MPEG', kind: 'video', ext: 'mpg', mime: 'video/mpeg', hint: 'MPEG-2' },
  { id: 'ogv', label: 'OGV', kind: 'video', ext: 'ogv', mime: 'video/ogg', hint: '开放视频' },
  { id: '3gp', label: '3GP', kind: 'video', ext: '3gp', mime: 'video/3gpp', hint: '移动端' },
  { id: 'gif', label: 'GIF', kind: 'video', ext: 'gif', mime: 'image/gif', hint: '无声动图' },
  { id: 'mp3', label: 'MP3', kind: 'audio', ext: 'mp3', mime: 'audio/mpeg', hint: '提取音频' },
  { id: 'wav', label: 'WAV', kind: 'audio', ext: 'wav', mime: 'audio/wav', hint: '无压缩' },
  { id: 'm4a', label: 'M4A', kind: 'audio', ext: 'm4a', mime: 'audio/mp4', hint: 'AAC 音频' },
  { id: 'flac', label: 'FLAC', kind: 'audio', ext: 'flac', mime: 'audio/flac', hint: '无损' },
  { id: 'ogg', label: 'OGG', kind: 'audio', ext: 'ogg', mime: 'audio/ogg', hint: 'Vorbis' },
  { id: 'aac', label: 'AAC', kind: 'audio', ext: 'aac', mime: 'audio/aac', hint: '原始流' },
];

const QUALITY = {
  small: { label: '小体积', crf: 30 },
  balanced: { label: '均衡', crf: 24 },
  high: { label: '高质量', crf: 18 },
};

const RESOLUTION = { source: 0, '1080': 1080, '720': 720, '480': 480 };

const engine = { ffmpeg: null, loading: null };

async function ensureEngine(onProgress) {
  if (engine.ffmpeg?.loaded) return engine.ffmpeg;
  if (!engine.loading) {
    engine.loading = (async () => {
      onProgress({ phase: 'init', pct: 0 });
      const { FFmpeg } = await import(new URL('index.js', ENGINE_BASE).href);
      const ff = new FFmpeg();

      const manifest = await (await fetch(new URL('manifest.json', ENGINE_BASE))).json();
      const parts = [];
      let loaded = 0;
      for (const part of manifest.parts) {
        const res = await fetch(new URL(part, ENGINE_BASE));
        if (!res.ok) throw new Error('转码引擎下载失败，请检查网络后重试');
        const buf = await res.arrayBuffer();
        parts.push(new Uint8Array(buf));
        loaded += buf.byteLength;
        onProgress({ phase: 'download', pct: Math.min(99, Math.round((loaded / manifest.size) * 100)) });
      }
      const wasmURL = URL.createObjectURL(new Blob(parts, { type: 'application/wasm' }));
      try {
        await ff.load({
          classWorkerURL: new URL('worker.js', ENGINE_BASE).href,
          coreURL: new URL('ffmpeg-core.js', ENGINE_BASE).href,
          wasmURL,
        });
      } finally {
        URL.revokeObjectURL(wasmURL);
      }
      engine.ffmpeg = ff;
      onProgress({ phase: 'ready', pct: 100 });
      return ff;
    })();
  }
  try {
    return await engine.loading;
  } finally {
    engine.loading = null;
  }
}

function buildArgs(fmt, { crf, maxH, audio }) {
  const scale = maxH ? `scale=-2:min(ih\\,${maxH})` : null;
  const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p'];
  const aac = ['-c:a', 'aac', '-b:a', '160k'];
  const sound = audio ? aac : ['-an'];
  const out = `out.${fmt.ext}`;

  switch (fmt.id) {
    case 'mp4':
    case 'm4v':
    case 'mov':
      return ['-i', 'in', ...(scale ? ['-vf', scale] : []), ...h264, ...sound, '-movflags', '+faststart', out];
    case 'mkv':
      return ['-i', 'in', ...(scale ? ['-vf', scale] : []), ...h264, ...sound, out];
    case 'webm':
      return ['-i', 'in', ...(scale ? ['-vf', scale] : []), '-c:v', 'libvpx', '-b:v', '1M', '-crf', '10', '-quality', 'realtime', '-cpu-used', '5', '-row-mt', '1', ...(audio ? ['-c:a', 'libvorbis', '-q:a', '4'] : ['-an']), out];
    case 'avi':
      return ['-i', 'in', ...(scale ? ['-vf', scale] : []), '-c:v', 'mpeg4', '-qscale:v', '4', ...(audio ? ['-c:a', 'libmp3lame', '-q:a', '4'] : ['-an']), out];
    case 'flv':
      return ['-i', 'in', ...(scale ? ['-vf', scale] : []), ...h264, ...sound, '-f', 'flv', out];
    case 'wmv':
      return ['-i', 'in', ...(scale ? ['-vf', scale] : []), '-c:v', 'wmv2', '-qscale:v', '4', ...(audio ? ['-c:a', 'wmav2'] : ['-an']), out];
    case 'ts':
      return ['-i', 'in', ...(scale ? ['-vf', scale] : []), ...h264, ...sound, '-f', 'mpegts', out];
    case 'mpeg':
      return ['-i', 'in', ...(scale ? ['-vf', scale] : []), '-c:v', 'mpeg2video', '-qscale:v', '5', ...(audio ? ['-c:a', 'mp2', '-b:a', '192k'] : ['-an']), '-f', 'mpeg', out];
    case 'ogv':
      return ['-i', 'in', ...(scale ? ['-vf', scale] : []), '-c:v', 'libtheora', '-q:v', '6', ...(audio ? ['-c:a', 'libvorbis', '-q:a', '4'] : ['-an']), out];
    case '3gp':
      return ['-i', 'in', ...(scale ? ['-vf', scale] : []), '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-crf', String(Math.max(crf, 26)), ...(audio ? ['-c:a', 'aac', '-ar', '44100', '-ac', '2'] : ['-an']), '-f', '3gp', out];
    case 'gif':
      return null; // 单独两遍调色板流程
    case 'mp3':
      return ['-i', 'in', '-vn', '-c:a', 'libmp3lame', '-q:a', '2', out];
    case 'wav':
      return ['-i', 'in', '-vn', '-c:a', 'pcm_s16le', out];
    case 'm4a':
      return ['-i', 'in', '-vn', '-c:a', 'aac', '-b:a', '192k', out];
    case 'flac':
      return ['-i', 'in', '-vn', '-c:a', 'flac', out];
    case 'ogg':
      return ['-i', 'in', '-vn', '-c:a', 'libvorbis', '-q:a', '5', out];
    case 'aac':
      return ['-i', 'in', '-vn', '-c:a', 'aac', '-b:a', '192k', '-f', 'adts', out];
    default:
      return ['-i', 'in', out];
  }
}

const baseName = (name) => name.replace(/\.[^.]+$/, '') || 'output';

/* ==========================================================================
   view
   ========================================================================== */
export function mountVideo(root) {
  const state = {
    file: null,
    duration: 0,
    format: 'mp4',
    quality: 'balanced',
    resolution: 'source',
    audio: true,
    busy: false,
    cancelled: false,
    output: null,
  };

  const videoFormats = FORMATS.filter((f) => f.kind === 'video');
  const audioFormats = FORMATS.filter((f) => f.kind === 'audio');

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">${icon('upload')}源文件</span>
        <span class="pill">${FORMATS.length} 种输出格式</span>
      </div>
      <div class="panel-body" id="source-body">
        <div class="dropzone" id="dz" tabindex="0" role="button" aria-label="选择或拖入视频文件">
          <span class="dz-icon">${icon('upload')}</span>
          <strong>拖入视频，或点击选择</strong>
          <span class="dz-hint">MP4 / MOV / MKV / AVI / WebM 等 · 单文件最大 200 MB</span>
          <div class="btn-row" style="margin-top:4px">
            <button class="btn btn-sm" type="button" data-act="pick">选择视频</button>
            <button class="btn btn-sm btn-ghost" type="button" data-act="sample">试用示例</button>
          </div>
        </div>
        <input type="file" id="file-input" accept="video/*,audio/*,.mkv,.avi,.mov,.webm,.flv,.ts,.m4v" hidden />
        <div id="file-slot" style="margin-top:10px"></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">${icon('film')}输出设置</span>
        <span class="status" id="engine-note"></span>
      </div>
      <div class="panel-body">
        <div class="field">
          <span class="field-label"><span>目标格式</span><span class="hint" id="fmt-hint"></span></span>
          <div class="format-group">
            <div class="format-label">视频</div>
            <div class="format-grid">
              ${videoFormats.map((f) => `<button class="fmt" type="button" data-fmt="${f.id}" aria-pressed="${f.id === 'mp4'}" title="${f.hint}">${f.label}</button>`).join('')}
            </div>
            <div class="format-label">音频</div>
            <div class="format-grid">
              ${audioFormats.map((f) => `<button class="fmt" type="button" data-fmt="${f.id}" aria-pressed="false" title="${f.hint}">${f.label}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="options-grid" style="margin-top:16px">
          <div class="field">
            <span class="field-label">质量</span>
            <div class="seg" role="group" aria-label="输出质量">
              ${Object.entries(QUALITY).map(([k, q]) => `<button type="button" data-quality="${k}" aria-pressed="${k === 'balanced'}">${q.label}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <span class="field-label">分辨率</span>
            <select class="input" id="res-select">
              <option value="source">保持原始尺寸</option>
              <option value="1080">最高 1080p</option>
              <option value="720">最高 720p</option>
              <option value="480">最高 480p</option>
            </select>
          </div>
          <div class="field" id="audio-field">
            <span class="field-label">声音</span>
            <label class="check" style="height:38px"><input type="checkbox" id="audio-check" checked /> 保留第一条音轨</label>
          </div>
        </div>
      </div>
      <div class="panel-foot" style="flex-direction:column;align-items:stretch;gap:12px">
        <div id="video-progress" hidden>
          <div class="progress-row"><span id="progress-label">准备中…</span><span class="pct" id="progress-pct">0%</span></div>
          <div class="progress"><i id="progress-bar"></i></div>
        </div>
        <div id="video-alert"></div>
        <div class="btn-row" style="justify-content:space-between">
          <span class="note" id="video-note">${icon('shield')}视频不会上传，转码在本机完成</span>
          <div class="btn-row">
            <button class="btn btn-ghost" type="button" id="cancel-btn" hidden>取消</button>
            <button class="btn btn-primary" type="button" id="convert-btn">${icon('sparkles')}开始转换</button>
          </div>
        </div>
      </div>
    </section>

    <div id="output-slot"></div>
  `;

  const dz = $('#dz', root);
  const fileInput = $('#file-input', root);
  const fileSlot = $('#file-slot', root);
  const outputSlot = $('#output-slot', root);
  const progressWrap = $('#video-progress', root);
  const progressBar = $('#progress-bar', root);
  const progressPct = $('#progress-pct', root);
  const progressLabel = $('#progress-label', root);
  const alertSlot = $('#video-alert', root);
  const convertBtn = $('#convert-btn', root);
  const cancelBtn = $('#cancel-btn', root);
  const engineNote = $('#engine-note', root);
  const fmtHint = $('#fmt-hint', root);
  const audioField = $('#audio-field', root);
  const resSelect = $('#res-select', root);
  const audioCheck = $('#audio-check', root);

  let objectUrl = null;

  const setStatus = (text, err = false) => {
    engineNote.className = `status${err ? ' err' : text ? ' ok' : ''}`;
    engineNote.textContent = text;
  };

  const setProgress = (pct, label) => {
    progressWrap.hidden = false;
    progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    progressPct.textContent = `${Math.round(pct)}%`;
    if (label) progressLabel.textContent = label;
  };

  const showError = (msg) => {
    alertSlot.innerHTML = `<div class="alert">${icon('alert')}<span>${esc(msg)}</span></div>`;
  };

  const clearError = () => {
    alertSlot.innerHTML = '';
  };

  const fmtOf = (id) => FORMATS.find((f) => f.id === id);

  const paintFile = () => {
    dz.hidden = !!state.file;
    convertBtn.disabled = !state.file || state.busy;
    if (!state.file) {
      fileSlot.innerHTML = '';
      return;
    }
    const f = state.file;
    fileSlot.innerHTML = `<div class="file-card">
      <span class="file-thumb">${icon('videoFile')}</span>
      <div class="file-main">
        <div class="file-name">${esc(f.name)}</div>
        <div class="file-meta">${formatBytes(f.size)}${state.duration ? ` · ${Math.floor(state.duration / 60)}:${String(Math.round(state.duration % 60)).padStart(2, '0')}` : ''} · ${esc((f.type || '未知格式').replace('video/', '').replace('audio/', ''))}</div>
      </div>
      <div class="file-actions">
        <button class="btn btn-sm" type="button" data-act="pick">${icon('upload')}更换</button>
        <button class="btn-icon" type="button" data-act="remove" title="移除" aria-label="移除文件">${icon('x')}</button>
      </div>
    </div>`;
  };

  const setFile = (file) => {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      showError('文件超过 200 MB，转码容易撑爆内存，建议先裁剪片段。');
      return;
    }
    clearError();
    state.file = file;
    state.output = null;
    state.duration = 0;
    outputSlot.innerHTML = '';
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = objectUrl;
    probe.addEventListener('loadedmetadata', () => {
      state.duration = Number.isFinite(probe.duration) ? probe.duration : 0;
      paintFile();
    }, { once: true });
    probe.addEventListener('error', () => { /* 部分容器无法预读，忽略 */ }, { once: true });
    paintFile();
  };

  const paintFormat = () => {
    const fmt = fmtOf(state.format);
    $$('[data-fmt]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-fmt') === state.format)));
    fmtHint.textContent = `${fmt.label} · ${fmt.hint}`;
    audioField.style.opacity = fmt.kind === 'audio' ? '0.45' : '1';
    audioCheck.disabled = fmt.kind === 'audio';
    if (fmt.kind === 'audio') audioCheck.checked = false;
    else audioCheck.checked = state.audio;
    cancelBtn.hidden = true;
  };

  const setBusy = (busy) => {
    state.busy = busy;
    convertBtn.disabled = busy || !state.file;
    convertBtn.innerHTML = busy ? `${icon('refresh')}转换中…` : `${icon('sparkles')}开始转换`;
    cancelBtn.hidden = !busy;
    dz.style.pointerEvents = busy ? 'none' : '';
    dz.style.opacity = busy ? '0.55' : '';
  };

  const downloadName = () => {
    const f = state.file;
    const fmt = fmtOf(state.format);
    return `${baseName(f?.name || 'video')}-${fmt.id}.${fmt.ext}`;
  };

  const paintOutput = () => {
    if (!state.output) {
      outputSlot.innerHTML = '';
      return;
    }
    const { url, size, name } = state.output;
    outputSlot.innerHTML = `<section class="panel">
      <div class="panel-head">
        <span class="panel-title">${icon('check')}转换完成</span>
        <span class="pill accent">${formatBytes(size)}</span>
      </div>
      <div class="panel-body">
        <div class="file-card">
          <span class="file-thumb">${icon('download')}</span>
          <div class="file-main">
            <div class="file-name">${esc(name)}</div>
            <div class="file-meta">${formatBytes(size)} · ${esc(fmtOf(state.format).label)}</div>
          </div>
          <a class="btn btn-primary" href="${url}" download="${esc(name)}">${icon('download')}下载</a>
        </div>
      </div>
    </section>`;
  };

  async function convert() {
    if (!state.file || state.busy) return;
    clearError();
    state.output = null;
    outputSlot.innerHTML = '';
    state.cancelled = false;
    setBusy(true);
    setStatus('');
    setProgress(0, '正在加载转码引擎…');

    try {
      const ff = await ensureEngine(({ phase, pct }) => {
        if (phase === 'download') {
          setStatus(`引擎 ${pct}%`);
          setProgress(pct, '首次使用，正在下载转码引擎…');
        } else if (phase === 'init') {
          setStatus('初始化…');
        }
      });
      if (state.cancelled) return;

      const fmt = fmtOf(state.format);
      const quality = QUALITY[state.quality];
      const maxH = RESOLUTION[state.resolution];
      const outName = `out.${fmt.ext}`;

      setStatus('转码中');
      setProgress(0, '正在读取文件…');
      await ff.writeFile('in', new Uint8Array(await state.file.arrayBuffer()));
      if (state.cancelled) return;

      let lastPct = 0;
      const onLog = ({ message }) => {
        const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message || '');
        if (!m || !state.duration) return;
        const t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        const pct = Math.min(99, (t / state.duration) * 100);
        if (pct - lastPct >= 0.8) {
          lastPct = pct;
          setProgress(pct, `正在转码 · 已处理 ${Math.floor(t)} 秒`);
        }
      };
      ff.on('log', onLog);

      let code;
      try {
        if (fmt.id === 'gif') {
          const scale = maxH ? `scale=-2:min(ih\\,${maxH})` : 'scale=-2:480';
          await ff.exec(['-i', 'in', '-vf', `fps=12,${scale},palettegen`, 'palette.png']);
          code = await ff.exec(['-i', 'in', '-i', 'palette.png', '-lavfi', `fps=12,${scale}[x];[x][1:v]paletteuse`, '-loop', '0', outName]);
          await ff.deleteFile('palette.png').catch(() => {});
        } else {
          code = await ff.exec(buildArgs(fmt, { crf: quality.crf, maxH, audio: fmt.kind === 'audio' ? false : audioCheck.checked }));
        }
      } finally {
        ff.off('log', onLog);
      }

      if (state.cancelled) return;
      if (code !== 0) throw new Error('转换没有成功，可能是这个格式的编码器不可用，换一个格式或试试「均衡」质量。');

      setProgress(100, '正在生成文件…');
      const data = await ff.readFile(outName);
      const blob = new Blob([data], { type: fmt.mime });
      state.output = { blob, size: blob.size, name: downloadName(), url: URL.createObjectURL(blob) };
      paintOutput();
      setStatus('完成');
      toast('转换完成');
      await ff.deleteFile('in').catch(() => {});
      await ff.deleteFile(outName).catch(() => {});
    } catch (err) {
      if (state.cancelled) return;
      console.error(err);
      setStatus('失败', true);
      showError(err?.message || String(err));
    } finally {
      if (!state.cancelled) {
        setBusy(false);
        progressWrap.hidden = true;
      }
    }
  }

  /* interactions */
  const pick = () => fileInput.click();
  dz.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    pick();
  });
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  });
  const sourceBody = $('#source-body', root);
  ['dragenter', 'dragover'].forEach((ev) =>
    sourceBody.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add('over');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    sourceBody.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove('over');
    })
  );
  sourceBody.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
  });
  fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));

  root.addEventListener('click', async (e) => {
    const fmtBtn = e.target.closest('[data-fmt]');
    if (fmtBtn) {
      state.format = fmtBtn.getAttribute('data-fmt');
      paintFormat();
      return;
    }
    const q = e.target.closest('[data-quality]');
    if (q) {
      state.quality = q.getAttribute('data-quality');
      $$('[data-quality]', root).forEach((b) => b.setAttribute('aria-pressed', String(b === q)));
      return;
    }
    const act = e.target.closest('[data-act]')?.getAttribute('data-act');
    if (act === 'pick') pick();
    else if (act === 'remove') {
      state.file = null;
      state.output = null;
      paintFile();
      outputSlot.innerHTML = '';
    } else if (act === 'sample') {
      try {
        setStatus('加载示例…');
        const res = await fetch(SAMPLE_URL);
        if (!res.ok) throw new Error('示例视频加载失败');
        const blob = await res.blob();
        setFile(new File([blob], '示例视频.mp4', { type: 'video/mp4' }));
        setStatus('');
        toast('已载入示例视频');
      } catch (err) {
        setStatus('');
        showError(err.message);
      }
    }
  });

  convertBtn.addEventListener('click', convert);
  cancelBtn.addEventListener('click', () => {
    state.cancelled = true;
    engine.ffmpeg?.terminate?.();
    engine.ffmpeg = null;
    setBusy(false);
    setStatus('已取消');
    progressWrap.hidden = true;
    showError('已取消。引擎已释放，下次转换会重新加载。');
  });
  resSelect.addEventListener('change', () => {
    state.resolution = resSelect.value;
  });
  audioCheck.addEventListener('change', () => {
    state.audio = audioCheck.checked;
  });

  paintFormat();

  return () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
}
