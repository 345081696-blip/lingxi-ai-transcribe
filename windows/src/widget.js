const pause = document.querySelector('#pause');
const resume = document.querySelector('#resume');
const stop = document.querySelector('#stop');
const label = document.querySelector('#label');
const timer = document.querySelector('#timer');
const dot = document.querySelector('#dot');

pause.addEventListener('click', () => window.studio.recordingControl('pause'));
resume.addEventListener('click', () => window.studio.recordingControl('resume'));
stop.addEventListener('click', () => window.studio.recordingControl('stop'));

function formatTime(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

window.studio.onRecordingState((state) => {
  const paused = state.status === 'paused';
  label.textContent = paused ? '已暂停' : '正在录制';
  timer.textContent = formatTime(state.elapsed || 0);
  pause.hidden = paused;
  resume.hidden = !paused;
  dot.classList.toggle('paused', paused);
});
