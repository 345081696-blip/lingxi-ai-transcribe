const pickMedia = document.querySelector('#pickMedia');
const loadSources = document.querySelector('#loadSources');
const stopRecording = document.querySelector('#stopRecording');
const jobs = document.querySelector('#jobs');
const statusBox = document.querySelector('#status');
const openOutput = document.querySelector('#openOutput');
const language = document.querySelector('#language');
const model = document.querySelector('#model');
const style = document.querySelector('#style');

let mediaRecorder = null;
let outputRoot = null;
let activeRecording = null;
let activeStream = null;
let recordingStartedAt = 0;
let accumulatedPausedMs = 0;
let pauseStartedAt = 0;
let widgetTimer = null;
let pendingChunkWrites = [];
let recordingBackend = null;
let nativeRecordingFile = null;

function logStatus(text) {
  const current = statusBox.textContent.trim();
  statusBox.textContent = current ? `${current}\n${text}` : text;
  statusBox.scrollTop = statusBox.scrollHeight;
}

function jobOptions() {
  return {
    language: language.value,
    model: model.value,
    style: style.value
  };
}

function ensureJobsReady() {
  if (jobs.classList.contains('empty')) {
    jobs.classList.remove('empty');
    jobs.textContent = '';
  }
}

function createJob(filePath) {
  ensureJobsReady();
  const row = document.createElement('article');
  row.className = 'job';
  row.innerHTML = `
    <div class="job-title">
      <strong>${escapeHtml(filePath.split('/').pop())}</strong>
      <span class="badge">等待</span>
    </div>
    <pre class="job-log"></pre>
    <div class="job-actions"></div>
  `;
  jobs.prepend(row);
  return row;
}

function setJobState(row, state, text) {
  const badge = row.querySelector('.badge');
  badge.textContent = text;
  badge.className = `badge ${state}`;
}

function appendJobLog(row, text) {
  if (!text) return;
  const log = row.querySelector('.job-log');
  log.textContent = `${log.textContent}${log.textContent ? '\n' : ''}${text}`;
}

function addResultActions(row, result) {
  const actions = row.querySelector('.job-actions');
  actions.textContent = '';
  for (const [label, target] of [
    ['Markdown', result.markdown],
    ['TXT', result.txt],
    ['DOCX', result.docx],
    ['显示文件夹', result.output_dir]
  ]) {
    if (!target) continue;
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', () => {
      if (label === '显示文件夹') window.studio.showInFolder(target);
      else window.studio.openPath(target);
    });
    actions.append(button);
  }
}

async function transcribe(filePath) {
  const row = createJob(filePath);
  setJobState(row, '', '处理中');
  appendJobLog(row, '抽取音频、AI 转写并整理文档...');
  try {
    const result = await window.studio.transcribeMedia({ filePath, ...jobOptions() });
    setJobState(row, 'done', '完成');
    appendJobLog(row, result.summary || '已生成文档。');
    addResultActions(row, result);
  } catch (error) {
    setJobState(row, 'error', '失败');
    appendJobLog(row, error.message || String(error));
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

pickMedia.addEventListener('click', async () => {
  const paths = await window.studio.chooseMedia();
  for (const filePath of paths) transcribe(filePath);
});

loadSources.addEventListener('click', async () => {
  try {
    await startRecording();
  } catch (error) {
    logStatus(`录屏启动失败：${error.message || String(error)}`);
    logStatus('请在 系统设置 > 隐私与安全性 > 屏幕与系统音频录制 中允许本应用，然后重启应用再试。');
  }
});

window.studio.onNativeRecordingEvent((payload) => {
  if (payload.event === 'log' && payload.message) logStatus(payload.message);
  if (payload.event === 'started') logStatus('原生录制已开始写入文件。');
  if (payload.event === 'captureStarted') logStatus('原生屏幕捕获已启动，系统音频录制已请求。');
  if (payload.event === 'error') {
    logStatus(`原生录制错误：${payload.message || '未知错误'}`);
    finishNativeRecording(payload.filePath, payload.size, false);
  }
  if (payload.event === 'closed') {
    finishNativeRecording(payload.filePath, payload.size, true);
  }
});

function chooseMimeType() {
  const candidates = [
    'video/webm; codecs=vp9,opus',
    'video/webm; codecs=vp8,opus',
    'video/webm'
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
}

async function requestDisplayStream() {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 30,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
  } catch (firstError) {
    logStatus(`屏幕+音频录制请求失败：${firstError.message || String(firstError)}`);
    logStatus('正在降级尝试只录制屏幕。若需要抖音声音，请确认系统允许屏幕与系统音频录制。');
    return navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 30,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
  }
}

async function requestMicrophoneFallback() {
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });
    logStatus('未检测到系统音频轨，已改用麦克风兜底录音。请使用电脑外放播放抖音声音，不要戴耳机。');
    return micStream;
  } catch (error) {
    logStatus(`麦克风兜底录音也未启用：${error.message || String(error)}`);
    return null;
  }
}

