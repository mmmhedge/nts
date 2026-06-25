// NTS API client.
// Live response shape verified against real /api/v2/live output (2026-06-25).
// Stream URLs confirmed working. /mixtapes and /search remain unverified —
// see comments on those functions.

const API_BASE = 'https://www.nts.live/api/v2';

// Stream URLs confirmed working 2026-06-25.
export const LIVE_STREAMS = {
  1: 'https://stream-relay-geo.ntslive.net/stream',
  2: 'https://stream-relay-geo.ntslive.net/stream2',
};

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`NTS API ${res.status} for ${url}`);
  }
  return res.json();
}

function firstDefined(...values) {
  return values.find((v) => v !== undefined && v !== null);
}

// Verified against real /api/v2/live response.
// Artwork lives at now.embeds.details.media.picture_large.
function parseLiveChannel(entry) {
  const now = entry.now || {};
  const next = entry.next || {};
  const details = now.embeds?.details || {};
  const media = details.media || {};
  return {
    channelName: entry.channel_name,
    now: {
      title: now.broadcast_title,
      startTimestamp: now.start_timestamp,
      endTimestamp: now.end_timestamp,
      artworkUrl: media.picture_large || media.picture_medium_large,
      location: details.location_long,
      description: details.description,
      genres: details.genres || [],
      moods: details.moods || [],
    },
    next: {
      title: next.broadcast_title,
      startTimestamp: next.start_timestamp,
    },
  };
}

export async function fetchLive() {
  const json = await getJson(`${API_BASE}/live`);
  const results = json.results || json.data || [];
  return results.map(parseLiveChannel);
}

// Verified against real /api/v2/mixtapes response.
// id = mixtape_alias, artwork at entry.media.picture_large, no genre/mood tags.
function parseMixtape(entry) {
  return {
    id: entry.mixtape_alias,
    title: entry.title,
    subtitle: entry.subtitle,
    description: entry.description,
    artworkUrl: entry.media?.picture_large,
    streamUrl: entry.audio_stream_endpoint,
  };
}

// UNVERIFIED: confirm field names against real /api/v2/mixtapes response.
export async function fetchMixtapes() {
  const json = await getJson(`${API_BASE}/mixtapes`);
  const results = json.results || json.data || [];
  return results.map(parseMixtape);
}

export async function fetchShow(alias) {
  return getJson(`${API_BASE}/shows/${encodeURIComponent(alias)}`);
}

export async function fetchEpisodes(alias, { offset = 0, limit = 20 } = {}) {
  const url = `${API_BASE}/shows/${encodeURIComponent(alias)}/episodes?offset=${offset}&limit=${limit}`;
  const json = await getJson(url);
  return json.results || json.data || [];
}

function parseSearchResult(entry) {
  const isEpisode = firstDefined(entry.episode_alias, entry.type === 'episode');
  return {
    type: isEpisode ? 'episode' : 'show',
    title: firstDefined(entry.name, entry.title, entry.broadcast_title),
    host: firstDefined(entry.host, entry.location_long, entry.subtitle),
    date: firstDefined(entry.broadcast_date, entry.date, entry.created),
    artworkUrl: firstDefined(
      entry.media?.picture_large,
      entry.artwork_url,
      entry.image
    ),
    ntsUrl: firstDefined(entry.url, entry.share_url),
    mixcloudUrl: entry.mixcloud_url || entry.embeds?.mixcloud,
    soundcloudUrl: entry.soundcloud_url || entry.embeds?.soundcloud,
    tracklist: entry.tracklist || entry.embeds?.tracklist || null,
  };
}

// Endpoint and params verified from real network traffic on nts.live/search.
const SEARCH_TYPES = ['show', 'episode', 'collection', 'video', 'artist', 'project', 'podcast'];

export async function search(query, { offset = 0, limit = 36 } = {}) {
  const params = new URLSearchParams({ q: query, version: '2', offset, limit });
  SEARCH_TYPES.forEach((t) => params.append('types[]', t));
  const json = await getJson(`${API_BASE}/search?${params.toString()}`);
  const results = json.results || json.data || [];
  return results.map(parseSearchResult);
}
