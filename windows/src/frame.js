const frame = document.querySelector('#frame');
const fullScreen = document.querySelector('#fullScreen');
const regionMode = document.querySelector('#regionMode');
const stopFrame = document.querySelector('#stopFrame');
const startRecording = document.querySelector('#startRecording');
const modeText = document.querySelector('#modeText');
const sizeText = document.querySelector('#sizeText');

let mode = 'region';

function updateText() {
  modeText.textContent = mode === 'screen' ? '全屏录制' : '框选录制';
  sizeText.textContent = `${window.innerWidth} x ${window.innerHeight}`;
}

function refreshModeButtons() {
  const paused = document.body.classList.contains('is-paused');
  fullScreen.hidden = mode === 'screen' || paused;
  regionMode.hidden = mode !== 'screen';
}

function setMode(nextMode) {
  mode = nextMode;
  refreshModeButtons();
  updateText();
}

function setFrameMode(nextMode) {
  const recording = nextMode === 'recording';
  const paused = nextMode === 'paused';
  frame.classList.toggle('setup', !recording && !paused);
  frame.classList.toggle('recording', recording);
  frame.classList.toggle('paused', paused);
  document.body.classList.toggle('is-recording', recording || paused);
  document.body.classList.toggle('is-paused', paused);
  refreshModeButtons();
}

fullScreen.addEventListener('click', async (event) => {
  event.stopPropagation();
  await window.studio.recordingFrameCommand('fullscreen');
  setMode('screen');
});

regionMode.addEventListener('click', async (event) => {
  event.stopPropagation();
  await window.studio.recordingFrameCommand('region');
  setMode('region');
});

startRecording.addEventListener('click', async (event) => {
  event.stopPropagation();
  await window.studio.recordingControl('start');
});

stopFrame.addEventListener('click', async (event) => {
  event.stopPropagation();
  await window.studio.recordingControl('stop');
});

window.addEventListener('resize', updateText);

window.studio.onRecordingState((state) => {
  const paused = state.status === 'paused';
  if (!document.body.classList.contains('is-recording')) return;
  frame.classList.toggle('recording', !paused);
  frame.classList.toggle('paused', paused);
});

window.studio.onRecordingFrameMode((nextMode) => {
  setFrameMode(nextMode);
});

window.__getRecordingFrame = () => ({
  mode,
  bounds: {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight
  }
});

setMode('region');
setFrameMode('setup');