async function buildRecordingStream(displayStream) {
  const tracks = [...displayStream.getVideoTracks(), ...displayStream.getAudioTracks()];
  if (displayStream.getAudioTracks().length > 0) {
    return { stream: new MediaStream(tracks), audioMode: 'system' };
  }
  const micStream = await requestMicrophoneFallback();
  if (micStream?.getAudioTracks().length) {
    return {
      stream: new MediaStream([...displayStream.getVideoTracks(), ...micStream.getAudioTracks()]),
      audioMode: 'microphone'
    };
  }
  return { stream: new MediaStream(displayStream.getVideoTracks()), audioMode: 'none' };
}

async function startRecording() {
  if (await window.studio.nativeRecorderAvailable()) {
    try {
      await startNativeRecording();
      return;
    } catch (error) {
      logStatus(`原生录制启动失败，退回兼容录制：${error.message || String(error)}`);
    }
  }
  await startElectronRecording();
}

async function startNativeRecording() {
  if (recordingBackend) return;
  recordingBackend = 'native';
  loadSources.disabled = true;
  stopRecording.disabled = false;
  recordingStartedAt = Date.now();
  accumulatedPausedMs = 0;
  pauseStartedAt = 0;
  logStatus('正在启动 macOS 原生录屏，会请求屏幕和系统音频权限。');
  try {
    const result = await window.studio.startNativeRecording();
    nativeRecordingFile = result.filePath;
    logStatus(`原生录屏文件已开始自动保存：${nativeRecordingFile}`);
    await window.studio.showRecordingWidget();
    startWidgetTimer('recording');
  } catch (error) {
    recordingBackend = null;
    nativeRecordingFile = null;
    stopRecording.disabled = true;
    loadSources.disabled = false;
    throw error;
  }
}

async function finishNativeRecording(filePath, size, shouldTranscribe) {
  if (recordingBackend !== 'native') return;
  recordingBackend = null;
  nativeRecordingFile = null;
  stopWidgetTimer();
  stopRecording.disabled = true;
  loadSources.disabled = false;
  await window.studio.hideRecordingWidget();
  if (filePath && size > 0) {
    logStatus(`录屏已保存：${filePath}`);
    if (shouldTranscribe) transcribe(filePath);
  } else {
    logStatus('原生录制结束，但没有写入有效文件。');
  }
}

