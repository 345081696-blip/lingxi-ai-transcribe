const { app, BrowserWindow, Menu, dialog, ipcMain, desktopCapturer, shell, session, screen, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
const projectRoot = isDev ? path.join(__dirname, '..') : process.resourcesPath;
const pythonScript = path.join(projectRoot, 'python', 'transcribe.py');
const nativeRecorderPath = path.join(projectRoot, 'native', 'bin', 'native-recorder');
const outputRoot = path.join(app.getPath('documents'), 'TranscribeStudio');
const productName = '零析AI 转写';
const appVersion = app.getVersion();
const progressPrefix = '__LC_PROGRESS__';
const mediaExtensions = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi', '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg']);

let mainWindow;
let widgetWindow;
let frameWindow;
let edgeWindows = [];
let nativeRecording = null;
let isQuitting = false;
const activeTranscriptions = new Map();
const activeRecordings = new Map();

function parseWindowIdFromSourceId(sourceId) {
  const match = String(sourceId || '').match(/^window:(\d+):/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function canSend(win) {
  return Boolean(win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed());
}

function sendToWindow(win, channel, payload) {
  if (canSend(win)) win.webContents.send(channel, payload);
}

function sendToWebContents(target, channel, payload) {
  if (target && !target.isDestroyed()) target.send(channel, payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    title: productName,
    backgroundColor: '#090b0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow;
  widgetWindow = new BrowserWindow({
    width: 520,
    height: 50,
    minWidth: 520,
    minHeight: 50,
    x: 80,
    y: 80,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: '录制控制',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  if (typeof widgetWindow.setContentProtection === 'function') widgetWindow.setContentProtection(true);
  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.loadFile(path.join(__dirname, 'widget.html'));
  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
  return widgetWindow;
}

function getAllDisplayBounds() {
  const displays = screen.getAllDisplays();
  const left = Math.min(...displays.map((display) => display.bounds.x));
  const top = Math.min(...displays.map((display) => display.bounds.y));
  const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function createFrameWindow() {
  if (frameWindow && !frameWindow.isDestroyed()) return frameWindow;
  const primary = screen.getPrimaryDisplay().bounds;
  frameWindow = new BrowserWindow({
    width: 860,
    height: 520,
    minWidth: 260,
    minHeight: 180,
    x: primary.x + Math.round((primary.width - 860) / 2),
    y: primary.y + Math.round((primary.height - 520) / 2),
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    title: '录制范围',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  if (typeof frameWindow.setContentProtection === 'function') frameWindow.setContentProtection(true);
  frameWindow.setAlwaysOnTop(true, 'floating');
  frameWindow.loadFile(path.join(__dirname, 'frame.html'));
  frameWindow.on('closed', () => {
    frameWindow = null;
  });
  return frameWindow;
}

function createEdgeWindow(position) {
  const win = new BrowserWindow({
    width: 10,
    height: 10,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    title: `录制边框-${position}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  if (typeof win.setContentProtection === 'function') win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'edge.html'));
  win.on('closed', () => {
    edgeWindows = edgeWindows.filter((item) => item.win !== win);
  });
  return { position, win };
}

function ensureEdgeWindows() {
  edgeWindows = ['top', 'right', 'bottom', 'left'].map((position) => createEdgeWindow(position));
  return edgeWindows;
}

function showEdgeFrame(bounds) {
  hideEdgeFrame();
  const thickness = 1;
  const gap = 2;
  const desktop = getAllDisplayBounds();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const items = ensureEdgeWindows();
  const placements = {
    top: {
      x: bounds.x,
      y: clamp(bounds.y - gap - thickness, desktop.y, desktop.y + desktop.height - thickness),
      width: bounds.width,
      height: thickness
    },
    right: {
      x: clamp(bounds.x + bounds.width + gap, desktop.x, desktop.x + desktop.width - thickness),
      y: bounds.y,
      width: thickness,
      height: bounds.height
    },
    bottom: {
      x: bounds.x,
      y: clamp(bounds.y + bounds.height + gap, desktop.y, desktop.y + desktop.height - thickness),
      width: bounds.width,
      height: thickness
    },
    left: {
      x: clamp(bounds.x - gap - thickness, desktop.x, desktop.x + desktop.width - thickness),
      y: bounds.y,
      width: thickness,
      height: bounds.height
    }
  };
  for (const item of items) {
    const nextBounds = placements[item.position];
    if (!nextBounds || item.win.isDestroyed()) continue;
    item.win.setBounds(nextBounds);
    item.win.showInactive();
    item.win.moveTop();
  }
}

function hideEdgeFrame() {
  for (const item of edgeWindows) {
    if (!item.win.isDestroyed()) item.win.hide();
  }
  edgeWindows = [];
}

function setupApplicationMenu() {
  const template = [
    {
      label: productName,
      submenu: [
        { label: `关于 ${productName}`, role: 'about' },
        { type: 'separator' },
        { label: '隐藏', role: 'hide' },
        { label: '隐藏其他应用', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '文件',
      submenu: [
        { label: '显示主界面', click: restoreMainWindow },
        { label: '打开输出目录', click: () => shell.openPath(outputRoot) },
        { type: 'separator' },
        { label: '关闭窗口', role: 'close' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '粘贴并匹配样式', role: 'pasteAndMatchStyle' },
        { label: '删除', role: 'delete' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '实际大小', role: 'resetZoom' },
        { type: 'separator' },
        { label: '切换全屏', role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '缩放', role: 'zoom' },
        { type: 'separator' },
        { label: '前置全部窗口', role: 'front' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '打开输出目录', click: () => shell.openPath(outputRoot) }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  fs.mkdirSync(outputRoot, { recursive: true });
  setupApplicationMenu();
  configureCapturePermissions();
  createWindow();
  createWidgetWindow();
  createFrameWindow();

  app.on('activate', () => {
    restoreMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

function configureCapturePermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['display-capture', 'media'].includes(permission));
  });
  ses.setPermissionCheckHandler((_webContents, permission) => (
    ['display-capture', 'media'].includes(permission)
  ));
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 }
    });
    callback(sources[0] ? { video: sources[0] } : {});
  }, { useSystemPicker: true });
}

ipcMain.handle('list-capture-windows', async () => {
  const excludedNames = new Set([productName, '录制范围', '录制控制']);
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 320, height: 200 },
    fetchWindowIcons: false
  });
  return sources
    .map((source) => {
      const windowId = parseWindowIdFromSourceId(source.id);
      if (!windowId) return null;
      const name = String(source.name || '').trim() || `窗口 ${windowId}`;
      if (excludedNames.has(name)) return null;
      return {
        sourceId: source.id,
        windowId,
        name,
        thumbnailDataUrl: source.thumbnail && !source.thumbnail.isEmpty()
          ? source.thumbnail.toDataURL()
          : null
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function safeName(input) {
  const base = path.basename(input || 'media').replace(/\.[^.]+$/, '');
  return base.replace(/[^\p{L}\p{N}_ -]+/gu, '').trim().slice(0, 80) || 'media';
}

function uniquePath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const parsed = path.parse(targetPath);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(parsed.dir, `${parsed.name}-${Date.now()}${parsed.ext}`);
}

function resolveJobDir(filePath, options = {}) {
  const name = safeName(filePath);
  if (options.outputMode === 'overwrite') {
    const jobDir = path.join(outputRoot, `重新转写-${name}`);
    fs.rmSync(jobDir, { recursive: true, force: true });
    return jobDir;
  }
  return path.join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}`);
}

function resolvePython() {
  // 优先使用随包分发的独立 Python（python-standalone）。
  // 不用 venv：venv 会在 pyvenv.cfg 里写死“创建它的那台机器”的解释器绝对路径，
  // 换到没装过 Python 的电脑上就会报 No Python at ... （Windows 版已踩过，见打包复盘坑20）。
  const bundledPython = path.join(projectRoot, 'python-standalone', 'bin', 'python3');
  const candidates = [
    process.env.TRANSCRIBE_STUDIO_PYTHON,
    bundledPython,
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    'python3'
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === 'python3' || fs.existsSync(candidate)) || 'python3';
}

function resolveFfmpeg() {
  // 随包分发的 ffmpeg：开发态在 extra/ffmpeg，打包后由 extraResources 映射到 resources/ffmpeg。
  // ffprobe 必须跟它放同一目录（transcribe.py 会从 ffmpeg 同目录找 ffprobe）。
  // 这样换到没装 Homebrew ffmpeg 的电脑上也能转写。
  const bundled = isDev
    ? path.join(projectRoot, 'extra', 'ffmpeg', 'ffmpeg')
    : path.join(projectRoot, 'ffmpeg', 'ffmpeg');
  const candidates = [
    process.env.TRANSCRIBE_STUDIO_FFMPEG,
    bundled,
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    'ffmpeg'
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === 'ffmpeg' || fs.existsSync(candidate)) || 'ffmpeg';
}

function commandEnv() {
  const pathEntries = [
    process.env.PATH,
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ].filter(Boolean).flatMap((entry) => entry.split(':'));
  const uniquePath = [...new Set(pathEntries)].join(':');
  return {
    ...process.env,
    PATH: uniquePath
  };
}

function runCommand(command, args, onData) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: commandEnv() });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onData) onData(text, 'stdout');
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onData) onData(text, 'stderr');
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited with ${code}`));
    });
  });
}

function runCommandWithTimeout(command, args, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: commandEnv() });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`${path.basename(command)} 检测超时`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited with ${code}`));
    });
  });
}

