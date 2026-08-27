// Service worker: coordinator. Owns no audio itself — creates/talks to the
// offscreen document, runs the now-playing poller, and updates the badge.

import { MessageType } from './lib/messages.js';
import { getState, setState, addToHistory } from './lib/state.js';
import { fetchLive } from './lib/api.js';

const OFFSCREEN_URL = 'offscreen.html';
const LIVE_POLL_ALARM = 'nts-live-poll';
const LIVE_POLL_PERIOD_MIN = 0.5; // 30s, the chrome.alarms floor

let lastLiveTitleByChannel = {};
let offscreenReady = false;
let offscreenReadyResolvers = [];

function waitForOffscreenReady() {
  if (offscreenReady) return Promise.resolve();
  return new Promise((resolve) => offscreenReadyResolvers.push(resolve));
}

async function ensureOffscreenDocument() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) {
    // Document already exists — if it sent OFFSCREEN_READY before this
    // service worker instance started, we'll never see it again. Treat
    // an existing document as ready.
    offscreenReady = true;
    return;
  }
  offscreenReady = false;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Plays NTS live/mixtape audio continuously while the popup is closed.',
  });
  return waitForOffscreenReady();
}

function toOffscreen(type, payload) {
  return chrome.runtime.sendMessage({ type, payload, target: 'offscreen' });
}

async function updateBadge(playing) {
  await chrome.action.setBadgeText({ text: playing ? '▶' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#1db954' });
}

async function setLivePolling(enabled) {
  await chrome.alarms.clear(LIVE_POLL_ALARM);
  if (enabled) {
    chrome.alarms.create(LIVE_POLL_ALARM, { periodInMinutes: LIVE_POLL_PERIOD_MIN });
    await pollLive();
  }
}

async function pollLive() {
  try {
    const channels = await fetchLive();
    const state = await getState();
    for (const channel of channels) {
      const prevTitle = lastLiveTitleByChannel[channel.channelName];
      if (prevTitle && channel.now.title && prevTitle !== channel.now.title) {
        chrome.notifications.create(`nts-now-playing-${channel.channelName}`, {
          type: 'basic',
          iconUrl: 'icons/48.png',
          title: `NTS ${channel.channelName} now playing`,
          message: channel.now.title,
        });
      }
      lastLiveTitleByChannel[channel.channelName] = channel.now.title;
    }
    await setState({ liveChannels: channels });
    if (state.source?.type === 'live') {
      const active = channels.find((c) => String(c.channelName) === String(state.source.id));
      chrome.runtime.sendMessage({
        type: MessageType.NOW_PLAYING_UPDATE,
        payload: { source: state.source, live: active },
      }).catch(() => {});
    }
  } catch (err) {
    // Network hiccup — next 30s tick will retry.
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LIVE_POLL_ALARM) pollLive();
});

async function handlePopupMessage(message, sendResponse) {
  try {
  const { type, payload } = message;
  switch (type) {
    case MessageType.STATE_REQUEST: {
      const state = await getState();
      sendResponse(state);
      break;
    }
    case MessageType.SET_SOURCE: {
      await ensureOffscreenDocument();
      const state = await getState();
      await toOffscreen(MessageType.SET_SOURCE, { ...payload, volume: state.volume, autoplay: true });
      await setState({ source: payload, playing: true });
      await addToHistory({ type: payload.type, id: payload.id, title: payload.title, artworkUrl: payload.artworkUrl, streamUrl: payload.streamUrl });
      await updateBadge(true);
      await setLivePolling(payload.type === 'live');
      sendResponse({ ok: true });
      break;
    }
    case MessageType.PLAY: {
      await ensureOffscreenDocument();
      await toOffscreen(MessageType.PLAY);
      await setState({ playing: true });
      await updateBadge(true);
      sendResponse({ ok: true });
      break;
    }
    case MessageType.PAUSE: {
      await toOffscreen(MessageType.PAUSE);
      await setState({ playing: false });
      await updateBadge(false);
      sendResponse({ ok: true });
      break;
    }
    case MessageType.STOP: {
      await toOffscreen(MessageType.STOP);
      await setState({ playing: false });
      await updateBadge(false);
      await setLivePolling(false);
      sendResponse({ ok: true });
      break;
    }
    case MessageType.SET_VOLUME: {
      await toOffscreen(MessageType.SET_VOLUME, payload);
      await setState({ volume: payload.volume });
      sendResponse({ ok: true });
      break;
    }
    default:
      sendResponse({ ok: false, error: `unhandled type ${type}` });
  }
  } catch (err) {
    sendResponse({ ok: false, error: String(err) });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen') return false; // not for us
  if (message.target === 'background' &&
      [MessageType.PLAY, MessageType.PAUSE, MessageType.STOP, MessageType.AUDIO_ERROR, MessageType.OFFSCREEN_READY]
        .includes(message.type) &&
      sender.url?.includes(OFFSCREEN_URL)) {
    // Status echo from the offscreen doc (e.g. media-key driven play/pause).
    if (message.type === MessageType.OFFSCREEN_READY) {
      offscreenReady = true;
      offscreenReadyResolvers.forEach((r) => r());
      offscreenReadyResolvers = [];
    }
    if (message.type === MessageType.PLAY) setState({ playing: true }).then(() => updateBadge(true));
    if (message.type === MessageType.PAUSE) setState({ playing: false }).then(() => updateBadge(false));
    if (message.type === MessageType.AUDIO_ERROR) setState({ playing: false }).then(() => updateBadge(false));
    return false;
  }
  handlePopupMessage(message, sendResponse);
  return true; // keep the channel open for the async sendResponse
});

// Resume live polling if the worker restarts mid-session with a live source active.
getState().then((state) => {
  if (state.source?.type === 'live' && state.playing) setLivePolling(true);
});
