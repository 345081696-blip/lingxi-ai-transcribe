const pause = document.querySelector('#pause');
const resume = document.querySelector('#resume');
const stop = document.querySelector('#stop');
const timer = document.querySelector('#timer');
const remainingTime = document.querySelector('#remainingTime');
const dot = document.querySelector('#dot');
const stateText = document.querySelector('#stateText');
const audioLabel = document.querySelector('#audioLabel');
const widget = document.querySelector('.widget');

let currentState = {
  status: 'ready',
  elapsed: 0,
  remaining: 0,
  receivedAt: Date.now()
};
let timerInterval = null;

pause.addEventListener('click', () => window.studio.recordingControl('pause'));
resume.addEventListener('click', () => window.studio.recordingControl('resume'));
stop.addEventListener('click', () => window.studio.recordingControl('stop'));

function formatTime(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function liveElapsed() {
  if (currentState.status !== 'recording') return currentState.elapsed || 0;
  return (currentState.elapsed || 0) + Math.floor((Date.now() - currentState.receivedAt) / 1000);
}

function liveRemaining() {
  if (!(currentState.remaining > 0)) return 0;
  if (currentState.status !== 'recording') return currentState.remaining;
  return Math.max(0, currentState.remaining - Math.floor((Date.now() - currentState.receivedAt) / 1000));
}

function renderState() {
  const state = currentState;
  const ready = state.status === 'ready';
  const paused = state.status === 'paused';
  timer.textContent = formatTime(liveElapsed());
  const remaining = liveRemaining();
  if (remaining > 0) {
    remainingTime.hidden = false;
    remainingTime.textContent = `剩余 ${formatTime(remaining)}`;
  } else {
    remainingTime.hidden = true;
    remainingTime.textContent = '';
  }
  stateText.textContent = ready ? '准备录制' : (paused ? '暂停中' : '录制中');
  audioLabel.textContent = state.pauseHint || state.audioLabel || '系统声音';
  audioLabel.classList.toggle('warn', Boolean(state.pauseHint));
  widget.classList.toggle('ready', ready);
  widget.classList.toggle('paused', paused);
  pause.disabled = state.canPause === false;
  resume.disabled = state.canPause === false;
  stop.disabled = false;
  pause.hidden = ready || paused;
  resume.hidden = !paused;
  dot.classList.toggle('paused', paused);
  dot.classList.toggle('ready', ready);
}

function ensureLocalTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(renderState, 500);
}

window.studio.onRecordingState((state) => {
  currentState = {
    ...currentState,
    ...state,
    elapsed: Number(state.elapsed || 0),
    remaining: Number(state.remaining || 0),
    receivedAt: Date.now()
  };
  renderState();
  ensureLocalTimer();
});