function runTrackedCommand(id, command, args, onData, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...commandEnv(), ...extraEnv } });
    activeTranscriptions.set(id, { child, stopRequested: false });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onData) onData(text, 'stdout');
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onData) onData(text, 'stderr');
    });

    child.on('error', (error) => {
      activeTranscriptions.delete(id);
      reject(error);
    });
    child.on('close', (code, signal) => {
      const tracked = activeTranscriptions.get(id);
      activeTranscriptions.delete(id);
      if (tracked?.stopRequested) {
        reject(new Error('转录已停止。'));
      } else if (code === 0) {
        resolve({ stdout, stderr });
      } else if (signal || code === 130 || code === 143) {
        reject(new Error(`转录进程异常退出：${signal || code}。如果软件仍在后台运行，这不按人工停止处理。`));
      } else {
        reject(new Error(stderr || stdout || `${command} exited with ${code}`));
      }
    });
  });
}

function resolveOpenClawCommand(customCommand = '') {
  if (customCommand && fs.existsSync(customCommand)) return customCommand;
  const candidates = [
    process.env.OPENCLAW_BIN,
    '/opt/homebrew/bin/openclaw',
    '/usr/local/bin/openclaw',
    'openclaw'
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === 'openclaw' || fs.existsSync(candidate)) || 'openclaw';
}

