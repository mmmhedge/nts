import { MessageType, send } from './lib/messages.js';
import { getState, toggleFavorite, isFavorite } from './lib/state.js';
import { fetchLive, fetchMixtapes, search, LIVE_STREAMS } from './lib/api.js';

const els = {
  tabs: document.querySelectorAll('.tab-btn'),
  panels: { stations: document.getElementById('tab-stations'), search: document.getElementById('tab-search') },
  npArtwork: document.getElementById('np-artwork'),
  npTitle: document.getElementById('np-title'),
  npSub: document.getElementById('np-sub'),
  npRemaining: document.getElementById('np-remaining'),
  npFavorite: document.getElementById('np-favorite'),
  playPause: document.getElementById('play-pause'),
  volume: document.getElementById('volume'),
  historyList: document.getElementById('history-list'),
  favoritesList: document.getElementById('favorites-list'),
  liveList: document.getElementById('live-list'),
  mixtapeList: document.getElementById('mixtape-list'),

  searchInput: document.getElementById('search-input'),
  searchResults: document.getElementById('search-results'),
  errorBanner: document.getElementById('error-banner'),
};

let liveChannels = [];
let mixtapes = [];
let remainingTimer = null;
let currentLiveEnd = null;

function showError(msg) {
  els.errorBanner.textContent = msg || '';
}

function itemRow({ title, sub, artworkUrl, onClick }) {
  const li = document.createElement('li');
  const img = document.createElement('img');
  img.src = artworkUrl || '';
  const text = document.createElement('div');
  text.className = 'item-text';
  const titleEl = document.createElement('div');
  titleEl.className = 'item-title';
  titleEl.textContent = title;
  text.appendChild(titleEl);
  if (sub) {
    const subEl = document.createElement('div');
    subEl.className = 'item-sub';
    subEl.textContent = sub;
    text.appendChild(subEl);
  }
  li.appendChild(img);
  li.appendChild(text);
  li.addEventListener('click', onClick);
  return li;
}

async function playSource(source) {
  await send(MessageType.SET_SOURCE, source);
  await render();
}

function liveSourceFromChannel(channel) {
  return {
    type: 'live',
    id: channel.channelName,
    title: channel.now.title || `NTS ${channel.channelName}`,
    artworkUrl: channel.now.artworkUrl,
    streamUrl: LIVE_STREAMS[channel.channelName] || LIVE_STREAMS[String(channel.channelName)],
  };
}

function mixtapeSource(m) {
  return { type: 'mixtape', id: m.id, title: m.title, artworkUrl: m.artworkUrl, streamUrl: m.streamUrl };
}

function renderLive() {
  els.liveList.innerHTML = '';
  liveChannels.forEach((channel) => {
    els.liveList.appendChild(
      itemRow({
        title: `NTS ${channel.channelName} — ${channel.now.title || 'Live'}`,
        sub: channel.now.location,
        artworkUrl: channel.now.artworkUrl,
        onClick: () => playSource(liveSourceFromChannel(channel)),
      })
    );
  });
}

function renderMixtapes() {
  els.mixtapeList.innerHTML = '';
  mixtapes.forEach((m) => {
    els.mixtapeList.appendChild(
      itemRow({
        title: m.title,
        sub: m.subtitle,
        artworkUrl: m.artworkUrl,
        onClick: () => playSource(mixtapeSource(m)),
      })
    );
  });
}

async function renderHistoryAndFavorites() {
  const state = await getState();
  els.historyList.innerHTML = '';
  state.history.forEach((item) => {
    els.historyList.appendChild(
      itemRow({
        title: item.title,
        artworkUrl: item.artworkUrl,
        onClick: () => playSource(resolveStreamForItem(item)),
      })
    );
  });
  els.favoritesList.innerHTML = '';
  state.favorites.forEach((item) => {
    els.favoritesList.appendChild(
      itemRow({
        title: item.title,
        artworkUrl: item.artworkUrl,
        onClick: () => playSource(resolveStreamForItem(item)),
      })
    );
  });
}

function resolveStreamForItem(item) {
  if (item.type === 'live') {
    const channel = liveChannels.find((c) => String(c.channelName) === String(item.id));
    return channel ? liveSourceFromChannel(channel) : { ...item, streamUrl: LIVE_STREAMS[item.id] };
  }
  const mixtape = mixtapes.find((m) => m.id === item.id);
  return mixtape ? mixtapeSource(mixtape) : item;
}

