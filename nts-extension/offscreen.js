// Offscreen document: the only place that owns an <audio> element.
// Receives playback commands from background.js, never talks to the NTS API.

import { MessageType } from './lib/messages.js';

const audio = new Audio();
audio.crossOrigin = 'anonymous';

let retryTimer = null;

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    if (audio.src) {
      audio.load();
      audio.play().catch(() => {});
    }
  }, 3000);
}

audio.addEventListener('error', () => {
  chrome.runtime.sendMessage({ type: MessageType.AUDIO_ERROR, target: 'background' });
  scheduleRetry();
});
audio.addEventListener('stalled', scheduleRetry);
audio.addEventListener('playing', () => clearTimeout(retryTimer));

function setMediaSession(meta) {
  if (!('mediaSession' in navigator) || !meta) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: meta.title || 'NTS',
    artist: meta.artist || '',
    artwork: meta.artworkUrl ? [{ src: meta.artworkUrl, sizes: '512x512', type: 'image/png' }] : [],
  });
}

navigator.mediaSession?.setActionHandler('play', () => {
  audio.play().catch(() => {});
  chrome.runtime.sendMessage({ type: MessageType.PLAY, target: 'background' });
});
navigator.mediaSession?.setActionHandler('pause', () => {
  audio.pause();
  chrome.runtime.sendMessage({ type: MessageType.PAUSE, target: 'background' });
});
navigator.mediaSession?.setActionHandler('stop', () => {
  audio.pause();
  audio.removeAttribute('src');
  chrome.runtime.sendMessage({ type: MessageType.STOP, target: 'background' });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== 'offscreen') return;
  const { type, payload } = message;
  switch (type) {
    case MessageType.SET_SOURCE:
      audio.pause();
      audio.src = payload.streamUrl;
      audio.load();
      audio.volume = payload.volume ?? audio.volume;
      setMediaSession(payload);
      if (payload.autoplay) {
        audio.play().catch(() => {});
      }
      break;
    case MessageType.PLAY:
      audio.play().catch(() => {});
      break;
    case MessageType.PAUSE:
      audio.pause();
      break;
    case MessageType.STOP:
      audio.pause();
      audio.removeAttribute('src');
      break;
    case MessageType.SET_VOLUME:
      audio.volume = payload.volume;
      break;
    default:
      break;
  }
});

chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_READY, target: 'background' });