function collectOpenClawConfigHints(configPath) {
  const hints = {
    defaultModel: '',
    localModels: [],
    agents: []
  };
  if (!configPath || !fs.existsSync(configPath)) return hints;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    hints.defaultModel = config?.agents?.defaults?.model?.primary || '';
    const providers = config?.models?.providers || {};
    for (const [providerId, provider] of Object.entries(providers)) {
      for (const model of provider?.models || []) {
        const id = model?.id ? `${providerId}/${model.id}` : '';
        if (providerId === 'ollama' && id) hints.localModels.push({
          id,
          name: model.name || model.id
        });
      }
    }
    for (const agent of config?.agents?.list || []) {
      const primary = agent?.model?.primary;
      if (agent?.name && primary) hints.agents.push({
        name: agent.name,
        model: primary
      });
    }
  } catch {
    return hints;
  }
  return hints;
}

async function checkOpenClawStatus(options = {}) {
  const command = resolveOpenClawCommand(options.command || '');
  const status = {
    available: false,
    command,
    version: '',
    nodeVersion: '',
    ollamaVersion: '',
    configValid: false,
    configPath: '',
    defaultModel: '',
    localModels: [],
    agents: [],
    message: ''
  };

  try {
    const nodeResult = await runCommandWithTimeout('node', ['--version'], 3000);
    status.nodeVersion = nodeResult.stdout.trim();
  } catch {
    status.nodeVersion = '';
  }

  try {
    const ollamaResult = await runCommandWithTimeout('ollama', ['--version'], 3000);
    status.ollamaVersion = (ollamaResult.stdout || ollamaResult.stderr).trim().split(/\r?\n/)[0] || '';
  } catch {
    status.ollamaVersion = '';
  }

  try {
    const versionResult = await runCommandWithTimeout(command, ['--version'], 4000);
    status.version = (versionResult.stdout || versionResult.stderr).trim().split(/\r?\n/)[0] || '';
  } catch (error) {
    status.message = `未检测到可用 OpenClaw：${error.message || String(error)}`;
    return status;
  }

  try {
    const configResult = await runCommandWithTimeout(command, ['config', 'validate', '--json'], 5000);
    const parsed = JSON.parse((configResult.stdout || '').trim() || '{}');
    status.configValid = Boolean(parsed.valid);
    status.configPath = parsed.path || '';
    Object.assign(status, collectOpenClawConfigHints(status.configPath));
    status.available = status.configValid;
    status.message = status.available
      ? 'OpenClaw 已可用；模型留空时使用 OpenClaw 默认模型。'
      : 'OpenClaw 命令存在，但配置未通过校验。';
  } catch (error) {
    status.message = `OpenClaw 命令可用，但配置检测失败：${error.message || String(error)}`;
  }
  return status;
}

async function testOpenClawOrganizer(options = {}) {
  const command = resolveOpenClawCommand(options.command || '');
  const model = (options.model || '').trim();
  const prompt = '请只回复：零析AI 转写测试成功';
  const args = ['infer', 'model', 'run', '--gateway', '--json', '--prompt', prompt];
  if (model) args.push('--model', model);
  const result = await runCommandWithTimeout(command, args, 45000);
  const output = (result.stdout || result.stderr || '').trim();
  return {
    ok: Boolean(output),
    command,
    model,
    output: output.slice(0, 1200)
  };
}