function tickRemaining() {
  clearInterval(remainingTimer);
  if (!currentLiveEnd) {
    els.npRemaining.textContent = '';
    return;
  }
  remainingTimer = setInterval(() => {
    const ms = new Date(currentLiveEnd).getTime() - Date.now();
    if (ms <= 0) {
      els.npRemaining.textContent = '';
      clearInterval(remainingTimer);
      return;
    }
    const mins = Math.floor(ms / 60000);
    els.npRemaining.textContent = `${mins} min remaining`;
  }, 1000);
}

async function renderNowPlaying(state) {
  const source = state.source;
  els.npTitle.textContent = source ? source.title : 'Nothing playing';
  els.npArtwork.src = source?.artworkUrl || 'icons/48.png';
  els.npSub.textContent = source ? (source.type === 'live' ? `NTS ${source.id}` : 'Infinite Mixtape') : '';
  els.playPause.textContent = state.playing ? '⏸' : '▶';
  els.volume.value = state.volume;

  currentLiveEnd = null;
  if (source?.type === 'live') {
    const channel = liveChannels.find((c) => String(c.channelName) === String(source.id));
    if (channel?.now?.endTimestamp) currentLiveEnd = channel.now.endTimestamp;
  }
  tickRemaining();

  const fav = source ? await isFavorite({ type: source.type, id: source.id }) : false;
  els.npFavorite.classList.toggle('active', fav);
}

async function render() {
  const state = await getState();
  await renderNowPlaying(state);
  await renderHistoryAndFavorites();
}

function renderSearchResults(results) {
  els.searchResults.innerHTML = '';
  results.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'search-result';

    const img = document.createElement('img');
    img.src = r.artworkUrl || '';

    const text = document.createElement('div');
    text.className = 'search-result-text';

    const title = document.createElement('div');
    title.className = 'search-title';
    title.textContent = r.title;

    const meta = document.createElement('div');
    meta.className = 'search-meta';
    meta.textContent = [r.type, r.location, r.date, r.genres.join(', ')].filter(Boolean).join(' · ');

    const links = document.createElement('div');
    links.className = 'search-links';
    if (r.ntsUrl) links.appendChild(linkBtn('NTS', r.ntsUrl));
    if (r.mixcloudUrl) links.appendChild(linkBtn('Mixcloud', r.mixcloudUrl));
    if (r.soundcloudUrl) links.appendChild(linkBtn('SoundCloud', r.soundcloudUrl));

    text.appendChild(title);
    text.appendChild(meta);
    if (links.children.length) text.appendChild(links);
    li.appendChild(img);
    li.appendChild(text);
    els.searchResults.appendChild(li);
  });
}

function linkBtn(label, url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.className = 'link-btn';
  a.textContent = label;
  return a;
}


let searchDebounce = null;
els.searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = els.searchInput.value.trim();
  if (!q) {
    els.searchResults.innerHTML = '';
    return;
  }
  searchDebounce = setTimeout(async () => {
    try {
      const results = await search(q);
      renderSearchResults(results);
      showError('');
    } catch (err) {
      showError("Couldn't reach NTS search.");
    }
  }, 350);
});

els.tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    els.tabs.forEach((b) => b.classList.toggle('active', b === btn));
    Object.entries(els.panels).forEach(([key, panel]) =>
      panel.classList.toggle('hidden', key !== btn.dataset.tab)
    );
  });
});

els.playPause.addEventListener('click', async () => {
  const state = await getState();
  if (!state.source) return;
  if (state.playing) {
    await send(MessageType.PAUSE);
  } else {
    await send(MessageType.PLAY);
  }
  await render();
});

els.volume.addEventListener('input', async () => {
  await send(MessageType.SET_VOLUME, { volume: Number(els.volume.value) });
});

els.npFavorite.addEventListener('click', async () => {
  const state = await getState();
  if (!state.source) return;
  await toggleFavorite({
    type: state.source.type,
    id: state.source.id,
    title: state.source.title,
    artworkUrl: state.source.artworkUrl,
  });
  await render();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MessageType.NOW_PLAYING_UPDATE) {
    render();
  }
});

async function init() {
  try {
    [liveChannels, mixtapes] = await Promise.all([fetchLive(), fetchMixtapes()]);
  } catch (err) {
    showError("Couldn't reach NTS.");
  }
  renderLive();
  renderMixtapes();
  await render();
}

init();
