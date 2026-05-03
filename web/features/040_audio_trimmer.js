/* Feature #040 — Audio trimmer for single upload */
(function(){
  'use strict';

  let st = {
    fileIndex: -1,
    originalDataUrl: '',
    audioBuffer: null,
    duration: 0,
    start: 0,
    end: 0,
    drag: null,
    gapSec: 0.01
  };

  function _fmt(sec){
    sec = Math.max(0, Number(sec) || 0);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec - Math.floor(sec)) * 100);
    return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  }

  function _dataUrlToArrayBuffer(dataUrl){
    const i = String(dataUrl || '').indexOf(',');
    if (i < 0) throw new Error('Invalid data URL');
    const b64 = dataUrl.slice(i + 1);
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let j = 0; j < len; j++) bytes[j] = bin.charCodeAt(j);
    return bytes.buffer;
  }

  function _audioBufferSlice(ab, startSec, endSec){
    const sr = ab.sampleRate;
    const start = Math.max(0, Math.floor(startSec * sr));
    const end = Math.min(ab.length, Math.ceil(endSec * sr));
    const length = Math.max(1, end - start);
    const out = new AudioBuffer({
      length,
      numberOfChannels: ab.numberOfChannels,
      sampleRate: sr
    });

    for (let ch = 0; ch < ab.numberOfChannels; ch++) {
      const src = ab.getChannelData(ch);
      const dst = out.getChannelData(ch);
      dst.set(src.subarray(start, end));
    }
    return out;
  }

  function _encodeWav(audioBuffer){
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataLength = audioBuffer.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    function writeString(offset, str){
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) channels.push(audioBuffer.getChannelData(ch));

    for (let i = 0; i < audioBuffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        const s = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, s, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  function _blobToDataUrl(blob){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('Failed to read trimmed audio blob'));
      fr.readAsDataURL(blob);
    });
  }

  function _els(){
    return {
      modal: document.getElementById('audioTrimModal'),
      audio: document.getElementById('audioTrimPreview'),
      previewSel: document.getElementById('audioTrimPreviewSelection'),
      timeline: document.getElementById('audioTrimTimeline'),
      wave: document.getElementById('audioTrimWave'),
      sel: document.getElementById('audioTrimSelection'),
      startHandle: document.getElementById('audioTrimStartHandle'),
      endHandle: document.getElementById('audioTrimEndHandle'),
      startLbl: document.getElementById('audioTrimStartLabel'),
      endLbl: document.getElementById('audioTrimEndLabel'),
      durLbl: document.getElementById('audioTrimDurationLabel'),
      apply: document.getElementById('audioTrimApply'),
      cancel: document.getElementById('audioTrimCancel')
    };
  }

  function _filesRef(){
    // In this project, `files` may be a global lexical var (not always window.files).
    if (typeof files !== 'undefined' && Array.isArray(files)) return files;
    if (Array.isArray(window.files)) return window.files;
    return null;
  }

  function _secToX(sec, w){
    if (!st.duration || w <= 0) return 0;
    return Math.max(0, Math.min(w, (sec / st.duration) * w));
  }

  function _xToSec(x, w){
    if (!st.duration || w <= 0) return 0;
    const clamped = Math.max(0, Math.min(w, x));
    return (clamped / w) * st.duration;
  }

  function _drawWaveform(){
    const e = _els();
    if (!e.wave || !st.audioBuffer) return;

    const canvas = e.wave;
    const wrap = e.timeline;
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);

    if (w <= 2 || h <= 2) {
      // عند الفتح الأول أحيانًا العرض = 0 قبل اكتمال layout
      requestAnimationFrame(_drawWaveform);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // خط أساسي مستقيم لزيادة الدقة البصرية
    ctx.strokeStyle = '#adb5bd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const data = st.audioBuffer.getChannelData(0);
    const samplesPerPixel = Math.max(1, Math.floor(data.length / w));
    const mid = h / 2;
    const amp = (h * 0.42);

    ctx.strokeStyle = '#495057';
    ctx.lineWidth = 1;

    for (let x = 0; x < w; x++) {
      const start = x * samplesPerPixel;
      const end = Math.min(data.length, start + samplesPerPixel);
      let min = 1;
      let max = -1;
      for (let i = start; i < end; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const y1 = mid + min * amp;
      const y2 = mid + max * amp;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y1);
      ctx.lineTo(x + 0.5, y2);
      ctx.stroke();
    }
  }

  function _updateUi(){
    const e = _els();
    if (!e.modal) return;

    const w = Math.max(1, e.timeline.clientWidth);
    const xStart = _secToX(st.start, w);
    const xEnd = _secToX(st.end, w);

    e.startHandle.style.left = `${xStart}px`;
    e.endHandle.style.left = `${xEnd}px`;
    e.sel.style.left = `${xStart}px`;
    e.sel.style.width = `${Math.max(1, xEnd - xStart)}px`;

    e.startLbl.textContent = _fmt(st.start);
    e.endLbl.textContent = _fmt(st.end);
    e.durLbl.textContent = _fmt(Math.max(0, st.end - st.start));

    // إذا كان المستخدم يستمع أثناء السحب، أبقِ التشغيل ضمن الجزء المحدد.
    if (e.audio && !e.audio.paused) {
      if (e.audio.currentTime < st.start || e.audio.currentTime > st.end) {
        e.audio.currentTime = st.start;
      }
    }
  }

  function _setHandleByClientX(which, clientX){
    const e = _els();
    const rect = e.timeline.getBoundingClientRect();
    const rawSec = _xToSec(clientX - rect.left, rect.width);

    if (which === 'start') {
      st.start = Math.max(0, Math.min(rawSec, st.end - st.gapSec));
    } else {
      st.end = Math.min(st.duration, Math.max(rawSec, st.start + st.gapSec));
    }
    _updateUi();
  }

  function _bindTimelineInteractions(){
    const e = _els();

    function onMove(ev){
      if (!st.drag) return;
      _setHandleByClientX(st.drag, ev.clientX);
    }

    function onUp(){
      st.drag = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    function startDrag(which, ev){
      ev.preventDefault();
      st.drag = which;
      _setHandleByClientX(which, ev.clientX);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }

    e.startHandle.addEventListener('pointerdown', (ev) => startDrag('start', ev));
    e.endHandle.addEventListener('pointerdown', (ev) => startDrag('end', ev));

    // النقر على الخط يحرّك أقرب مقبض لزيادة الدقة وسرعة العمل
    e.timeline.addEventListener('pointerdown', (ev) => {
      const rect = e.timeline.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
      const xStart = _secToX(st.start, rect.width);
      const xEnd = _secToX(st.end, rect.width);
      const which = Math.abs(x - xStart) <= Math.abs(x - xEnd) ? 'start' : 'end';
      startDrag(which, ev);
    });
  }

  function _ensureModal(){
    if (document.getElementById('audioTrimModal')) return;

    const style = document.createElement('style');
    style.textContent = `
      #audioTrimModal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;z-index:1300;align-items:center;justify-content:center}
      #audioTrimModal.open{display:flex}
      #audioTrimBox{background:#fff;border-radius:14px;max-width:760px;width:min(95vw,760px);padding:14px 14px 12px;box-shadow:0 20px 60px rgba(0,0,0,.28)}
      #audioTrimBox h3{margin:0 0 10px;font-size:16px}
      #audioTrimPreview{width:100%;margin-bottom:10px}
      #audioTrimTimeline{position:relative;height:132px;border:1px solid #ced4da;border-radius:0;background:#f8f9fa;user-select:none;touch-action:none;cursor:crosshair;overflow:hidden}
      #audioTrimWave{position:absolute;inset:0;display:block}
      #audioTrimSelection{position:absolute;top:0;height:100%;background:rgba(16,163,127,.16);border-left:1px solid #10a37f;border-right:1px solid #10a37f;pointer-events:none}
      .audio-trim-handle{position:absolute;top:0;width:2px;height:100%;background:#10a37f;cursor:ew-resize;transform:translateX(-1px)}
      .audio-trim-info{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;font-size:13px;color:#2b2b2b}
      .audio-trim-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
      .audio-trim-btn{border:none;border-radius:9px;padding:8px 12px;cursor:pointer}
      .audio-trim-btn.preview{background:#0d6efd;color:#fff}
      .audio-trim-btn.apply{background:#10a37f;color:#fff}
      .audio-trim-btn.cancel{background:#e9ecef;color:#222}
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'audioTrimModal';
    const _t = (key, fallback) => (typeof window.t === 'function' ? window.t(key, fallback) : fallback);
    modal.innerHTML = `
      <div id="audioTrimBox">
        <h3>${_t('audio_trim.title', 'قص الصوت')}</h3>
        <audio id="audioTrimPreview" controls></audio>

        <div id="audioTrimTimeline">
          <canvas id="audioTrimWave"></canvas>
          <div id="audioTrimSelection"></div>
          <div id="audioTrimStartHandle" class="audio-trim-handle"></div>
          <div id="audioTrimEndHandle" class="audio-trim-handle"></div>
        </div>

        <div class="audio-trim-info">
          <div>${_t('audio_trim.start', 'البداية:')} <b id="audioTrimStartLabel">0:00.00</b></div>
          <div>${_t('audio_trim.end', 'النهاية:')} <b id="audioTrimEndLabel">0:00.00</b></div>
          <div>${_t('audio_trim.duration', 'المدة المحددة:')} <b id="audioTrimDurationLabel">0:00.00</b></div>
        </div>

        <div class="audio-trim-actions">
          <button id="audioTrimPreviewSelection" class="audio-trim-btn preview">${_t('audio_trim.preview', 'معاينة المحدد')}</button>
          <button id="audioTrimCancel" class="audio-trim-btn cancel">${_t('audio_trim.cancel', 'بدون قص')}</button>
          <button id="audioTrimApply" class="audio-trim-btn apply">${_t('audio_trim.apply', 'قص')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const e = _els();

    _bindTimelineInteractions();

    window.addEventListener('resize', () => {
      if (!e.modal.classList.contains('open')) return;
      _drawWaveform();
      _updateUi();
    });

    function _boundPlayback(){
      if (!e.audio) return;
      if (e.audio.currentTime < st.start) {
        e.audio.currentTime = st.start;
        return;
      }
      if (e.audio.currentTime >= st.end) {
        e.audio.pause();
        e.audio.currentTime = st.start;
      }
    }

    e.audio.addEventListener('play', () => {
      if (e.audio.currentTime < st.start || e.audio.currentTime >= st.end) {
        e.audio.currentTime = st.start;
      }
    });
    e.audio.addEventListener('timeupdate', _boundPlayback);
    e.audio.addEventListener('seeking', _boundPlayback);

    e.previewSel.onclick = async () => {
      try {
        e.audio.pause();
        e.audio.currentTime = st.start;
        await e.audio.play();
      } catch (_){ }
    };

    e.cancel.onclick = () => {
      if (e.audio) e.audio.pause();
      e.modal.classList.remove('open');
    };

    e.apply.onclick = async () => {
      try {
        const fRef = _filesRef();
        if (!fRef || st.fileIndex < 0 || !fRef[st.fileIndex] || !st.audioBuffer) {
          e.modal.classList.remove('open');
          return;
        }

        const sliced = _audioBufferSlice(st.audioBuffer, st.start, st.end);
        const blob = _encodeWav(sliced);
        const outData = await _blobToDataUrl(blob);

        const old = fRef[st.fileIndex] || {};
        const oldName = String(old.name || 'audio');
        const dot = oldName.lastIndexOf('.');
        const base = dot > 0 ? oldName.slice(0, dot) : oldName;

        fRef[st.fileIndex] = {
          ...old,
          type: 'audio',
          name: `${base}_trim.wav`,
          size: blob.size,
          data: outData
        };

        if (typeof window.renderFilePreviews === 'function') window.renderFilePreviews();
        if (typeof window.updateSend === 'function') window.updateSend();
      } catch (err) {
        console.error('[audio-trimmer] apply failed', err);
        alert('تعذر قص الصوت.');
      } finally {
        if (e.audio) e.audio.pause();
        e.modal.classList.remove('open');
      }
    };
  }

  async function openAudioTrimmer(dataUrl, fileIndex){
    _ensureModal();
    const e = _els();
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const ab = await ctx.decodeAudioData(_dataUrlToArrayBuffer(dataUrl));

      st.fileIndex = Number(fileIndex);
      st.originalDataUrl = dataUrl;
      st.audioBuffer = ab;
      st.duration = ab.duration || 0;
      st.start = 0;
      st.end = st.duration;

      e.audio.src = dataUrl;
      e.modal.classList.add('open');

      // ارسم بعد فتح المودال فعليًا لضمان أبعاد صحيحة للـ canvas
      requestAnimationFrame(() => {
        _drawWaveform();
        _updateUi();
      });
    } catch (err) {
      console.error('[audio-trimmer] decode failed', err);
      alert('تعذر فتح أداة قص الصوت لهذا الملف.');
    }
  }

  window.openAudioTrimmer = openAudioTrimmer;
})();
