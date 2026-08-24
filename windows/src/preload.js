const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  chooseMedia: () => ipcRenderer.invoke('choose-media'),
  beginRecordingFile: (payload) => ipcRenderer.invoke('begin-recording-file', payload),
  appendRecordingChunk: (payload) => ipcRenderer.invoke('append-recording-chunk', payload),
  finishRecordingFile: (payload) => ipcRenderer.invoke('finish-recording-file', payload),
  transcribeMedia: (options) => ipcRenderer.invoke('transcribe-media', options),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  showInFolder: (targetPath) => ipcRenderer.invoke('show-in-folder', targetPath),
  appInfo: () => ipcRenderer.invoke('app-info'),
  showRecordingWidget: () => ipcRenderer.invoke('show-recording-widget'),
  hideRecordingWidget: () => ipcRenderer.invoke('hide-recording-widget'),
  nativeRecorderAvailable: () => ipcRenderer.invoke('native-recorder-available'),
  startNativeRecording: () => ipcRenderer.invoke('start-native-recording'),
  stopNativeRecording: () => ipcRenderer.invoke('stop-native-recording'),
  recordingControl: (command) => ipcRenderer.invoke('recording-control', command),
  recordingWidgetState: (state) => ipcRenderer.invoke('recording-widget-state', state),
  onJobLog: (handler) => ipcRenderer.on('job-log', (_event, payload) => handler(payload)),
  onRecordingControl: (handler) => ipcRenderer.on('recording-control', (_event, command) => handler(command)),
  onRecordingState: (handler) => ipcRenderer.on('recording-state', (_event, state) => handler(state)),
  onNativeRecordingEvent: (handler) => ipcRenderer.on('native-recording-event', (_event, payload) => handler(payload))
});
