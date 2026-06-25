// chrome.storage.local helpers for persisted extension state.

const DEFAULT_STATE = {
  source: null,        // { type: 'live'|'mixtape', id, title, artworkUrl, streamUrl }
  playing: false,
  volume: 1,
  favorites: [],        // [{ type, id, title, artworkUrl }]
  history: [],           // same shape, most recent first, capped
};

const HISTORY_LIMIT = 2;

export async function getState() {
  const stored = await chrome.storage.local.get('ntsState');
  return { ...DEFAULT_STATE, ...(stored.ntsState || {}) };
}

export async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ ntsState: next });
  return next;
}

export async function addToHistory(item) {
  const current = await getState();
  const filtered = current.history.filter(
    (h) => !(h.type === item.type && h.id === item.id)
  );
  const history = [item, ...filtered].slice(0, HISTORY_LIMIT);
  return setState({ history });
}

export async function toggleFavorite(item) {
  const current = await getState();
  const exists = current.favorites.some(
    (f) => f.type === item.type && f.id === item.id
  );
  const favorites = exists
    ? current.favorites.filter((f) => !(f.type === item.type && f.id === item.id))
    : [...current.favorites, item];
  return setState({ favorites });
}

export async function isFavorite(item) {
  const current = await getState();
  return current.favorites.some((f) => f.type === item.type && f.id === item.id);
}
