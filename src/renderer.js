const pickMedia = document.querySelector('#pickMedia');
const rewriteMedia = document.querySelector('#rewriteMedia');
const loadSources = document.querySelector('#loadSources');
const pauseRecording = document.querySelector('#pauseRecording');
const adjustRecordingFrame = document.querySelector('#adjustRecordingFrame');
const resumeRecording = document.querySelector('#resumeRecording');
const stopRecording = document.querySelector('#stopRecording');
const showHelp = document.querySelector('#showHelp');
const showStatusLog = document.querySelector('#showStatusLog');
const helpDialog = document.querySelector('#helpDialog');
const closeHelp = document.querySelector('#closeHelp');
const jobs = document.querySelector('#jobs');
const statusBox = document.querySelector('#status');
const openOutput = document.querySelector('#openOutput');
const version = document.querySelector('#version');
const language = document.querySelector('#language');
const model = document.querySelector('#model');
const style = document.querySelector('#style');
const subtitleMode = document.querySelector('#subtitleMode');
const dedupeMode = document.querySelector('#dedupeMode');
const audioMode = document.querySelector('#audioMode');
const captureMode = document.querySelector('#captureMode');
const recordingDuration = document.querySelector('#recordingDuration');
const customDurationMinutes = document.querySelector('#customDurationMinutes');
const durationCalculator = document.querySelector('#durationCalculator');
const sourceVideoDuration = document.querySelector('#sourceVideoDuration');
const playbackSpeed = document.querySelector('#playbackSpeed');
const durationHint = document.querySelector('#durationHint');
const organizer = document.querySelector('#organizer');
const localAiBaseUrl = document.querySelector('#localAiBaseUrl');
const localAiModel = document.querySelector('#localAiModel');
const localAiBaseUrlPresets = document.querySelector('#localAiBaseUrlPresets');
const localAiModelPresets = document.querySelector('#localAiModelPresets');
const openclawModel = document.querySelector('#openclawModel');
const openclawCommand = document.querySelector('#openclawCommand');
const chooseOpenClawCommand = document.querySelector('#chooseOpenClawCommand');
const checkOpenClaw = document.querySelector('#checkOpenClaw');
const testOpenClaw = document.querySelector('#testOpenClaw');
const copyDiagnostics = document.querySelector('#copyDiagnostics');
const openclawStatus = document.querySelector('#openclawStatus');
const checkLocalAi = document.querySelector('#checkLocalAi');
const testLocalAi = document.querySelector('#testLocalAi');
const copyLocalAiDiagnostics = document.querySelector('#copyLocalAiDiagnostics');
const localAiStatus = document.querySelector('#localAiStatus');
const autoTranscribe = document.querySelector('#autoTranscribe');
const promptForNames = document.querySelector('#promptForNames');
const rewriteMode = document.querySelector('#rewriteMode');
const nameDialog = document.querySelector('#nameDialog');
const nameDialogTitle = document.querySelector('#nameDialogTitle');
const nameDialogText = document.querySelector('#nameDialogText');
const nameDialogInput = document.querySelector('#nameDialogInput');
const nameCancel = document.querySelector('#nameCancel');
const nameConfirm = document.querySelector('#nameConfirm');
const statusLogDialog = document.querySelector('#statusLogDialog');
const statusLogContent = document.querySelector('#statusLogContent');
const closeStatusLog = document.querySelector('#closeStatusLog');
const copyStatusLog = document.querySelector('#copyStatusLog');
const clearStatusLog = document.querySelector('#clearStatusLog');
const organizerWarningDialog = document.querySelector('#organizerWarningDialog');
const organizerWarningText = document.querySelector('#organizerWarningText');
const closeOrganizerWarning = document.querySelector('#closeOrganizerWarning');
const retryOrganizerWarning = document.querySelector('#retryOrganizerWarning');
const keepOrganizerWarning = document.querySelector('#keepOrganizerWarning');

const STATUS_LOG_KEY = 'lingchuang-status-log-v1';
const LOCAL_AI_PRESETS_KEY = 'lingchuang-local-ai-presets-v1';

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
let currentAudioLabel = '';
let currentCapture = null;
let displayInfo = [];
let framePrepared = false;
let nativePaused = false;
let nativeStopIntent = 'stop';
let nativeSegments = [];
let nativeAudioMode = 'system';
let lastOpenClawInfo = null;
let lastLocalAiInfo = null;
let recordingLimitSeconds = 0;
let autoStopTimer = null;
let autoStopTriggered = false;
let adjustingPausedFrame = false;
let namePromptQueue = Promise.resolve();

function logStatus(text) {
  const current = statusBox.textContent.trim();
  statusBox.textContent = current ? `${current}\n${text}` : text;
  statusBox.scrollTop = statusBox.scrollHeight;
  persistStatusLog(text);
}