async function requestJson(url, payload = null, timeoutMs = 10000, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init = payload
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extraHeaders },
          body: JSON.stringify(payload),
          signal: controller.signal
        }
      : { signal: controller.signal, headers: extraHeaders };
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { text };
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${text.slice(0, 500)}`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function friendlyAiError(error) {
  const text = error?.message || String(error || '');
  if (/model_not_found|No available channel|model .*not found|模型不存在/i.test(text)) {
    return '连接成功，但模型名称不可用。请到服务商后台复制可用模型 ID，或换一个模型后再试。';
  }
  if (/401|unauthorized|invalid api key|invalid_token|api key/i.test(text)) {
    return 'API Key 无效、已过期或没有正确填写。请重新复制服务商后台的 Key。';
  }
  if (/403|forbidden|permission|无权限/i.test(text)) {
    return 'API Key 没有权限访问该模型，或账号未开通该模型。';
  }
  if (/429|rate limit|quota|余额|额度/i.test(text)) {
    return '额度不足或请求过于频繁。请检查余额、套餐或稍后再试。';
  }
  if (/503|502|504|No available channel|service unavailable/i.test(text)) {
    return '服务商当前没有可用通道。请换模型、换线路或稍后再试。';
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|timed out|timeout|AbortError|fetch failed/i.test(text)) {
    return '网络或 API 地址不可用。请检查 Base URL 是否正确，或确认当前网络能访问该服务。';
  }
  return text;
}

function normalizeLocalAiBaseUrl(input = '') {
  const value = String(input || '').trim();
  return value || 'http://127.0.0.1:11434';
}

function normalizeCloudAiBaseUrl(input = '') {
  return String(input || '').trim().replace(/\/$/, '');
}

async function checkLocalAiStatus(options = {}) {
  const baseUrl = normalizeLocalAiBaseUrl(options.baseUrl);
  const modelsUrl = `${baseUrl.replace(/\/$/, '')}/v1/models`;
  const status = {
    available: false,
    baseUrl,
    models: [],
    selectedModel: String(options.model || '').trim(),
    message: ''
  };
  try {
    const payload = await requestJson(modelsUrl, null, 8000);
    status.models = Array.isArray(payload.data)
      ? payload.data.map((item) => ({
          id: item.id || item.name || '',
          name: item.name || item.id || ''
        })).filter((item) => item.id)
      : [];
    status.available = status.models.length > 0;
    if (!status.selectedModel && status.models[0]) status.selectedModel = status.models[0].id;
    status.message = status.available
      ? `本地大模型服务可用；检测到 ${status.models.length} 个模型。`
      : '本地大模型服务可访问，但没有返回模型列表。';
  } catch (error) {
    status.message = `未检测到本地大模型服务：${friendlyAiError(error)}`;
  }
  return status;
}

async function testLocalAiOrganizer(options = {}) {
  const baseUrl = normalizeLocalAiBaseUrl(options.baseUrl);
  const model = String(options.model || '').trim();
  if (!model) throw new Error('请先填写本地模型名称，或点击检测后复制模型名。');
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  let payload;
  try {
    payload = await requestJson(endpoint, {
      model,
      messages: [
        { role: 'system', content: '你是简洁的中文助手。' },
        { role: 'user', content: '请只回复：零析AI 转写测试成功' }
      ],
      temperature: 0.2,
      stream: false
    }, 60000);
  } catch (error) {
    throw new Error(friendlyAiError(error));
  }
  return {
    ok: true,
    baseUrl,
    model,
    output: JSON.stringify(payload).slice(0, 1200)
  };
}

async function checkCloudAiStatus(options = {}) {
  const baseUrl = normalizeCloudAiBaseUrl(options.baseUrl);
  const apiKey = String(options.apiKey || '').trim();
  const status = {
    available: false,
    baseUrl,
    models: [],
    selectedModel: String(options.model || '').trim(),
    message: ''
  };
  if (!baseUrl) {
    status.message = '请填写云端 API 地址。';
    return status;
  }
  if (!apiKey) {
    status.message = '请填写 API Key。';
    return status;
  }
  try {
    const modelsUrl = `${baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`}/models`;
    const payload = await requestJson(modelsUrl, null, 15000, { Authorization: `Bearer ${apiKey}` });
    status.models = Array.isArray(payload.data)
      ? payload.data.map((item) => ({
          id: item.id || item.name || '',
          name: item.name || item.id || ''
        })).filter((item) => item.id)
      : [];
    status.available = status.models.length > 0 || Boolean(status.selectedModel);
    if (!status.selectedModel && status.models[0]) status.selectedModel = status.models[0].id;
    status.message = status.available
      ? `云端 API 可用；检测到 ${status.models.length} 个模型。`
      : '云端 API 可访问，但没有返回模型列表。可直接填写服务商提供的模型名称后测试。';
  } catch (error) {
    status.message = `云端 API 检测失败：${friendlyAiError(error)}`;
  }
  return status;
}

async function testCloudAiOrganizer(options = {}) {
  const baseUrl = normalizeCloudAiBaseUrl(options.baseUrl);
  const apiKey = String(options.apiKey || '').trim();
  const model = String(options.model || '').trim();
  if (!baseUrl) throw new Error('请先填写云端 API 地址。');
  if (!apiKey) throw new Error('请先填写 API Key。');
  if (!model) throw new Error('请先填写云端模型名称。');
  const endpointBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
  const endpoint = `${endpointBase}/chat/completions`;
  let payload;
  try {
    payload = await requestJson(endpoint, {
      model,
      messages: [
        { role: 'system', content: '你是简洁的中文助手。' },
        { role: 'user', content: '请只回复：零析AI 转写云端模型测试成功' }
      ],
      temperature: 0.2,
      stream: false
    }, 60000, { Authorization: `Bearer ${apiKey}` });
  } catch (error) {
    throw new Error(friendlyAiError(error));
  }
  return {
    ok: true,
    baseUrl,
    model,
    output: JSON.stringify(payload).slice(0, 1200)
  };
}

