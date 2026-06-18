// Shared message-type protocol for popup <-> background <-> offscreen.

export const MessageType = {
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  STOP: 'STOP',
  SET_SOURCE: 'SET_SOURCE',
  SET_VOLUME: 'SET_VOLUME',
  STATE_REQUEST: 'STATE_REQUEST',
  STATE_UPDATE: 'STATE_UPDATE',
  NOW_PLAYING_UPDATE: 'NOW_PLAYING_UPDATE',
  AUDIO_ERROR: 'AUDIO_ERROR',
  OFFSCREEN_READY: 'OFFSCREEN_READY',
};

export function send(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}