function persistStatusLog(text) {
  const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${text}`;
  const previous = loadStatusLog().split('\n').filter(Boolean);
  previous.push(line);
  const trimmed = previous.slice(-2000).join('\n');
  localStorage.setItem(STATUS_LOG_KEY, trimmed);
}

function loadStatusLog() {
  return localStorage.getItem(STATUS_LOG_KEY) || '';
}

function renderStatusLogDialog() {
  statusLogContent.textContent = loadStatusLog() || '暂无历史日志。';
  statusLogDialog.showModal();
}

function jobOptions(extra = {}) {
  return {
    language: language.value,
    model: model.value,
    style: style.value,
    subtitleMode: subtitleMode.value,
    dedupeMode: dedupeMode.value,
    organizer: organizer.value,
    openclawModel: openclawModel.value.trim(),
    openclawCommand: openclawCommand.value.trim(),
    localAiBaseUrl: localAiBaseUrl.value.trim(),
    localAiModel: localAiModel.value.trim(),
    ...extra
  };
}

function updateOrganizerFields() {
  const openclawEnabled = organizer.value === 'openclaw';
  const localAiEnabled = organizer.value === 'localai';
  openclawModel.disabled = !openclawEnabled;
  openclawCommand.disabled = !openclawEnabled;
  chooseOpenClawCommand.disabled = !openclawEnabled;
  document.querySelectorAll('.openclaw-field').forEach((item) => item.classList.toggle('disabled', !openclawEnabled));
  checkOpenClaw.disabled = !openclawEnabled;
  testOpenClaw.disabled = !openclawEnabled;
  copyDiagnostics.disabled = !openclawEnabled;

  localAiBaseUrl.disabled = !localAiEnabled;
  localAiModel.disabled = !localAiEnabled;
  document.querySelectorAll('.localai-field').forEach((item) => item.classList.toggle('disabled', !localAiEnabled));
  checkLocalAi.disabled = !localAiEnabled;
  testLocalAi.disabled = !localAiEnabled;
  copyLocalAiDiagnostics.disabled = !localAiEnabled;
}

function renderOpenClawStatus(info) {
  lastOpenClawInfo = info;
  const box = checkOpenClaw.closest('.openclaw-status');
  box?.classList.toggle('ready', Boolean(info.available));
  box?.classList.toggle('error', !info.available);
  const localModel = info.localModels?.[0]?.id || '';
  const offlineAgent = (info.agents || []).find((agent) => agent.name === '小离') || null;
  const modelHint = localModel
    ? `本地模型：${localModel}`
    : (offlineAgent?.model ? `小离模型：${offlineAgent.model}` : '');
  openclawStatus.textContent = info.available
    ? `${info.version || 'OpenClaw'} 已连接；默认：${info.defaultModel || 'OpenClaw 默认'}${modelHint ? `；${modelHint}` : ''}`
    : (info.message || 'OpenClaw 不可用，将使用本机规则整理。');
}

function renderLocalAiStatus(info) {
  lastLocalAiInfo = info;
  const box = checkLocalAi.closest('.openclaw-status');
  box?.classList.toggle('ready', Boolean(info.available));
  box?.classList.toggle('error', !info.available);
  const modelHint = info.selectedModel || info.models?.[0]?.id || '';
  localAiStatus.textContent = info.available
    ? `本地模型服务已连接：${info.baseUrl}${modelHint ? `；模型：${modelHint}` : ''}`
    : (info.message || '本地大模型不可用，将使用本机规则整理。');
  if (!localAiBaseUrl.value.trim() && info.baseUrl) localAiBaseUrl.value = info.baseUrl;
  if (!localAiModel.value.trim() && modelHint) localAiModel.value = modelHint;
}

function openClawOptions() {
  return {
    command: openclawCommand.value.trim(),
    model: openclawModel.value.trim()
  };
}

function localAiOptions() {
  return {
    baseUrl: localAiBaseUrl.value.trim(),
    model: localAiModel.value.trim()
  };
}

function loadLocalAiPresets() {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_AI_PRESETS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveLocalAiPreset(baseUrl, model) {
  const normalizedBaseUrl = String(baseUrl || '').trim();
  const normalizedModel = String(model || '').trim();
  if (!normalizedBaseUrl && !normalizedModel) return;
  const presets = loadLocalAiPresets().filter((item) => (
    item.baseUrl !== normalizedBaseUrl || item.model !== normalizedModel
  ));
  presets.unshift({ baseUrl: normalizedBaseUrl, model: normalizedModel, updatedAt: Date.now() });
  localStorage.setItem(LOCAL_AI_PRESETS_KEY, JSON.stringify(presets.slice(0, 20)));
  renderLocalAiPresets();
}

function renderLocalAiPresets() {
  const presets = loadLocalAiPresets();
  const baseUrls = [...new Set(presets.map((item) => item.baseUrl).filter(Boolean))];
  const models = [...new Set(presets.map((item) => item.model).filter(Boolean))];
  localAiBaseUrlPresets.innerHTML = baseUrls.map((item) => `<option value="${escapeHtml(item)}"></option>`).join('');
  localAiModelPresets.innerHTML = models.map((item) => `<option value="${escapeHtml(item)}"></option>`).join('');
  if (!localAiBaseUrl.value.trim() && baseUrls[0]) localAiBaseUrl.value = baseUrls[0];
  if (!localAiModel.value.trim() && models[0]) localAiModel.value = models[0];
}

function rememberCurrentLocalAiPreset() {
  if (organizer.value !== 'localai') return;
  saveLocalAiPreset(localAiBaseUrl.value.trim() || 'http://127.0.0.1:11434', localAiModel.value.trim());
}

function buildDiagnosticsText() {
  const info = lastOpenClawInfo || {};
  return [
    `零创AI 智能转写器：${version.textContent || ''}`,
    `智能整理：${organizer.value}`,
    `OpenClaw 命令输入：${openclawCommand.value.trim() || '自动检测'}`,
    `OpenClaw 命令实际：${info.command || '未检测'}`,
    `OpenClaw 版本：${info.version || '未检测'}`,
    `Node：${info.nodeVersion || '未检测'}`,
    `Ollama：${info.ollamaVersion || '未检测'}`,
    `配置有效：${info.configValid ? '是' : '否'}`,
    `配置文件：${info.configPath || '未检测'}`,
    `默认模型：${info.defaultModel || '未检测'}`,
    `本地模型：${(info.localModels || []).map((item) => item.id).join(', ') || '未检测'}`,
    `当前填写模型：${openclawModel.value.trim() || '留空'}`,
    `状态：${info.message || openclawStatus.textContent || '未检测'}`
  ].join('\n');
}

function buildLocalAiDiagnosticsText() {
  const info = lastLocalAiInfo || {};
  return [
    `零创AI 智能转写器：${version.textContent || ''}`,
    `智能整理：${organizer.value}`,
    `本地模型地址：${localAiBaseUrl.value.trim() || info.baseUrl || '默认 http://127.0.0.1:11434'}`,
    `本地模型名称：${localAiModel.value.trim() || info.selectedModel || '未填写'}`,
    `检测到的模型：${(info.models || []).map((item) => item.id).join(', ') || '未检测'}`,
    `状态：${info.message || localAiStatus.textContent || '未检测'}`
  ].join('\n');
}

async function checkOpenClawStatus() {
  checkOpenClaw.disabled = true;
  openclawStatus.textContent = '检测中...';
  try {
    const info = await window.studio.checkOpenClaw(openClawOptions());
    renderOpenClawStatus(info);
    if (info.available) {
      logStatus(`OpenClaw 已连接：${info.command}`);
      if (info.defaultModel) logStatus(`OpenClaw 默认模型：${info.defaultModel}`);
      const localModel = info.localModels?.[0]?.id;
      if (localModel) logStatus(`可手动指定本地模型：${localModel}`);
    } else {
      logStatus(info.message || 'OpenClaw 不可用；增强整理会自动回退本机规则整理。');
    }
  } catch (error) {
    renderOpenClawStatus({ available: false, message: error.message || String(error) });
    logStatus(`OpenClaw 检测失败：${error.message || String(error)}`);
  } finally {
    checkOpenClaw.disabled = organizer.value !== 'openclaw';
  }
}

async function checkLocalAiStatus() {
  checkLocalAi.disabled = true;
  localAiStatus.textContent = '检测中...';
  try {
    const info = await window.studio.checkLocalAi(localAiOptions());
    renderLocalAiStatus(info);
    if (info.available) {
      logStatus(`本地大模型服务已连接：${info.baseUrl}`);
      if (info.selectedModel) logStatus(`当前本地模型：${info.selectedModel}`);
      saveLocalAiPreset(info.baseUrl || localAiBaseUrl.value.trim(), info.selectedModel || localAiModel.value.trim());
    } else {
      logStatus(info.message || '本地大模型不可用；增强整理会自动回退本机规则整理。');
    }
  } catch (error) {
    renderLocalAiStatus({ available: false, message: error.message || String(error) });
    logStatus(`本地大模型检测失败：${error.message || String(error)}`);
  } finally {
    checkLocalAi.disabled = organizer.value !== 'localai';
  }
}

async function testOpenClawStatus() {
  testOpenClaw.disabled = true;
  openclawStatus.textContent = '正在测试模型...';
  try {
    const result = await window.studio.testOpenClaw(openClawOptions());
    logStatus(`OpenClaw 模型测试成功：${result.model || '默认模型'}`);
    openclawStatus.textContent = `模型测试成功：${result.model || 'OpenClaw 默认模型'}`;
    checkOpenClaw.closest('.openclaw-status')?.classList.add('ready');
    checkOpenClaw.closest('.openclaw-status')?.classList.remove('error');
  } catch (error) {
    openclawStatus.textContent = `模型测试失败：${error.message || String(error)}`;
    checkOpenClaw.closest('.openclaw-status')?.classList.add('error');
    checkOpenClaw.closest('.openclaw-status')?.classList.remove('ready');
    logStatus(`OpenClaw 模型测试失败：${error.message || String(error)}`);
  } finally {
    testOpenClaw.disabled = organizer.value !== 'openclaw';
  }
}

async function testLocalAiStatus() {
  testLocalAi.disabled = true;
  localAiStatus.textContent = '正在测试模型...';
  try {
    const result = await window.studio.testLocalAi(localAiOptions());
    logStatus(`本地大模型测试成功：${result.model}`);
    localAiStatus.textContent = `模型测试成功：${result.model}`;
    saveLocalAiPreset(result.baseUrl || localAiBaseUrl.value.trim(), result.model || localAiModel.value.trim());
    checkLocalAi.closest('.openclaw-status')?.classList.add('ready');
    checkLocalAi.closest('.openclaw-status')?.classList.remove('error');
  } catch (error) {
    localAiStatus.textContent = `模型测试失败：${error.message || String(error)}`;
    checkLocalAi.closest('.openclaw-status')?.classList.add('error');
    checkLocalAi.closest('.openclaw-status')?.classList.remove('ready');
    logStatus(`本地大模型测试失败：${error.message || String(error)}`);
  } finally {
    testLocalAi.disabled = organizer.value !== 'localai';
  }
}

function createJobId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileName(filePath) {
  return filePath.split('/').pop();
}

function audioModeLabel(mode) {
  if (mode === 'microphone') return '外部声音';
  if (mode === 'none') return '无声音';
  return '系统声音';
}

function selectedRecordingLimitSeconds() {
  if (recordingDuration.value === 'custom') {
    return parseVideoDurationSeconds(customDurationMinutes.value);
  }
  if (recordingDuration.value === 'calculated') {
    const sourceSeconds = parseVideoDurationSeconds(sourceVideoDuration.value);
    const speed = Number(playbackSpeed.value || 1);
    if (!sourceSeconds || !Number.isFinite(speed) || speed <= 0) return 0;
    return Math.ceil(sourceSeconds / speed) + 5;
  }
  return Number(recordingDuration.value || 0);
}

function parseVideoDurationSeconds(value) {
  const raw = String(value || '').trim().replace(/：/g, ':');
  if (!raw) return 0;
  if (raw.includes(':')) {
    const parts = raw.split(':').map((part) => Number(part.trim()));
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
    if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
    if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
    return 0;
  }
  const minutes = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;
}

function validateRecordingLimitBeforeStart() {
  if (recordingDuration.value === 'custom') {
    const customSeconds = selectedRecordingLimitSeconds();
    if (customSeconds > 0) return true;
    logStatus('自定义录制时长需要输入有效时间，例如 00:30:00、30:00、90。');
    customDurationMinutes.focus();
    return false;
  }
  if (recordingDuration.value !== 'calculated') return true;
  const sourceSeconds = parseVideoDurationSeconds(sourceVideoDuration.value);
  const limit = selectedRecordingLimitSeconds();
  if (sourceSeconds > 0 && limit > 0) return true;
  logStatus('自动计算录制时长需要先输入有效视频时长，例如 7:05、7：05、90。');
  sourceVideoDuration.focus();
  return false;
}

function recordingRemainingSeconds() {
  if (!recordingLimitSeconds) return 0;
  return Math.max(0, recordingLimitSeconds - elapsedSeconds());
}

function recordingLimitLabel(seconds) {
  if (!seconds) return '不限时';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainSeconds = seconds % 60;
  if (hours && minutes) return `${hours} 小时 ${minutes} 分钟`;
  if (hours) return `${hours} 小时`;
  if (minutes && remainSeconds) return `${minutes} 分 ${remainSeconds} 秒`;
  if (minutes) return `${minutes} 分钟`;
  return `${Math.max(1, remainSeconds)} 秒`;
}

function updateDurationCalculator() {
  const calculated = recordingDuration.value === 'calculated';
  durationCalculator.hidden = !calculated;
  sourceVideoDuration.disabled = !calculated || Boolean(recordingBackend);
  playbackSpeed.disabled = !calculated || Boolean(recordingBackend);
  if (recordingDuration.value === 'custom') {
    const customSeconds = selectedRecordingLimitSeconds();
    if (customSeconds) customDurationMinutes.title = `将录制 ${recordingLimitLabel(customSeconds)}`;
  }
  if (!calculated) return;
  const sourceSeconds = parseVideoDurationSeconds(sourceVideoDuration.value);
  const speed = Number(playbackSpeed.value || 1);
  const limit = selectedRecordingLimitSeconds();
  durationHint.textContent = sourceSeconds
    ? `视频原时长 ${recordingLimitLabel(sourceSeconds)}，${speed} 倍播放，自动录制 ${recordingLimitLabel(limit)}。`
    : '输入视频时长后自动计算录制时长，支持 90、01:30、01:30:00、中文冒号。';
}

function startButtonText() {
  if (recordingBackend) return '正在录制';
  if (framePrepared) return '开始录制';
  return captureMode.value === 'region' ? '选择录屏范围' : '开始录制';
}

function updateRecordingButtons() {
  const isRecording = Boolean(recordingBackend);
  const isPaused = (recordingBackend === 'electron' && mediaRecorder?.state === 'paused')
    || (recordingBackend === 'native' && nativePaused);
  loadSources.disabled = isRecording || isPaused;
  loadSources.textContent = startButtonText();
  stopRecording.disabled = !isRecording;
  stopRecording.textContent = '停止录制';
  pauseRecording.disabled = !isRecording || isPaused;
  adjustRecordingFrame.disabled = !isPaused;
  resumeRecording.disabled = !isPaused;
  pauseRecording.hidden = isPaused;
  adjustRecordingFrame.hidden = !isPaused || captureMode.value !== 'region';
  resumeRecording.hidden = !isPaused;
  recordingDuration.disabled = isRecording;
  customDurationMinutes.disabled = isRecording || recordingDuration.value !== 'custom';
  updateDurationCalculator();
}

function updateReadyRecordingWidget() {
  if (!framePrepared || recordingBackend) return;
  window.studio.recordingWidgetState({
    status: 'ready',
    elapsed: 0,
    remaining: selectedRecordingLimitSeconds(),
    audioLabel: currentAudioLabel || audioModeLabel(audioMode.value),
    canPause: false
  });
}

function intersectArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function resetCaptureFrameState() {
  framePrepared = false;
  loadSources.textContent = startButtonText();
  stopRecording.textContent = '停止录制';
}

async function prepareCaptureFrame() {
  if (captureMode.value !== 'region' && !framePrepared) {
    await window.studio.recordingFrameCommand('passthrough');
    return { mode: 'screen' };
  }
  const frame = await window.studio.getRecordingFrame();
  return frameToCapture(frame);
}

function frameToCapture(frame) {
  if (!frame) return { mode: 'screen' };
  const windowBounds = frame.windowBounds || null;
  const frameBounds = {
    x: windowBounds ? windowBounds.x : frame.bounds.x,
    y: windowBounds ? windowBounds.y : frame.bounds.y,
    width: windowBounds ? windowBounds.width : frame.bounds.width,
    height: windowBounds ? windowBounds.height : frame.bounds.height
  };
  const displays = screenDetails();
  const display = displays
    .map((item) => ({ item, area: intersectArea(frameBounds, item.bounds) }))
    .sort((a, b) => b.area - a.area)[0]?.item;
  if (!display) return { mode: 'screen' };
  if (frame.mode === 'screen') {
    return {
      mode: 'screen',
      screen: { x: display.bounds.x, y: display.bounds.y }
    };
  }
  const x = Math.max(0, frameBounds.x - display.bounds.x);
  const y = Math.max(0, frameBounds.y - display.bounds.y);
  const width = Math.min(frameBounds.width, display.bounds.width - x);
  const height = Math.min(frameBounds.height, display.bounds.height - y);
  return {
    mode: 'region',
    screen: { x: display.bounds.x, y: display.bounds.y },
    region: { x, y, width, height }
  };
}

function screenDetails() {
  if (displayInfo.length) return displayInfo;
  return [{ bounds: { x: 0, y: 0, width: window.screen.width, height: window.screen.height } }];
}

function ensureJobsReady() {
  if (jobs.classList.contains('empty')) {
    jobs.classList.remove('empty');
    jobs.textContent = '';
  }
}

function defaultNameFromPath(filePath) {
  return fileName(filePath).replace(/\.[^.]+$/, '');
}

async function askName({ title, message, defaultName }) {
  if (!promptForNames.checked) return '';
  const run = () => showNamePrompt({ title, message, defaultName });
  const queued = namePromptQueue.then(run, run);
  namePromptQueue = queued.catch(() => {});
  return queued;
}

async function showNamePrompt({ title, message, defaultName }) {
  await window.studio.restoreMainWindow();
  nameDialogTitle.textContent = title;
  nameDialogText.textContent = message;
  nameDialogInput.value = defaultName || '';
  return new Promise((resolve) => {
    const handleClose = () => {
      nameDialog.removeEventListener('close', handleClose);
      resolve(nameDialog.returnValue === 'confirm' ? nameDialogInput.value.trim() : '');
    };
    nameDialog.addEventListener('close', handleClose);
    nameDialog.showModal();
    nameDialogInput.focus();
    nameDialogInput.select();
  });
}

async function showOrganizerWarning(result, row) {
  const report = result?.processing_report || {};
  const organizerUsed = result?.organizer || report.organizer_actual || '';
  const failure = report.failure_reason || '';
  if (!String(organizerUsed).includes('fallback') && !failure) return;
  const run = () => showOrganizerWarningDialog(result, row, organizerUsed, failure);
  const queued = namePromptQueue.then(run, run);
  namePromptQueue = queued.catch(() => {});
  return queued;
}

async function showOrganizerWarningDialog(result, row, organizerUsed, failure) {
  await window.studio.restoreMainWindow();
  organizerWarningText.textContent = [
    `本次智能整理实际使用：${organizerUsed || '本机规则整理'}`,
    failure ? `原因：${failure}` : '',
    '建议：确认本地模型服务正在运行、模型名称填写正确；内容很长时可改用更快模型。可以保留当前本机整理结果，也可以继续请求本地模型重新转写。'
  ].filter(Boolean).join('\n');
  retryOrganizerWarning.hidden = !(result?.processing_report?.organizer_requested === 'localai');
  organizerWarningDialog.showModal();
  return new Promise((resolve) => {
    const handleClose = () => {
      organizerWarningDialog.removeEventListener('close', handleClose);
      const action = organizerWarningDialog.returnValue || 'keep';
      if (action === 'retry' && row?.dataset?.filePath) {
        appendJobLog(row, '用户选择继续请求本地模型，已创建一条新的重新转写任务。');
        queueTranscription(row.dataset.filePath, true, { outputMode: 'keep' });
      }
      resolve(action);
    };
    organizerWarningDialog.addEventListener('close', handleClose);
  });
}

async function renameWithPrompt(filePath, prompt) {
  const name = await askName({ ...prompt, defaultName: defaultNameFromPath(filePath) });
  if (!name) return filePath;
  try {
    const result = await window.studio.renamePath({ path: filePath, name });
    if (result.path && result.path !== filePath) {
      logStatus(`${prompt.doneLabel || '已重命名'}：${result.path}`);
    }
    return result.path || filePath;
  } catch (error) {
    logStatus(`命名失败，已保留默认名称：${error.message || String(error)}`);
    return filePath;
  }
}

async function promptForRecordingName(filePath) {
  return renameWithPrompt(filePath, {
    title: '录制完成',
    message: '可以为刚保存的录制文件命名。取消或留空将保留默认名称。',
    doneLabel: '录制文件已重命名'
  });
}

async function promptForOutputFolderName(outputDir) {
  return renameWithPrompt(outputDir, {
    title: '转写完成',
    message: '可以为本次转写结果文件夹命名。取消或留空将保留默认名称。',
    doneLabel: '转写文件夹已重命名'
  });
}

function createJob(filePath, options = {}) {
  ensureJobsReady();
  const jobId = createJobId();
  const row = document.createElement('article');
  row.className = 'job';
  row.dataset.jobId = jobId;
  row.dataset.filePath = filePath;
  row.dataset.outputMode = options.outputMode || 'keep';
  row.innerHTML = `
    <div class="job-title">
      <strong>${escapeHtml(fileName(filePath))}</strong>
      <span class="badge">等待</span>
    </div>
    <div class="job-progress">
      <div class="progress-head">
        <span class="progress-label">等待开始</span>
        <span class="progress-percent">0%</span>
      </div>
      <div class="progress-track">
        <span class="progress-fill"></span>
      </div>
      <span class="progress-time"></span>
    </div>
    <pre class="job-log"></pre>
    <div class="job-actions">
      <button class="start-transcribe">开始转录</button>
      <button class="stop-transcribe danger" hidden>停止转录</button>
      <button class="delete-job danger">删除任务</button>
    </div>
  `;
  row.querySelector('.start-transcribe').addEventListener('click', () => runTranscription(row));
  row.querySelector('.stop-transcribe').addEventListener('click', () => stopTranscription(row));
  row.querySelector('.delete-job').addEventListener('click', () => deleteJob(row));
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

function updateJobsEmptyState() {
  if (jobs.querySelector('.job')) return;
  jobs.classList.add('empty');
  jobs.textContent = '暂无任务';
}

function deleteJob(row) {
  if (row.dataset.running === 'true') {
    appendJobLog(row, '任务正在转写中，请先停止转录再删除任务。');
    return;
  }
  row.remove();
  updateJobsEmptyState();
}

function formatClock(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  if (h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateJobProgress(row, progress = {}) {
  if (!row) return;
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
  const label = row.querySelector('.progress-label');
  const value = row.querySelector('.progress-percent');
  const fill = row.querySelector('.progress-fill');
  const time = row.querySelector('.progress-time');
  if (label) label.textContent = progress.message || progress.stage || '处理中';
  if (value) value.textContent = `${Math.round(percent)}%`;
  if (fill) fill.style.width = `${percent}%`;
  if (time) {
    time.textContent = progress.total
      ? `转录时间进度：${formatClock(progress.current)} / ${formatClock(progress.total)}`
      : '';
  }
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

function updateResultPathsAfterRename(result, renamedOutputDir) {
  if (!renamedOutputDir || renamedOutputDir === result.output_dir) return result;
  const replaceDir = (target) => target ? target.replace(result.output_dir, renamedOutputDir) : target;
  return {
    ...result,
    output_dir: renamedOutputDir,
    markdown: replaceDir(result.markdown),
    txt: replaceDir(result.txt),
    docx: replaceDir(result.docx),
    segments: replaceDir(result.segments)
  };
}

async function runTranscription(row) {
  const filePath = row.dataset.filePath;
  const jobId = row.dataset.jobId;
  const startButton = row.querySelector('.start-transcribe');
  const stopButton = row.querySelector('.stop-transcribe');
  row.dataset.running = 'true';
  setJobState(row, '', '处理中');
  updateJobProgress(row, { percent: 2, message: '准备处理...' });
  appendJobLog(row, '抽取音频、AI 转写并整理文档...');
  if (startButton) startButton.hidden = true;
  if (stopButton) stopButton.hidden = false;
  rememberCurrentLocalAiPreset();
  try {
    const result = await window.studio.transcribeMedia({
      filePath,
      jobId,
      ...jobOptions({
        outputMode: row.dataset.outputMode
      })
    });
    const renamedOutputDir = await promptForOutputFolderName(result.output_dir);
    const finalResult = updateResultPathsAfterRename(result, renamedOutputDir);
    setJobState(row, 'done', '完成');
    updateJobProgress(row, { percent: 100, message: '转写完成。' });
    appendJobLog(row, finalResult.summary || '已生成文档。');
    if (finalResult.processing_report?.organizer_actual) {
      appendJobLog(row, `智能整理实际使用：${finalResult.processing_report.organizer_actual}`);
    }
    if (finalResult.processing_report?.failure_reason) {
      appendJobLog(row, `智能整理失败原因：${finalResult.processing_report.failure_reason}`);
    }
    addResultActions(row, finalResult);
    await showOrganizerWarning(finalResult, row);
  } catch (error) {
    const message = error.message || String(error);
    if (message.includes('转录已停止')) {
      setJobState(row, '', '已停止');
      updateJobProgress(row, { percent: 0, message: '转录已停止。' });
      appendJobLog(row, '转录已停止，录屏文件仍已保存。');
      if (startButton) startButton.hidden = false;
    } else {
      setJobState(row, 'error', '失败');
      updateJobProgress(row, { percent: 0, message: '转写失败。' });
      appendJobLog(row, message);
      if (startButton) startButton.hidden = false;
    }
    if (stopButton) stopButton.hidden = true;
  } finally {
    row.dataset.running = 'false';
  }
}

async function stopTranscription(row) {
  row.querySelector('.stop-transcribe').disabled = true;
  await window.studio.stopTranscription(row.dataset.jobId);
  appendJobLog(row, '正在停止转录...');
}

function queueTranscription(filePath, shouldStart = true, options = {}) {
  const row = createJob(filePath, options);
  if (shouldStart) runTranscription(row);
  else {
    setJobState(row, '', '待转录');
    appendJobLog(row, '录制文件已保存。需要时可点击“开始转录”。');
  }
  return row;
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
  for (const filePath of paths) queueTranscription(filePath, false);
});

rewriteMedia.addEventListener('click', async () => {
  const paths = await window.studio.chooseRecordingMedia();
  for (const filePath of paths) {
    queueTranscription(filePath, true, { outputMode: rewriteMode.value });
  }
});

loadSources.addEventListener('click', async () => {
  try {
    if (!framePrepared && captureMode.value === 'region') {
      await window.studio.showRecordingFrame();
      await window.studio.recordingFrameCommand('interactive');
      framePrepared = true;
      currentAudioLabel = audioModeLabel(audioMode.value);
      await window.studio.showRecordingWidget();
      await window.studio.recordingWidgetState({
        status: 'ready',
        elapsed: 0,
        remaining: selectedRecordingLimitSeconds(),
        audioLabel: currentAudioLabel,
        canPause: false
      });
      updateRecordingButtons();
      logStatus('录制范围线框已显示，但此时还没有开始录制。请拖到主屏或副屏的视频位置，调整好后点击主界面或线框上的“开始录制”。');
      return;
    }
    await startRecording();
  } catch (error) {
    logStatus(`录屏启动失败：${error.message || String(error)}`);
    logStatus('请在 系统设置 > 隐私与安全性 > 屏幕与系统音频录制 中允许本应用，然后重启应用再试。');
  }
});

window.studio.onNativeRecordingEvent((payload) => {
  if (payload.event === 'log' && payload.message) logStatus(payload.message);
  if (payload.event === 'started') logStatus('原生录制已开始写入文件。');
  if (payload.event === 'captureStarted') {
    logStatus(payload.audioMode === 'microphone'
      ? '原生屏幕捕获已启动，外部麦克风录制已请求。'
      : '原生屏幕捕获已启动，系统音频录制已请求。');
  }
  if (payload.event === 'error') {
    logStatus(`原生录制错误：${payload.message || '未知错误'}`);
    finishNativeRecording(payload.filePath, payload.size, false);
  }
  if (payload.event === 'closed') {
    finishNativeRecording(payload.filePath, payload.size, nativeStopIntent !== 'pause');
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

async function requestMicrophoneFallback(reason = 'fallback') {
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });
    logStatus(reason === 'selected'
      ? '已选择录制外部声音，音频来自麦克风。'
      : '未检测到系统音频轨，已改用麦克风兜底录音。请使用电脑外放播放抖音声音，不要戴耳机。');
    return micStream;
  } catch (error) {
    logStatus(`麦克风兜底录音也未启用：${error.message || String(error)}`);
    return null;
  }
}

async function buildRecordingStream(displayStream, selectedAudioMode) {
  const tracks = [...displayStream.getVideoTracks(), ...displayStream.getAudioTracks()];
  if (selectedAudioMode === 'system' && displayStream.getAudioTracks().length > 0) {
    return { stream: new MediaStream(tracks), audioMode: 'system' };
  }
  const micStream = await requestMicrophoneFallback(selectedAudioMode === 'microphone' ? 'selected' : 'fallback');
  if (micStream?.getAudioTracks().length) {
    return {
      stream: new MediaStream([...displayStream.getVideoTracks(), ...micStream.getAudioTracks()]),
      audioMode: 'microphone'
    };
  }
  return { stream: new MediaStream(displayStream.getVideoTracks()), audioMode: 'none' };
}

async function startRecording() {
  if (!validateRecordingLimitBeforeStart()) return;
  const selectedAudioMode = audioMode.value;
  currentAudioLabel = audioModeLabel(selectedAudioMode);
  recordingLimitSeconds = selectedRecordingLimitSeconds();
  autoStopTriggered = false;
  currentCapture = await prepareCaptureFrame();
  if (selectedAudioMode === 'system' && await window.studio.nativeRecorderAvailable()) {
    try {
      await startNativeRecording(selectedAudioMode);
      return;
    } catch (error) {
      logStatus(`原生录制启动失败，退回兼容录制：${error.message || String(error)}`);
    }
  }
  if (currentCapture.mode === 'region') {
    logStatus('外部声音兼容录制会打开系统选择器，请在系统弹窗中选择红框所在屏幕或窗口。');
  }
  await startElectronRecording(selectedAudioMode);
}

async function startNativeRecording(selectedAudioMode) {
  if (recordingBackend) return;
  recordingBackend = 'native';
  nativePaused = false;
  nativeStopIntent = 'stop';
  nativeSegments = [];
  nativeAudioMode = selectedAudioMode;
  recordingStartedAt = Date.now();
  accumulatedPausedMs = 0;
  pauseStartedAt = 0;
  updateRecordingButtons();
  logStatus(selectedAudioMode === 'system'
    ? '正在启动 macOS 原生录屏，会请求屏幕和系统音频权限。'
    : '正在启动 macOS 原生录屏，会请求屏幕录制和麦克风权限。');
  try {
    await startNativeSegment(selectedAudioMode);
    await window.studio.recordingFrameCommand('passthrough');
    await window.studio.showRecordingWidget();
    updateRecordingButtons();
    await window.studio.recordingWidgetState({ status: 'recording', elapsed: elapsedSeconds(), remaining: recordingRemainingSeconds(), audioLabel: currentAudioLabel, canPause: true });
    startWidgetTimer('recording', { audioMode: selectedAudioMode, canPause: true });
    scheduleAutoStop();
    logRecordingLimit();
  } catch (error) {
    recordingBackend = null;
    nativeRecordingFile = null;
    nativePaused = false;
    nativeSegments = [];
    autoStopTriggered = false;
    stopAutoStopTimer();
    framePrepared = true;
    updateRecordingButtons();
    throw error;
  }
}

async function startNativeSegment(selectedAudioMode) {
  const result = await window.studio.startNativeRecording({ audioMode: selectedAudioMode, capture: currentCapture });
  nativeRecordingFile = result.filePath;
  logStatus(`原生录屏文件已开始自动保存：${nativeRecordingFile}`);
}

async function finishNativeRecording(filePath, size, shouldTranscribe) {
  if (recordingBackend !== 'native') return;
  if (filePath && size > 0) nativeSegments.push(filePath);
  nativeRecordingFile = null;
  if (nativeStopIntent === 'pause') {
    nativePaused = true;
    pauseStartedAt = Date.now();
    logStatus('录制已暂停，当前片段已保存。');
    updateRecordingButtons();
    await window.studio.recordingFrameCommand('paused');
    await window.studio.recordingWidgetState({ status: 'paused', elapsed: elapsedSeconds(), remaining: recordingRemainingSeconds(), audioLabel: currentAudioLabel, canPause: true });
    return;
  }
  recordingBackend = null;
  nativePaused = false;
  stopAutoStopTimer();
  recordingLimitSeconds = 0;
  autoStopTriggered = false;
  stopWidgetTimer();
  resetCaptureFrameState();
  updateRecordingButtons();
  await window.studio.hideRecordingWidget();
  await window.studio.hideRecordingFrame();
  if (nativeSegments.length) {
    try {
      const result = await window.studio.mergeRecordingSegments({ segments: nativeSegments });
      let recordingPath = result.filePath;
      logStatus(result.merged ? `录制片段已合并：${recordingPath}` : `录屏已保存：${recordingPath}`);
      recordingPath = await promptForRecordingName(recordingPath);
      queueTranscription(recordingPath, shouldTranscribe && autoTranscribe.checked);
    } catch (error) {
      let fallback = nativeSegments[nativeSegments.length - 1];
      logStatus(`录制片段合并失败，将使用最后一个片段：${error.message || String(error)}`);
      fallback = await promptForRecordingName(fallback);
      queueTranscription(fallback, shouldTranscribe && autoTranscribe.checked);
    }
  } else {
    logStatus('原生录制结束，但没有写入有效文件。');
  }
  nativeSegments = [];
  nativeStopIntent = 'stop';
}

async function startElectronRecording(selectedAudioMode) {
  if (mediaRecorder) return;
  recordingBackend = 'electron';
  updateRecordingButtons();
  logStatus('正在请求录屏权限，请在系统弹窗中选择抖音所在屏幕或窗口。');
  let stream;
  try {
    stream = await requestDisplayStream();
  } catch (error) {
    recordingBackend = null;
    framePrepared = true;
    updateRecordingButtons();
    throw error;
  }
  const displayStream = stream;
  const built = await buildRecordingStream(displayStream, selectedAudioMode);
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
    recordingBackend = null;
    framePrepared = true;
    updateRecordingButtons();
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
    stopAutoStopTimer();
    recordingLimitSeconds = 0;
    autoStopTriggered = false;
    stopWidgetTimer();
    await window.studio.hideRecordingWidget();
    await window.studio.hideRecordingFrame();
    recordingBackend = null;
    resetCaptureFrameState();
    updateRecordingButtons();
    if (finished?.filePath && finished.size > 0) {
      let recordingPath = finished.filePath;
      logStatus(`录屏已保存：${recordingPath}`);
      recordingPath = await promptForRecordingName(recordingPath);
      queueTranscription(recordingPath, autoTranscribe.checked);
    } else {
      logStatus('录制结束，但没有写入有效文件。');
    }
  };
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  });

  mediaRecorder.start(1000);
  const hasAudio = stream.getAudioTracks().length > 0;
  currentAudioLabel = audioModeLabel(built.audioMode);
  logStatus(`录屏文件已开始自动保存：${activeRecording.filePath}`);
  if (built.audioMode === 'system') logStatus('正在录制，已检测到系统音频轨。');
  if (built.audioMode === 'microphone') logStatus('正在录制，音频来自麦克风兜底。');
  if (!hasAudio) logStatus('正在录制，但没有检测到音频轨；停止后将只保存视频，不会转写。');
  await window.studio.recordingFrameCommand('passthrough');
  await window.studio.showRecordingWidget();
  await window.studio.recordingWidgetState({ status: 'recording', elapsed: elapsedSeconds(), remaining: recordingRemainingSeconds(), audioLabel: currentAudioLabel, canPause: true });
  updateRecordingButtons();
  startWidgetTimer('recording', { audioMode: built.audioMode, canPause: true });
  scheduleAutoStop();
  logRecordingLimit();
}

stopRecording.addEventListener('click', () => {
  stopActiveRecording();
});

pauseRecording.addEventListener('click', () => {
  pauseActiveRecording();
});

resumeRecording.addEventListener('click', () => {
  resumeActiveRecording();
});

adjustRecordingFrame.addEventListener('click', async () => {
  if (!recordingBackend) return;
  adjustingPausedFrame = true;
  await window.studio.recordingFrameCommand('paused-edit');
  logStatus('已进入暂停调整模式：可拖动或缩放录屏范围，调整好后点击“继续录制”。');
});

function elapsedSeconds() {
  const pausedMs = pauseStartedAt ? Date.now() - pauseStartedAt : 0;
  return Math.max(0, Math.floor((Date.now() - recordingStartedAt - accumulatedPausedMs - pausedMs) / 1000));
}

function startWidgetTimer(status, extra = {}) {
  stopWidgetTimer();
  window.studio.recordingWidgetState({
    status,
    elapsed: elapsedSeconds(),
    remaining: recordingRemainingSeconds(),
    audioMode: extra.audioMode || audioMode.value,
    audioLabel: currentAudioLabel || audioModeLabel(extra.audioMode || audioMode.value),
    canPause: Boolean(extra.canPause)
  });
  widgetTimer = setInterval(() => {
    const currentStatus = (recordingBackend === 'electron' && mediaRecorder?.state === 'paused')
      || (recordingBackend === 'native' && nativePaused)
      ? 'paused'
      : 'recording';
    const canPause = Boolean(recordingBackend);
    window.studio.recordingWidgetState({
      status: currentStatus,
      elapsed: elapsedSeconds(),
      remaining: recordingRemainingSeconds(),
      audioLabel: currentAudioLabel,
      canPause
    });
    scheduleAutoStop();
    updateRecordingButtons();
  }, 500);
}

function stopWidgetTimer() {
  if (widgetTimer) clearInterval(widgetTimer);
  widgetTimer = null;
}

function pauseActiveRecording() {
  if (recordingBackend === 'native') {
    if (nativePaused) return;
    adjustingPausedFrame = false;
    nativeStopIntent = 'pause';
    stopAutoStopTimer();
    window.studio.stopNativeRecording();
    logStatus('正在暂停原生录制并保存当前片段...');
    return;
  }
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
  mediaRecorder.pause();
  adjustingPausedFrame = false;
  pauseStartedAt = Date.now();
  stopAutoStopTimer();
  logStatus('录制已暂停。');
  updateRecordingButtons();
  window.studio.recordingFrameCommand('paused');
  window.studio.recordingWidgetState({ status: 'paused', elapsed: elapsedSeconds(), remaining: recordingRemainingSeconds(), audioLabel: currentAudioLabel, canPause: true });
}

async function resumeActiveRecording() {
  if (recordingBackend === 'native') {
    if (!nativePaused) return;
    if (pauseStartedAt) accumulatedPausedMs += Date.now() - pauseStartedAt;
    pauseStartedAt = 0;
    nativePaused = false;
    nativeStopIntent = 'stop';
    if (captureMode.value === 'region' && adjustingPausedFrame) {
      currentCapture = await prepareCaptureFrame();
      logStatus('已应用新的录屏范围，正在继续录制。');
    } else {
      logStatus('正在继续录制。');
    }
    adjustingPausedFrame = false;
    startNativeSegment(nativeAudioMode)
      .then(() => {
        logStatus('录制已继续。');
        scheduleAutoStop();
        updateRecordingButtons();
        window.studio.recordingFrameCommand('passthrough');
        window.studio.recordingWidgetState({ status: 'recording', elapsed: elapsedSeconds(), remaining: recordingRemainingSeconds(), audioLabel: currentAudioLabel, canPause: true });
      })
      .catch((error) => {
        nativePaused = true;
        pauseStartedAt = Date.now();
        updateRecordingButtons();
        logStatus(`继续录制失败：${error.message || String(error)}`);
        window.studio.recordingWidgetState({ status: 'paused', elapsed: elapsedSeconds(), remaining: recordingRemainingSeconds(), audioLabel: currentAudioLabel, canPause: true });
      });
    updateRecordingButtons();
    return;
  }
  if (!mediaRecorder || mediaRecorder.state !== 'paused') return;
  if (adjustingPausedFrame) {
    logStatus('兼容录制模式暂不支持暂停后切换录屏范围；本次继续沿用原录制范围。');
  }
  adjustingPausedFrame = false;
  if (pauseStartedAt) accumulatedPausedMs += Date.now() - pauseStartedAt;
  pauseStartedAt = 0;
  mediaRecorder.resume();
  scheduleAutoStop();
  logStatus('录制已继续。');
  updateRecordingButtons();
  window.studio.recordingFrameCommand('passthrough');
  window.studio.recordingWidgetState({ status: 'recording', elapsed: elapsedSeconds(), remaining: recordingRemainingSeconds(), audioLabel: currentAudioLabel, canPause: true });
}

async function stopActiveRecording() {
  stopAutoStopTimer();
  adjustingPausedFrame = false;
  if (framePrepared && !recordingBackend) {
    await window.studio.stopNativeRecording();
    await window.studio.hideRecordingFrame();
    await window.studio.hideRecordingWidget();
    resetCaptureFrameState();
    updateRecordingButtons();
    logStatus('录制已停止。');
    return;
  }
  if (recordingBackend === 'native') {
    nativeStopIntent = 'stop';
    if (nativePaused) {
      finishNativeRecording(null, 0, true);
      logStatus('正在停止原生录制...');
      return;
    }
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

function scheduleAutoStop() {
  stopAutoStopTimer();
  if (!recordingBackend || !recordingLimitSeconds || autoStopTriggered) return;
  if (nativeStopIntent === 'pause') return;
  const remaining = recordingRemainingSeconds();
  if (remaining <= 0) {
    triggerAutoStop();
    return;
  }
  autoStopTimer = setTimeout(triggerAutoStop, Math.max(250, remaining * 1000));
}

function stopAutoStopTimer() {
  if (autoStopTimer) clearTimeout(autoStopTimer);
  autoStopTimer = null;
}

function triggerAutoStop() {
  if (!recordingBackend || autoStopTriggered) return;
  const isPaused = (recordingBackend === 'electron' && mediaRecorder?.state === 'paused')
    || (recordingBackend === 'native' && (nativePaused || nativeStopIntent === 'pause'));
  if (isPaused) return;
  autoStopTriggered = true;
  logStatus('定时录制时间已到，正在自动停止并进入转写流程...');
  stopActiveRecording();
}

function logRecordingLimit() {
  if (recordingLimitSeconds) {
    if (recordingDuration.value === 'calculated') {
      logStatus(`已按视频时长和播放倍速计算录制时长：${recordingLimitLabel(recordingLimitSeconds)}，到点将自动停止。`);
    } else {
      logStatus(`已开启定时录制：${recordingLimitLabel(recordingLimitSeconds)}，到点将自动停止。`);
    }
  } else {
    logStatus('录制定时：不限时。');
  }
}

window.studio.onRecordingControl((command) => {
  if (command === 'start' && framePrepared && !recordingBackend) {
    startRecording().catch((error) => {
      logStatus(`录屏启动失败：${error.message || String(error)}`);
      logStatus('请确认系统已允许屏幕与系统音频录制。如果仍失败，可切换为外部声音录制再试。');
    });
  }
  if (command === 'pause') pauseActiveRecording();
  if (command === 'resume') resumeActiveRecording();
  if (command === 'stop') stopActiveRecording();
});

openOutput.addEventListener('click', () => {
  if (outputRoot) window.studio.openPath(outputRoot);
});

organizer.addEventListener('change', updateOrganizerFields);
recordingDuration.addEventListener('change', () => {
  updateRecordingButtons();
  updateReadyRecordingWidget();
});
customDurationMinutes.addEventListener('input', () => {
  updateRecordingButtons();
  updateReadyRecordingWidget();
});
sourceVideoDuration.addEventListener('input', () => {
  updateRecordingButtons();
  updateReadyRecordingWidget();
});
playbackSpeed.addEventListener('change', () => {
  updateRecordingButtons();
  updateReadyRecordingWidget();
});
chooseOpenClawCommand.addEventListener('click', async () => {
  const commandPath = await window.studio.chooseOpenClawCommand();
  if (commandPath) openclawCommand.value = commandPath;
});
checkOpenClaw.addEventListener('click', checkOpenClawStatus);
testOpenClaw.addEventListener('click', testOpenClawStatus);
copyDiagnostics.addEventListener('click', async () => {
  await window.studio.copyText(buildDiagnosticsText());
  logStatus('OpenClaw 诊断信息已复制。');
});
checkLocalAi.addEventListener('click', checkLocalAiStatus);
testLocalAi.addEventListener('click', testLocalAiStatus);
copyLocalAiDiagnostics.addEventListener('click', async () => {
  await window.studio.copyText(buildLocalAiDiagnosticsText());
  logStatus('本地大模型诊断信息已复制。');
});
captureMode.addEventListener('change', async () => {
  if (!recordingBackend) {
    framePrepared = false;
    await window.studio.hideRecordingFrame();
    await window.studio.hideRecordingWidget();
    updateRecordingButtons();
  }
});
updateOrganizerFields();
renderLocalAiPresets();

window.studio.onJobLog((payload) => {
  if (payload.message) logStatus(payload.message);
});

window.studio.onJobProgress((payload) => {
  const row = payload.jobId
    ? document.querySelector(`[data-job-id="${CSS.escape(payload.jobId)}"]`)
    : null;
  updateJobProgress(row, payload);
});

showHelp.addEventListener('click', () => {
  helpDialog.showModal();
});

closeHelp.addEventListener('click', () => {
  helpDialog.close();
});

showStatusLog.addEventListener('click', renderStatusLogDialog);

closeStatusLog.addEventListener('click', () => {
  statusLogDialog.close();
});

copyStatusLog.addEventListener('click', async () => {
  await window.studio.copyText(loadStatusLog());
  logStatus('历史状态日志已复制。');
  statusLogContent.textContent = loadStatusLog() || '暂无历史日志。';
});

clearStatusLog.addEventListener('click', () => {
  localStorage.removeItem(STATUS_LOG_KEY);
  statusLogContent.textContent = '暂无历史日志。';
  logStatus('历史状态日志已清空。');
});

closeOrganizerWarning.addEventListener('click', () => {
  organizerWarningDialog.close('keep');
});

keepOrganizerWarning.addEventListener('click', () => {
  organizerWarningDialog.close('keep');
});

retryOrganizerWarning.addEventListener('click', () => {
  organizerWarningDialog.close('retry');
});

nameCancel.addEventListener('click', () => {
  nameDialog.close('cancel');
});

nameConfirm.addEventListener('click', () => {
  nameDialog.close('confirm');
});

nameDialogInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    nameDialog.close('confirm');
  }
});

window.studio.appInfo().then((info) => {
  outputRoot = info.outputRoot;
  displayInfo = info.displays || [];
  version.textContent = `v${info.appVersion}`;
  statusBox.textContent = [
    `输出目录：${info.outputRoot}`,
    `Python：${info.python}`,
    `转写脚本：${info.pythonScript}`,
    `可选 OpenClaw：${info.openclaw}`,
    '可选本地大模型直连：默认检测 Ollama http://127.0.0.1:11434，也支持兼容 /v1/chat/completions 的本地服务。',
    '重复内容去重默认使用普通模式，可处理在线播放卡顿、回放、跳回开头造成的重复片段。',
    '录屏优先使用 macOS 原生录制。',
    '系统声音不拾取外部环境；外部声音使用麦克风。',
    '默认独立运行；选择 OpenClaw 或本地大模型直连时才会调用额外模型。',
    'OpenClaw 模型留空会使用 OpenClaw 默认模型；本地直连必须填写模型名称。',
    '换电脑时如检测不到，可复制诊断信息，也可改用本地大模型直连。'
  ].join('\n');
});