function organizerArgs(options = {}) {
  const mode = options.organizer || 'local';
  const args = ['--organizer', mode];
  if (mode === 'openclaw') {
    args.push('--openclaw-bin', options.openclawBin || resolveOpenClawCommand(options.openclawCommand || ''));
    if (options.openclawModel) args.push('--openclaw-model', options.openclawModel);
  } else if (mode === 'localai') {
    args.push('--local-ai-base-url', options.localAiBaseUrl || 'http://127.0.0.1:11434');
    if (options.localAiModel) args.push('--local-ai-model', options.localAiModel);
  } else if (mode === 'cloudai') {
    if (options.cloudAiBaseUrl) args.push('--cloud-ai-base-url', options.cloudAiBaseUrl);
    if (options.cloudAiModel) args.push('--cloud-ai-model', options.cloudAiModel);
  }
  if (options.documentTemplate) args.push('--document-template', options.documentTemplate);
  if (options.glossaryText) args.push('--glossary-text', options.glossaryText);
  return args;
}

function isSupportedMediaPath(filePath) {
  return mediaExtensions.has(path.extname(filePath || '').toLowerCase());
}

async function chooseMediaFiles({ title, defaultPath } = {}) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    defaultPath,
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '所有文件', extensions: ['*'] },
      { name: '音视频文件', extensions: ['mp4', 'MP4', 'mov', 'MOV', 'm4v', 'M4V', 'mkv', 'MKV', 'webm', 'WEBM', 'avi', 'AVI', 'mp3', 'MP3', 'm4a', 'M4A', 'wav', 'WAV', 'aac', 'AAC', 'flac', 'FLAC', 'ogg', 'OGG'] }
    ]
  });
  if (result.canceled) return [];
  const supported = result.filePaths.filter(isSupportedMediaPath);
  const rejected = result.filePaths.length - supported.length;
  if (rejected > 0) {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '文件格式不支持',
      message: `已跳过 ${rejected} 个非音视频文件。`,
      detail: '支持 MP4、MOV、M4V、MKV、WEBM、AVI、MP3、M4A、WAV、AAC、FLAC、OGG。'
    });
  }
  return supported;
}

ipcMain.handle('choose-media', async () => {
  return chooseMediaFiles({
    title: '选择视频或音频'
  });
});

ipcMain.handle('choose-recording-media', async () => {
  fs.mkdirSync(outputRoot, { recursive: true });
  return chooseMediaFiles({
    title: '选择已录制的视频重新转写',
    defaultPath: outputRoot
  });
});

ipcMain.handle('choose-openclaw-command', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 OpenClaw 命令文件',
    properties: ['openFile'],
    filters: [
      { name: '命令文件', extensions: ['*'] }
    ]
  });
  if (result.canceled) return '';
  return result.filePaths[0] || '';
});

ipcMain.handle('test-microphone-level', async () => ({
  ok: false,
  peak: 0,
  message: '请在主界面点击“选择录屏范围”后授权麦克风；macOS 桌面版的实时麦克风音量检测由浏览器权限控制。'
}));

ipcMain.handle('begin-recording-file', async (_event, payload = {}) => {
  fs.mkdirSync(outputRoot, { recursive: true });
  const extension = payload.extension || 'webm';
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const filePath = path.join(outputRoot, `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`);
  fs.writeFileSync(filePath, Buffer.alloc(0));
  activeRecordings.set(id, filePath);
  return { id, filePath };
});

ipcMain.handle('append-recording-chunk', async (_event, payload) => {
  const filePath = activeRecordings.get(payload.id);
  if (!filePath) throw new Error('录制文件会话不存在。');
  fs.appendFileSync(filePath, Buffer.from(payload.buffer));
  return { filePath, size: fs.statSync(filePath).size };
});

ipcMain.handle('finish-recording-file', async (_event, payload) => {
  const filePath = activeRecordings.get(payload.id);
  if (!filePath) return null;
  activeRecordings.delete(payload.id);
  return { filePath, size: fs.statSync(filePath).size };
});