async function startElectronRecording() {
  if (mediaRecorder) return;
  recordingBackend = 'electron';
  loadSources.disabled = true;
  logStatus('正在请求录屏权限，请在系统弹窗中选择抖音所在屏幕或窗口。');
  let stream;
  try {
    stream = await requestDisplayStream();
  } catch (error) {
    loadSources.disabled = false;
    throw error;
  }
  const displayStream = stream;
  const built = await buildRecordingStream(displayStream);
  stream = built.stream;

  const mimeType = chooseMimeType();
  activeRecording = await window.studio.beginRecordingFile({ extension: 'webm' });
  activeStream = stream;
  pendingChunkWrites = [];
  recordingStartedAt = Date.now();
  accumulatedPausedMs = 0;
  pauseStartedAt = 0;
  try {
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await window.studio.finishRecordingFile({ id: activeRecording.id });
    activeRecording = null;
    activeStream = null;
    loadSources.disabled = false;
    throw error;
  }
  mediaRecorder.ondataavailable = async (event) => {
    if (!event.data.size || !activeRecording) return;
    const write = (async () => {
      const buffer = await event.data.arrayBuffer();
      await window.studio.appendRecordingChunk({ id: activeRecording.id, buffer });
    })().catch((error) => {
      if (activeRecording) logStatus(`录制分片保存失败：${error.message || String(error)}`);
    });
    pendingChunkWrites.push(write);
    write.finally(() => {
      pendingChunkWrites = pendingChunkWrites.filter((item) => item !== write);
    });
  };
  mediaRecorder.onstop = async () => {
    await Promise.allSettled(pendingChunkWrites);
    const finished = activeRecording
      ? await window.studio.finishRecordingFile({ id: activeRecording.id })
      : null;
    activeRecording = null;
    pendingChunkWrites = [];
    displayStream.getTracks().forEach((track) => track.stop());
    if (activeStream) activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
    mediaRecorder = null;
    stopWidgetTimer();
    stopRecording.disabled = true;
    loadSources.disabled = false;
    await window.studio.hideRecordingWidget();
    recordingBackend = null;
    if (finished?.filePath && finished.size > 0) {
      logStatus(`录屏已保存：${finished.filePath}`);
      transcribe(finished.filePath);
    } else {
      logStatus('录制结束，但没有写入有效文件。');
    }
  };
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  });

  mediaRecorder.start(1000);
  stopRecording.disabled = false;
  const hasAudio = stream.getAudioTracks().length > 0;
  logStatus(`录屏文件已开始自动保存：${activeRecording.filePath}`);
  if (built.audioMode === 'system') logStatus('正在录制，已检测到系统音频轨。');
  if (built.audioMode === 'microphone') logStatus('正在录制，音频来自麦克风兜底。');
  if (!hasAudio) logStatus('正在录制，但没有检测到音频轨；停止后将只保存视频，不会转写。');
  await window.studio.showRecordingWidget();
  startWidgetTimer('recording');
}

stopRecording.addEventListener('click', () => {
  stopActiveRecording();
});

function elapsedSeconds() {
  const pausedMs = pauseStartedAt ? Date.now() - pauseStartedAt : 0;
  return Math.max(0, Math.floor((Date.now() - recordingStartedAt - accumulatedPausedMs - pausedMs) / 1000));
}

function startWidgetTimer(status) {
  stopWidgetTimer();
  window.studio.recordingWidgetState({ status, elapsed: elapsedSeconds() });
  widgetTimer = setInterval(() => {
    const currentStatus = recordingBackend === 'electron' && mediaRecorder?.state === 'paused' ? 'paused' : 'recording';
    window.studio.recordingWidgetState({ status: currentStatus, elapsed: elapsedSeconds() });
  }, 500);
}

function stopWidgetTimer() {
  if (widgetTimer) clearInterval(widgetTimer);
  widgetTimer = null;
}

function pauseActiveRecording() {
  if (recordingBackend === 'native') {
    logStatus('原生系统录制暂不支持暂停，请使用停止后重新开始。');
    return;
  }
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
  mediaRecorder.pause();
  pauseStartedAt = Date.now();
  logStatus('录制已暂停。');
  window.studio.recordingWidgetState({ status: 'paused', elapsed: elapsedSeconds() });
}

function resumeActiveRecording() {
  if (recordingBackend === 'native') return;
  if (!mediaRecorder || mediaRecorder.state !== 'paused') return;
  if (pauseStartedAt) accumulatedPausedMs += Date.now() - pauseStartedAt;
  pauseStartedAt = 0;
  mediaRecorder.resume();
  logStatus('录制已继续。');
  window.studio.recordingWidgetState({ status: 'recording', elapsed: elapsedSeconds() });
}

function stopActiveRecording() {
  if (recordingBackend === 'native') {
    window.studio.stopNativeRecording();
    logStatus('正在停止原生录制...');
    return;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    if (mediaRecorder.state === 'paused') resumeActiveRecording();
    mediaRecorder.requestData();
    mediaRecorder.stop();
  }
}

window.studio.onRecordingControl((command) => {
  if (command === 'pause') pauseActiveRecording();
  if (command === 'resume') resumeActiveRecording();
  if (command === 'stop') stopActiveRecording();
});

openOutput.addEventListener('click', () => {
  if (outputRoot) window.studio.openPath(outputRoot);
});

window.studio.onJobLog((payload) => {
  if (payload.message) logStatus(payload.message);
});

window.studio.appInfo().then((info) => {
  outputRoot = info.outputRoot;
  statusBox.textContent = [
    `输出目录：${info.outputRoot}`,
    `Python：${info.python}`,
    `转写脚本：${info.pythonScript}`,
    '录屏优先使用 macOS 原生系统音频录制。',
    '首次使用时，macOS 可能要求授予屏幕与系统音频录制权限。'
  ].join('\n');
});
