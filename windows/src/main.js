const { app, BrowserWindow, dialog, ipcMain, desktopCapturer, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
const projectRoot = isDev ? path.join(__dirname, '..') : process.resourcesPath;
const pythonScript = path.join(projectRoot, 'python', 'transcribe.py');
const nativeRecorderPath = path.join(projectRoot, 'native', 'bin', 'native-recorder');
const outputRoot = path.join(app.getPath('documents'), 'TranscribeStudio');

let mainWindow;
let widgetWindow;
let nativeRecording = null;
const activeRecordings = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    title: '本机语音转写工坊',
    backgroundColor: '#f6f4ee',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow;
  widgetWindow = new BrowserWindow({
    width: 430,
    height: 74,
    minWidth: 360,
    minHeight: 74,
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
      nodeIntegration: false
    }
  });
  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.loadFile(path.join(__dirname, 'widget.html'));
  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
  return widgetWindow;
}

app.whenReady().then(() => {
  fs.mkdirSync(outputRoot, { recursive: true });
  configureCapturePermissions();
  createWindow();
  createWidgetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function safeName(input) {
  const base = path.basename(input || 'media').replace(/\.[^.]+$/, '');
  return base.replace(/[^\p{L}\p{N}_ -]+/gu, '').trim().slice(0, 80) || 'media';
}

function resolvePython() {
  const bundledVenvPython = isDev
    ? path.join(projectRoot, '.venv', 'bin', 'python')
    : path.join(process.resourcesPath, '.venv', 'bin', 'python');
  const candidates = [
    process.env.TRANSCRIBE_STUDIO_PYTHON,
    bundledVenvPython,
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    'python3'
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === 'python3' || fs.existsSync(candidate)) || 'python3';
}

function runCommand(command, args, onData) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: process.env });
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

ipcMain.handle('choose-media', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择短视频或音频',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '音视频文件', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  if (result.canceled) return [];
  return result.filePaths;
});

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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-control', command);
  }
  return true;
});

ipcMain.handle('recording-widget-state', async (_event, state) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('recording-state', state);
  }
  return true;
});

ipcMain.handle('native-recorder-available', async () => (
  process.platform === 'darwin' && fs.existsSync(nativeRecorderPath)
));

ipcMain.handle('start-native-recording', async (event) => {
  if (!fs.existsSync(nativeRecorderPath)) {
    throw new Error('原生录屏助手不存在。');
  }
  if (nativeRecording) {
    throw new Error('已有原生录制正在进行。');
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  const filePath = path.join(outputRoot, `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`);
  const child = spawn(nativeRecorderPath, ['start', filePath], { stdio: ['pipe', 'pipe', 'pipe'] });
  nativeRecording = { child, filePath, sender: event.sender };
  let started = false;
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
        event.sender.send('native-recording-event', payload);
        if (payload.event === 'started' || payload.event === 'captureStarted') started = true;
      } catch {
        event.sender.send('native-recording-event', { event: 'log', message: line });
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    event.sender.send('native-recording-event', { event: 'log', message: chunk.toString().trim() });
  });

  child.on('error', (error) => {
    cleanup();
    event.sender.send('native-recording-event', { event: 'error', message: error.message });
  });

  child.on('close', (code) => {
    const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    event.sender.send('native-recording-event', {
      event: code === 0 ? 'closed' : 'error',
      code,
      filePath,
      size,
      message: code === 0 ? '原生录制已结束。' : (stderr || `原生录制退出：${code}`)
    });
    cleanup();
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (started || child.exitCode === null) resolve();
      else reject(new Error(stderr || '原生录屏助手启动超时。'));
    }, 1200);
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

  const jobDir = path.join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeName(filePath)}`);
  fs.mkdirSync(jobDir, { recursive: true });

  const args = [
    pythonScript,
    '--input', filePath,
    '--output-dir', jobDir,
    '--language', options.language || 'zh',
    '--model', options.model || 'small',
    '--style', options.style || 'clean'
  ];

  event.sender.send('job-log', { filePath, message: `开始处理：${path.basename(filePath)}` });
  const result = await runCommand(resolvePython(), args, (text) => {
    event.sender.send('job-log', { filePath, message: text.trim() });
  });

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

ipcMain.handle('app-info', async () => ({
  outputRoot,
  ffmpeg: '/opt/homebrew/bin/ffmpeg',
  python: resolvePython(),
  pythonScript,
  platform: os.platform()
}));
