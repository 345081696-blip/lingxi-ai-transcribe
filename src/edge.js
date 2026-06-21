const edge = document.querySelector('#edge');

window.studio.onRecordingState((state) => {
  const paused = state.status === 'paused';
  edge.classList.toggle('paused', paused);
  edge.classList.toggle('recording', !paused);
});
