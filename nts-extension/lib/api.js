// NTS API client.
//
// UNVERIFIED: every endpoint and field name below is taken from the public
// nts.live site behavior as of the time this was written, not from a live
// request (this build environment had no network access to nts.live).
// Before relying on this in production, open the network tab on nts.live
// and nts.live/search and diff the real responses against the parsing
// below. All parsing here is defensive (falls back to several possible
// field names / shapes) specifically because of that uncertainty.

const API_BASE = 'https://www.nts.live/api/v2';

// UNVERIFIED stream URLs — confirm via the <audio>/player config on nts.live
// if these 404.
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

// Normalizes one entry of GET /live into a stable shape regardless of which
// field-name variant the real API uses.
function parseLiveChannel(entry) {
  const now = entry.now || entry.current || {};
  const next = entry.next || {};
  const details = now.embeds?.details || now.details || {};
  return {
    channelName: firstDefined(entry.channel_name, entry.channelName, entry.channel),
    now: {
      title: firstDefined(now.broadcast_title, now.title, now.name),
      startTimestamp: firstDefined(now.start_timestamp, now.startTimestamp),
      endTimestamp: firstDefined(now.end_timestamp, now.endTimestamp),
      artworkUrl: firstDefined(
        details.artwork_url,
        details.picture_large,
        details.artwork,
        now.artwork_url
      ),
      location: details.location,
      description: details.description,
      links: details.links,
    },
    next: {
      title: firstDefined(next.broadcast_title, next.title, next.name),
      startTimestamp: firstDefined(next.start_timestamp, next.startTimestamp),
    },
  };
}

export async function fetchLive() {
  const json = await getJson(`${API_BASE}/live`);
  const results = json.results || json.data || [];
  return results.map(parseLiveChannel);
}

function parseMixtape(entry) {
  return {
    id: firstDefined(entry.alias, entry.id, entry.slug),
    title: firstDefined(entry.title, entry.name),
    description: entry.description,
    tags: firstDefined(entry.mood, entry.genre, entry.tags) || [],
    artworkUrl: firstDefined(
      entry.media?.picture_large,
      entry.artwork_url,
      entry.image
    ),
    streamUrl: firstDefined(
      entry.audio_stream_endpoint,
      entry.audioStreamEndpoint,
      entry.stream_url
    ),
  };
}

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

// UNVERIFIED path/params — confirm via network tab on nts.live/search.
export async function search(query, types = ['show', 'episode']) {
  const params = new URLSearchParams({ q: query });
  types.forEach((t) => params.append('types[]', t));
  const json = await getJson(`${API_BASE}/search?${params.toString()}`);
  const results = json.results || json.data || [];
  return results.map(parseSearchResult);
}