ipcMain.handle('merge-recording-segments', async (_event, payload = {}) => {
  const segments = (payload.segments || []).filter((filePath) => filePath && fs.existsSync(filePath));
  if (!segments.length) throw new Error('没有可合并的录制片段。');
  if (segments.length === 1) {
    return { filePath: segments[0], size: fs.statSync(segments[0]).size, merged: false };
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  const filePath = path.join(outputRoot, `recording-${new Date().toISOString().replace(/[:.]/g, '-')}-merged.mp4`);
  const listPath = path.join(outputRoot, `recording-segments-${Date.now()}.txt`);
  const escapeConcatPath = (target) => target.replace(/'/g, "'\\''");
  fs.writeFileSync(listPath, segments.map((target) => `file '${escapeConcatPath(target)}'`).join('\n'));
  try {
    await runCommand(resolveFfmpeg(), ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', filePath]);
  } catch (copyError) {
    await runCommand(resolveFfmpeg(), ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-c:a', 'aac', filePath]);
  } finally {
    fs.rmSync(listPath, { force: true });
  }
  return { filePath, size: fs.statSync(filePath).size, merged: true, segments };
});

ipcMain.handle('show-recording-widget', async () => {
  const win = createWidgetWindow();
  win.showInactive();
  win.moveTop();
  return true;
});

ipcMain.handle('hide-recording-widget', async () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide();
  return true;
});

ipcMain.handle('recording-control', async (_event, command) => {
  if (command === 'stop' && nativeRecording) {
    nativeRecording.child.stdin.write('stop\n');
  }
  if (command === 'stop' && !nativeRecording && frameWindow && !frameWindow.isDestroyed() && frameWindow.isVisible()) {
    frameWindow.hide();
  }
  sendToWindow(mainWindow, 'recording-control', command);
  return true;
});

ipcMain.handle('recording-widget-state', async (_event, state) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    sendToWindow(widgetWindow, 'recording-state', state);
    widgetWindow.moveTop();
  }
  if (frameWindow && !frameWindow.isDestroyed()) {
    sendToWindow(frameWindow, 'recording-state', state);
  }
  for (const item of edgeWindows) {
    sendToWindow(item.win, 'recording-state', state);
  }
  return true;
});

ipcMain.handle('show-recording-frame', async () => {
  hideEdgeFrame();
  const win = createFrameWindow();
  win.setIgnoreMouseEvents(false);
  win.showInactive();
  win.moveTop();
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.moveTop();
  return win.getBounds();
});

ipcMain.handle('hide-recording-frame', async () => {
  if (frameWindow && !frameWindow.isDestroyed()) frameWindow.hide();
  hideEdgeFrame();
  return true;
});

ipcMain.handle('get-recording-frame', async () => {
  if (!frameWindow || frameWindow.isDestroyed()) return null;
  const state = await frameWindow.webContents.executeJavaScript('window.__getRecordingFrame && window.__getRecordingFrame()');
  return { ...state, windowBounds: frameWindow.getBounds() };
});

ipcMain.handle('recording-frame-command', async (_event, command) => {
  if (frameWindow && !frameWindow.isDestroyed()) {
    if (command === 'fullscreen') {
      frameWindow.setIgnoreMouseEvents(false);
      sendToWindow(frameWindow, 'recording-frame-mode', 'setup');
      const display = screen.getDisplayMatching(frameWindow.getBounds());
      frameWindow.setBounds(display.bounds);
      frameWindow.moveTop();
    }
    if (command === 'region') {
      frameWindow.setIgnoreMouseEvents(false);
      sendToWindow(frameWindow, 'recording-frame-mode', 'setup');
      const display = screen.getDisplayMatching(frameWindow.getBounds());
      const width = Math.min(860, Math.max(320, Math.round(display.bounds.width * 0.68)));
      const height = Math.min(520, Math.max(220, Math.round(display.bounds.height * 0.68)));
      frameWindow.setBounds({
        x: display.bounds.x + Math.round((display.bounds.width - width) / 2),
        y: display.bounds.y + Math.round((display.bounds.height - height) / 2),
        width,
        height
      });
      frameWindow.moveTop();
    }
    if (command === 'passthrough') {
      hideEdgeFrame();
      sendToWindow(frameWindow, 'recording-frame-mode', 'recording');
      frameWindow.setIgnoreMouseEvents(true, { forward: true });
      frameWindow.showInactive();
      frameWindow.moveTop();
    }
    if (command === 'paused') {
      hideEdgeFrame();
      sendToWindow(frameWindow, 'recording-frame-mode', 'paused');
      frameWindow.setIgnoreMouseEvents(true, { forward: true });
      frameWindow.showInactive();
      frameWindow.moveTop();
    }
    if (command === 'paused-edit') {
      hideEdgeFrame();
      sendToWindow(frameWindow, 'recording-frame-mode', 'paused');
      frameWindow.setIgnoreMouseEvents(false);
      frameWindow.showInactive();
      frameWindow.moveTop();
    }
    if (command === 'interactive') {
      hideEdgeFrame();
      frameWindow.setIgnoreMouseEvents(false);
      sendToWindow(frameWindow, 'recording-frame-mode', 'setup');
      frameWindow.showInactive();
      frameWindow.moveTop();
    }
  }
  return true;
});

ipcMain.handle('native-recorder-available', async () => (
  process.platform === 'darwin' && fs.existsSync(nativeRecorderPath)
));

ipcMain.handle('start-native-recording', async (event, options = {}) => {
  if (!fs.existsSync(nativeRecorderPath)) {
    throw new Error('原生录屏助手不存在。');
  }
  if (nativeRecording) {
    throw new Error('已有原生录制正在进行。');
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  const audioMode = options.audioMode === 'microphone' ? 'microphone' : 'system';
  const filePath = path.join(outputRoot, `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`);
  const args = ['start', filePath, audioMode];
  const capture = options.capture || {};
  if (capture.window?.windowId) {
    args.push(
      '--window-id',
      String(Math.round(capture.window.windowId)),
      'com.lingchuang.smarttranscribe'
    );
  } else if (capture.screen && capture.region) {
    args.push(
      String(Math.round(capture.screen.x)),
      String(Math.round(capture.screen.y)),
      String(Math.round(capture.region.x)),
      String(Math.round(capture.region.y)),
      String(Math.round(capture.region.width)),
      String(Math.round(capture.region.height)),
      app.getAppPath() ? 'com.lingchuang.smarttranscribe' : 'com.lingchuang.smarttranscribe'
    );
  } else if (capture.screen) {
    args.push(
      String(Math.round(capture.screen.x)),
      String(Math.round(capture.screen.y)),
      '-1',
      '-1',
      '-1',
      '-1',
      'com.lingchuang.smarttranscribe'
    );
  }
  const child = spawn(nativeRecorderPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  nativeRecording = { child, filePath, sender: event.sender };
  let started = false;
  let resolveStarted = null;
  let stdoutBuffer = '';
  let stderr = '';

  const cleanup = () => {
    if (nativeRecording?.child === child) nativeRecording = null;
  };

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    for (const line of lines.filter(Boolean)) {
      try {
        const payload = JSON.parse(line);
        sendToWebContents(event.sender, 'native-recording-event', payload);
        if (payload.event === 'started' || payload.event === 'captureStarted') {
          started = true;
          if (resolveStarted) resolveStarted();
        }
      } catch {
        sendToWebContents(event.sender, 'native-recording-event', { event: 'log', message: line });
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    sendToWebContents(event.sender, 'native-recording-event', { event: 'log', message: chunk.toString().trim() });
  });

  child.on('error', (error) => {
    cleanup();
    sendToWebContents(event.sender, 'native-recording-event', { event: 'error', message: error.message });
  });

  child.on('close', (code) => {
    const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    sendToWebContents(event.sender, 'native-recording-event', {
      event: code === 0 ? 'closed' : 'error',
      code,
      filePath,
      size,
      message: code === 0 ? '原生录制已结束。' : (stderr || `原生录制退出：${code}`)
    });
    cleanup();
  });

  await new Promise((resolve, reject) => {
    resolveStarted = () => {
      clearTimeout(timer);
      resolve();
      resolveStarted = null;
    };
    const timer = setTimeout(() => {
      if (started) resolve();
      else {
        child.kill('SIGTERM');
        cleanup();
        reject(new Error(stderr || '原生录屏助手启动超时，尚未真正开始录制。'));
      }
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      if (!started && code !== 0) {
        clearTimeout(timer);
        reject(new Error(stderr || `原生录屏助手退出：${code}`));
      }
    });
  });

  return { filePath };
});

ipcMain.handle('stop-native-recording', async () => {
  if (!nativeRecording) return null;
  nativeRecording.child.stdin.write('stop\n');
  return { filePath: nativeRecording.filePath };
});

ipcMain.handle('transcribe-media', async (event, options) => {
  const filePath = options.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('找不到要转写的文件。');
  }

  const jobDir = resolveJobDir(filePath, options);
  fs.mkdirSync(jobDir, { recursive: true });
  const jobId = options.jobId || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const args = [
    pythonScript,
    '--input', filePath,
    '--output-dir', jobDir,
    '--language', options.language || 'zh',
    '--model', options.model || 'small',
    '--style', options.style || 'clean',
    '--subtitle-mode', options.subtitleMode || 'off',
    '--dedupe-mode', options.dedupeMode || 'normal',
    ...organizerArgs(options)
  ];

  const handleProgressLine = (line) => {
    if (!line) return;
    if (line.startsWith(progressPrefix)) {
      try {
        const progress = JSON.parse(line.slice(progressPrefix.length));
        sendToWebContents(event.sender, 'job-progress', { jobId, filePath, ...progress });
      } catch {
        sendToWebContents(event.sender, 'job-log', { jobId, filePath, message: line });
      }
    } else {
      sendToWebContents(event.sender, 'job-log', { jobId, filePath, message: line });
    }
  };
  let pendingLogLine = '';
  sendToWebContents(event.sender, 'job-log', { jobId, filePath, message: `开始处理：${path.basename(filePath)}` });
  const result = await runTrackedCommand(jobId, resolvePython(), args, (text) => {
    pendingLogLine += text;
    const lines = pendingLogLine.split(/\r?\n/);
    pendingLogLine = lines.pop() || '';
    for (const line of lines.map((item) => item.trim()).filter(Boolean)) {
      handleProgressLine(line);
    }
  }, options.organizer === 'cloudai' && options.cloudAiApiKey
    ? { TRANSCRIBE_STUDIO_CLOUD_AI_API_KEY: String(options.cloudAiApiKey) }
    : {});
  handleProgressLine(pendingLogLine.trim());

  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const lastLine = lines[lines.length - 1] || '{}';
  let parsed;
  try {
    parsed = JSON.parse(lastLine);
  } catch (error) {
    throw new Error(`转写脚本没有返回有效结果：${lastLine}`);
  }
  return parsed;
});

ipcMain.handle('regenerate-template', async (event, options = {}) => {
  const segmentsPath = options.segmentsPath;
  if (!segmentsPath || !fs.existsSync(segmentsPath)) {
    throw new Error('找不到可复用的逐字稿 segments.json。');
  }
  const sourceName = safeName(options.sourceName || options.sourcePath || segmentsPath);
  const jobDir = path.join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${sourceName}-模板再生成`);
  fs.mkdirSync(jobDir, { recursive: true });
  const jobId = options.jobId || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const args = [
    pythonScript,
    '--input', options.sourcePath && fs.existsSync(options.sourcePath) ? options.sourcePath : segmentsPath,
    '--segments-json', segmentsPath,
    '--output-dir', jobDir,
    '--language', options.language || 'zh',
    '--style', options.style || 'clean',
    '--subtitle-mode', 'off',
    '--dedupe-mode', 'off',
    ...organizerArgs(options)
  ];
  const handleProgressLine = (line) => {
    if (!line) return;
    if (line.startsWith(progressPrefix)) {
      try {
        const progress = JSON.parse(line.slice(progressPrefix.length));
        sendToWebContents(event.sender, 'job-progress', { jobId, filePath: segmentsPath, ...progress });
      } catch {
        sendToWebContents(event.sender, 'job-log', { jobId, filePath: segmentsPath, message: line });
      }
    } else {
      sendToWebContents(event.sender, 'job-log', { jobId, filePath: segmentsPath, message: line });
    }
  };
  let pendingLogLine = '';
  sendToWebContents(event.sender, 'job-log', { jobId, filePath: segmentsPath, message: '开始换模板生成：复用已有逐字稿，不重新识别语音。' });
  const result = await runTrackedCommand(jobId, resolvePython(), args, (text) => {
    pendingLogLine += text;
    const lines = pendingLogLine.split(/\r?\n/);
    pendingLogLine = lines.pop() || '';
    for (const line of lines.map((item) => item.trim()).filter(Boolean)) handleProgressLine(line);
  }, options.organizer === 'cloudai' && options.cloudAiApiKey
    ? { TRANSCRIBE_STUDIO_CLOUD_AI_API_KEY: String(options.cloudAiApiKey) }
    : {});
  handleProgressLine(pendingLogLine.trim());
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const lastLine = lines[lines.length - 1] || '{}';
  try {
    return JSON.parse(lastLine);
  } catch {
    throw new Error(`换模板生成没有返回有效结果：${lastLine}`);
  }
});

ipcMain.handle('stop-transcription', async (_event, jobId) => {
  const tracked = activeTranscriptions.get(jobId);
  if (!tracked) return false;
  tracked.stopRequested = true;
  tracked.child.kill('SIGTERM');
  setTimeout(() => {
    const current = activeTranscriptions.get(jobId);
    if (current?.stopRequested) current.child.kill('SIGKILL');
  }, 2500);
  return true;
});

ipcMain.handle('open-path', async (_event, targetPath) => {
  if (!targetPath) return false;
  await shell.openPath(targetPath);
  return true;
});

ipcMain.handle('show-in-folder', async (_event, targetPath) => {
  if (!targetPath) return false;
  shell.showItemInFolder(targetPath);
  return true;
});

ipcMain.handle('restore-main-window', async () => {
  restoreMainWindow();
  return true;
});

ipcMain.handle('rename-path', async (_event, payload = {}) => {
  const sourcePath = payload.path;
  const requestedName = safeName(payload.name || '');
  if (!sourcePath || !requestedName || !fs.existsSync(sourcePath)) return { path: sourcePath };
  const parsed = path.parse(sourcePath);
  const targetPath = uniquePath(path.join(parsed.dir, `${requestedName}${parsed.ext}`));
  if (targetPath === sourcePath) return { path: sourcePath };
  fs.renameSync(sourcePath, targetPath);
  return { path: targetPath };
});

ipcMain.handle('check-openclaw', async (_event, options = {}) => checkOpenClawStatus(options));

ipcMain.handle('test-openclaw', async (_event, options = {}) => testOpenClawOrganizer(options));

ipcMain.handle('check-local-ai', async (_event, options = {}) => checkLocalAiStatus(options));

ipcMain.handle('test-local-ai', async (_event, options = {}) => testLocalAiOrganizer(options));

ipcMain.handle('check-cloud-ai', async (_event, options = {}) => checkCloudAiStatus(options));

ipcMain.handle('test-cloud-ai', async (_event, options = {}) => testCloudAiOrganizer(options));

ipcMain.handle('copy-text', async (_event, text = '') => {
  clipboard.writeText(String(text || ''));
  return true;
});

ipcMain.handle('app-info', async () => ({
  productName,
  appVersion,
  outputRoot,
  ffmpeg: resolveFfmpeg(),
  python: resolvePython(),
  pythonScript,
  openclaw: resolveOpenClawCommand(),
  platform: os.platform(),
  displays: screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    index,
    bounds: display.bounds,
    size: display.size,
    scaleFactor: display.scaleFactor
  }))
}));
