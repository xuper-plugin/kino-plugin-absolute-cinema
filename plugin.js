// @ts-check
/// <reference path="./kino.d.ts" />
// Absolute Cinema: a bridge between Kino and an Absolute Cinema addon (Stremio protocol); the address is a setting. The addon has no catalog of movies and series, only
// the video for a title by its IMDb id, plus a live TV catalog; the titles come from Kino's own TMDB access (kino.tmdb,
// kino.meta) and the video from the server. The server owns the sources and their upkeep; this file knows nothing about
// any of them and reads the live TV catalog and its genres from the server's manifest on every run.
// Read it top to bottom: 1. texts  2. http  3. manifest  4. TMDB  5. titles  6. rows  7. streams  8. live  9. settings

// The addon's address is the person's own (their configuration is part of it); empty means the addon's default setup.
const DEFAULT_BASE = "https://cinema.debrid.in/mode=http|httpsources=4khdhub,moviebox,archiveorg,archiveorgdub|embeddedsubs=en,es|livetv=1|sports=1|worldnews=1";

/** The addon's root: what the person pasted (a manifest.json address or the root) without the manifest and the closing slash. */
function base() {
  const raw = String(kino.config.get("addonUrl") || "").trim();
  const url = /^https:\/\//i.test(raw) ? raw : DEFAULT_BASE;
  return url.replace(/[?#].*$/, "").replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
}

// ---- 1. texts ----------------------------------------------------------------------------------------------------

const TEXTS = {
  es: {
    timeout: "El servidor tardó demasiado. Inténtalo de nuevo.",
    warming: "El servidor está preparando las fuentes de este título. Inténtalo de nuevo en unos segundos.",
    network: "No se pudo conectar con el servidor.",
    server: "El servidor respondió {status}.",
    notStremio: "El servidor no respondió con el formato esperado.",
    noStreams: "Este título no tiene fuentes disponibles ahora.",
    noChannel: "Este canal no está disponible ahora.",
    drmOnly: "Esto solo se ofrece con una protección que este reproductor no admite.",
    noTmdb: "No se pudo consultar el catálogo de títulos. Revisa tu conexión.",
    noImdb: "Este título no tiene el identificador que usa el servidor.",
    noEpisodes: "No se encontraron episodios para esta serie.",
    unknownRef: "Referencia desconocida.",
    ok: "Conectado. Catálogo de títulos, fuentes y TV en vivo comprobados.",
    stepManifest: "No se pudo leer el manifiesto del servidor: {detail}",
    stepTitles: "No se pudo consultar el catálogo de títulos: {detail}",
    stepStream: "Falló pedir las fuentes de un título: {detail}",
    stepLive: "Fallaron los canales en vivo: {detail}",
    offline: "Sin conexión: {detail}",
    online: "Conectado: {channels} canales en vivo",
    cinema: "Cine",
    tabHome: "Inicio",
    brWatch: "Reproducir",
    brInfo: "Más información",
    brSettings: "Ajustes",
    brClose: "Cerrar",
    brBack: "Atrás",
    brSearch: "Buscar",
    brSearchHint: "Película, serie o anime",
    brSearchTitle: "Buscar",
    brFailed: "No se pudo cargar. Revisa tu conexión.",
    brRetry: "Reintentar",
    brNoResults: "No se encontró nada con esas palabras.",
    brSearchedBefore: "Buscado antes",
    brSearchFailed: "No se pudo buscar. Inténtalo de nuevo.",
    anime: "Anime",
    platforms: "Plataformas",
    animeMovies: "Películas de anime",
    animeSeries: "Series de anime",
    series: "Series",
    live: "En vivo",
    trending: "Tendencias",
    popular: "Populares",
    topRated: "Mejor valoradas",
    nowPlaying: "En cartelera",
    onAir: "Al aire ahora",
  },
  en: {
    timeout: "The server took too long. Try again.",
    warming: "The server is preparing this title's sources. Try again in a few seconds.",
    network: "Could not reach the server.",
    server: "The server answered {status}.",
    notStremio: "The server did not answer in the expected format.",
    noStreams: "This title has no sources available right now.",
    noChannel: "This channel is not available right now.",
    drmOnly: "This is only offered with a protection this player does not support.",
    noTmdb: "Could not reach the title catalog. Check your connection.",
    noImdb: "This title has no identifier the server uses.",
    noEpisodes: "No episodes were found for this series.",
    unknownRef: "Unknown reference.",
    ok: "Connected. Title catalog, sources and live TV checked.",
    stepManifest: "Could not read the server's manifest: {detail}",
    stepTitles: "Could not reach the title catalog: {detail}",
    stepStream: "Asking a title's sources failed: {detail}",
    stepLive: "Live channels failed: {detail}",
    offline: "Offline: {detail}",
    online: "Connected: {channels} live channels",
    cinema: "Movies",
    tabHome: "Home",
    brWatch: "Play",
    brInfo: "More info",
    brSettings: "Settings",
    brClose: "Close",
    brBack: "Back",
    brSearch: "Search",
    brSearchHint: "Movie, series or anime",
    brSearchTitle: "Search",
    brFailed: "Could not load. Check your connection.",
    brRetry: "Retry",
    brNoResults: "Nothing found with those words.",
    brSearchedBefore: "Searched before",
    brSearchFailed: "Could not search. Try again.",
    anime: "Anime",
    platforms: "Platforms",
    animeMovies: "Anime movies",
    animeSeries: "Anime series",
    series: "Series",
    live: "Live",
    trending: "Trending",
    popular: "Popular",
    topRated: "Top rated",
    nowPlaying: "In theaters",
    onAir: "On the air",
  },
};

function t(key, vars) {
  const lang = String(kino.lang || "").toLowerCase().startsWith("es") ? "es" : "en";
  const tpl = TEXTS[lang][key] || TEXTS.es[key] || key;
  return vars ? tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] != null ? vars[k] : "")) : tpl;
}

// ---- 2. http -----------------------------------------------------------------------------------------------------

function enc(s) {
  return encodeURIComponent(String(s));
}

/** The first two segments of a path ("/stream/movie"): enough to tell what failed, never an id. */
function route(path) {
  return path.split("/").slice(0, 3).join("/");
}

async function getJson(path, timeoutMs, onTimeout) {
  let r;
  try {
    r = await kino.fetch(base() + path, { timeoutMs: timeoutMs || 12000 });
  } catch (e) {
    const code = e && e.code;
    kino.log("fetch " + route(path) + " failed: " + code);
    throw kino.error("unavailable", "fetch " + code, { userMessage: t(code === "timeout" ? onTimeout || "timeout" : "network") });
  }
  if (!r.ok) {
    kino.log("fetch " + route(path) + " answered " + r.status);
    throw kino.error(r.status === 404 ? "not_found" : "unavailable", "http " + r.status, { userMessage: t("server", { status: r.status }) });
  }
  try {
    return r.json();
  } catch {
    kino.log("fetch " + route(path) + " is not json");
    throw kino.error("unavailable", "not json", { userMessage: t("notStremio") });
  }
}

/** Runs `fn` over `list` with at most `limit` in flight; a failed item answers undefined. */
async function pool(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      try { out[i] = await fn(list[i], i); } catch { out[i] = undefined; }
    }
  };
  const workers = [];
  for (let w = 0; w < Math.min(limit, list.length); w++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

const MEM = new Map();
const TTL_PAGE = 10 * 60 * 1000;

async function cachedMem(key, ttl, fn) {
  const hit = MEM.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.v;
  const v = await fn();
  MEM.set(key, { at: Date.now(), v });
  return v;
}

/** A value kept in storage for `ttl` ms; `make` runs when it is missing or stale, and a failure keeps nothing. */
async function stored(key, ttl, make) {
  try {
    const raw = kino.storage.get(key);
    if (raw) {
      const e = JSON.parse(raw);
      if (e && typeof e.at === "number" && Date.now() - e.at < ttl) return e.v;
    }
  } catch { /* unreadable: ask again */ }
  const v = await make();
  try { kino.storage.set(key, JSON.stringify({ at: Date.now(), v })); } catch { /* storage full: not cached */ }
  return v;
}

// ---- 3. manifest -------------------------------------------------------------------------------------------------

const TTL_MANIFEST = 60 * 60 * 1000;

function isLiveType(type) {
  return type === "tv" || type === "channel";
}

function normalizeManifest(m) {
  if (!m || typeof m !== "object" || !Array.isArray(m.catalogs)) throw kino.error("unavailable", "no catalogs", { userMessage: t("notStremio") });
  const catalogs = [];
  const content = [];
  const searches = [];
  for (const c of m.catalogs) {
    if (!c || !c.id || !c.type) continue;
    const extra = Array.isArray(c.extra) ? c.extra : [];
    const required = extra.filter((e) => e && e.isRequired).map((e) => e.name);
    if (!isLiveType(String(c.type))) {
      const type = String(c.type);
      if (type !== "movie" && type !== "series" && type !== "anime") continue;
      const name = String(c.name || c.id).replace(/\s*\((US|UK)\)/g, "").replace(VISUAL, "").trim().slice(0, 60);
      if (!required.length) content.push({ id: String(c.id), type, name: name || String(c.id) });
      else if (required.length === 1 && required[0] === "search" && type !== "anime") searches.push({ id: String(c.id), type });
      continue;
    }
    const genreExtra = extra.find((e) => e && e.name === "genre");
    catalogs.push({
      id: String(c.id),
      type: String(c.type),
      name: String(c.name || c.id),
      search: extra.some((e) => e && e.name === "search"),
      genres: Array.isArray(genreExtra && genreExtra.options) ? genreExtra.options.filter((o) => typeof o === "string" && o.trim()).map((o) => o.trim().slice(0, 60)).slice(0, 30) : [],
      browsable: required.every((n) => n === "genre"),
    });
  }
  const resources = (m.resources || []).map((r) => (typeof r === "string" ? r : r && r.name)).filter(Boolean);
  return { catalogs: catalogs.filter((c) => c.browsable), content, searches, resources };
}

async function loadManifest(fresh) {
  const make = async () => normalizeManifest(await getJson("/manifest.json", 15000));
  if (fresh) return make();
  try {
    return await stored("m2-" + hash(base()), TTL_MANIFEST, make);
  } catch (e) {
    try {
      const stale = JSON.parse(kino.storage.get("m2-" + hash(base())) || "null");
      if (stale && stale.v) return stale.v; // the server hiccuped: the last manifest still works
    } catch { /* nothing kept */ }
    throw e;
  }
}

// ---- 4. TMDB -----------------------------------------------------------------------------------------------------

function tmdbLang() {
  return String(kino.lang || "").toLowerCase().startsWith("es") ? "es-MX" : "en-US";
}

// Kino answers a plugin at most 20 TMDB calls per 10 s on its own key (more only on the person's), and Home, the section
// and Categorías are asked together when the app opens. Every call takes a slot here, so the burst waits its turn
// instead of being refused.
const TMDB_WINDOW_MS = 10000;
const TMDB_MAX_IN_WINDOW = 16;
const TMDB_CALLS = [];

async function tmdbSlot() {
  for (;;) {
    const now = Date.now();
    while (TMDB_CALLS.length && now - TMDB_CALLS[0] >= TMDB_WINDOW_MS) TMDB_CALLS.shift();
    if (TMDB_CALLS.length < TMDB_MAX_IN_WINDOW) {
      TMDB_CALLS.push(now);
      return;
    }
    await kino.sleep(Math.min(5000, TMDB_WINDOW_MS - (now - TMDB_CALLS[0]) + 50));
  }
}

/** A GET to TMDB through Kino (no key here): cached in memory for the sandbox's life. */
async function tmdb(path, params) {
  if (typeof kino.tmdb !== "function") throw kino.error("unavailable", "no kino.tmdb", { userMessage: t("noTmdb") });
  const query = Object.assign({ language: tmdbLang() }, params || {});
  try {
    return await cachedMem(path + "?" + JSON.stringify(query), TTL_PAGE, async () => {
      await tmdbSlot();
      return kino.tmdb(path, query);
    });
  } catch (e) {
    const code = e && e.code;
    kino.log("tmdb " + path.split("/").slice(0, 3).join("/") + " failed: " + code);
    if (code === "not_found") throw kino.error("not_found", "tmdb not found", { userMessage: t("unknownRef") });
    throw kino.error("unavailable", "tmdb " + code, { userMessage: (e && e.userMessage) || t("noTmdb") });
  }
}

const TTL_GENRES = 24 * 60 * 60 * 1000;

/** TMDB's genre names by id, for movies and for series, in the person's language. */
async function genreNames() {
  return stored("g1-" + tmdbLang(), TTL_GENRES, async () => {
    const [movie, tv] = await Promise.all([tmdb("/genre/movie/list"), tmdb("/genre/tv/list")]);
    const map = (d) => Object.fromEntries(((d && d.genres) || []).map((g) => [g.id, String(g.name)]));
    return { movie: map(movie), tv: map(tv) };
  });
}

// ---- 5. titles ---------------------------------------------------------------------------------------------------

function hash(s) {
  let a = 0x811c9dc5;
  let b = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = (Math.imul(b, 33) + c) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

function safeId(raw) {
  return String(raw).replace(/[^A-Za-z0-9._~-]/g, "-").slice(0, 120) || "x";
}

function httpUrl(v) {
  return typeof v === "string" && /^https?:\/\//.test(v) && v.length <= 2048 ? v : undefined;
}

function num(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

const VISUAL = /[\u{1F000}-\u{1FFFF}☀-➿️‍]/gu;
const BLANK = /^[\s⠀​-‍﻿]*$/;

/**
 * A ref is JSON. A title: { k: "movie" | "series", t: TMDB id, m: IMDb id when known }; an episode adds { s, e }; a live
 * channel: { k: "tv", id: the server's id }; a "Ver más" page: { k, e: TMDB endpoint, q: its fixed filters }.
 */
function makeRef(o) {
  return JSON.stringify(o);
}

function parseRef(ref) {
  try {
    const r = JSON.parse(String(ref));
    if (r && typeof r.k === "string") return r;
  } catch { /* falls through */ }
  throw kino.error("not_found", "bad ref", { userMessage: t("unknownRef") });
}

function image(path, size) {
  return typeof path === "string" && path.startsWith("/") ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
}

/** One TMDB result as a Kino item; `kind` is "movie" or "series". */
function titleItem(r, kind, names) {
  const title = String(kind === "movie" ? r.title || r.original_title : r.name || r.original_name || "").trim();
  if (!r || !r.id || !title) return null;
  const item = { id: (kind === "movie" ? "m" : "s") + r.id, ref: makeRef({ k: kind, t: r.id }), title: title.slice(0, 200), kind, ids: { tmdb: r.id } };
  const date = String((kind === "movie" ? r.release_date : r.first_air_date) || "");
  const y = num(date.slice(0, 4));
  if (y >= 1870 && y <= 2100) item.year = y;
  const poster = image(r.poster_path, "w342");
  if (poster) item.poster = poster;
  const backdrop = image(r.backdrop_path, "w780");
  if (backdrop) item.backdrop = backdrop;
  if (r.overview) item.overview = String(r.overview);
  const original = String(kind === "movie" ? r.original_title || "" : r.original_name || "").trim();
  if (original && original !== title) item.originalTitle = original.slice(0, 200);
  if (r.vote_average > 0) item.rating = Math.round(r.vote_average * 10) / 10;
  const table = (names && names[kind === "movie" ? "movie" : "tv"]) || {};
  const genres = (Array.isArray(r.genre_ids) ? r.genre_ids : []).map((id) => table[id]).filter(Boolean).map((g) => String(g).slice(0, 30)).slice(0, 5);
  if (genres.length) item.genres = genres;
  return item;
}

function itemsOf(results, kind, names) {
  const seen = new Set();
  const items = [];
  for (const r of Array.isArray(results) ? results : []) {
    const item = titleItem(r, kind, names);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

/** What `kino.meta` knows about a title by its TMDB id: the whole of its page, episodes and every id Kino has. */
async function metaOf(kind, idsOrTmdb) {
  const ids = typeof idsOrTmdb === "object" ? idsOrTmdb : { tmdb: idsOrTmdb };
  if (typeof kino.meta !== "function") throw kino.error("unavailable", "no kino.meta", { userMessage: t("noTmdb") });
  try {
    const answer = await kino.meta({ type: kind, ids });
    if (!answer) throw kino.error("not_found", "no meta", { userMessage: t("unknownRef") });
    return answer;
  } catch (e) {
    if (e && e.code === "not_found") throw e;
    kino.log("kino.meta failed: " + (e && e.code));
    throw kino.error("unavailable", "meta " + (e && e.code), { userMessage: (e && e.userMessage) || t("noTmdb") });
  }
}

function infoOf(meta) {
  return {
    title: meta.title ? String(meta.title).slice(0, 200) : undefined,
    poster: httpUrl(meta.poster),
    backdrop: httpUrl(meta.backdrop),
    overview: meta.overview ? String(meta.overview) : undefined,
    genres: meta.genres && meta.genres.length ? meta.genres.slice(0, 5) : undefined,
    year: num(meta.year) || undefined,
    ids: meta.ids,
    runtimeMinutes: meta.runtimeMinutes,
  };
}

export async function details(ref) {
  const r = parseRef(ref);
  if (r.a) return infoOfAddon(await addonMeta(r));
  if (r.k !== "movie" || !(r.t || r.m)) throw kino.error("not_found", "not a movie", { userMessage: t("unknownRef") });
  return infoOf(await metaOf("movie", r.t ? r.t : { imdb: r.m }));
}

export async function episodes(ref) {
  const r = parseRef(ref);
  if (r.a) {
    // The addon has no sources under a Kitsu id, only under the IMDb one: Kino's own anime mapping gives both.
    const mapped = await metaOf("series", idsOf(r.a) || {}).catch(() => null);
    if (mapped && Array.isArray(mapped.episodes) && mapped.episodes.length && mapped.ids && (mapped.ids.imdb || mapped.ids.tmdb)) return episodesOf(r, mapped);
    return addonEpisodes(r);
  }
  if (r.k !== "series" || !(r.t || r.m)) throw kino.error("not_found", "not a series", { userMessage: t("unknownRef") });
  return episodesOf(r, await metaOf("series", r.t ? r.t : { imdb: r.m }));
}

function episodesOf(r, meta) {
  const imdb = meta.ids && meta.ids.imdb;
  const tmdbId = (meta.ids && meta.ids.tmdb) || r.t;
  const list = [];
  for (const ep of Array.isArray(meta.episodes) ? meta.episodes : []) {
    const season = num(ep.season);
    const number = num(ep.number);
    if (season < 1 || season > 999 || number < 1 || number > 99999) continue; // specials (season 0) have no place in Kino's numbering
    const entry = { season, number, ref: makeRef({ k: "series", t: tmdbId || undefined, m: imdb || undefined, s: season, e: number }) };
    if (ep.title) entry.title = String(ep.title).slice(0, 200);
    const still = httpUrl(ep.still);
    if (still) entry.still = still;
    if (ep.overview) entry.overview = String(ep.overview);
    const aired = /^\d{4}-\d{2}-\d{2}/.exec(String(ep.airDate || ""));
    if (aired) entry.airDate = aired[0];
    list.push(entry);
  }
  if (!list.length) throw kino.error("not_found", "no episodes", { userMessage: t("noEpisodes") });
  list.sort((a, b) => (a.season - b.season) || (a.number - b.number));
  return { series: infoOf(meta), episodes: list };
}

// ---- 5b. the addon's own catalogs ---------------------------------------------------------------------------------
// The addon lists its catalogs in its manifest in the order its configuration chose (platforms, trending, anime...). Home,
// the tabs and Buscar follow that list; the TMDB lists above are only the fallback when the addon gives none.

/** An addon id in a path: the colons of "kitsu:12:3" stay as they are. */
function idPath(id) {
  return encodeURIComponent(String(id)).replace(/%3A/gi, ":");
}

/** The ids Kino knows how to link, read from an addon id ("tt123", "tmdb:603", "kitsu:1376"). */
function idsOf(id) {
  const raw = String(id);
  if (/^tt\d+$/.test(raw)) return { imdb: raw };
  const m = /^(tmdb|kitsu|mal|anilist):(\d+)$/.exec(raw);
  return m ? { [m[1]]: parseInt(m[2], 10) } : undefined;
}

/** One addon meta as a Kino item. `catType` is the catalog's own type ("movie", "series" or "anime"). */
function addonItem(m, catType) {
  const id = String(m.id);
  const title = String(m.name || "").replace(/\s+/g, " ").trim();
  if (!id || !title || id.length > 120) return null;
  const kind = m.type === "movie" ? "movie" : "series";
  const ids = idsOf(id);
  const ref = ids && ids.imdb ? { k: kind, m: id } : ids && ids.tmdb ? { k: kind, t: ids.tmdb } : { k: kind, a: id, y: catType };
  const item = { id: safeId(id), ref: makeRef(ref), title: title.slice(0, 200), kind };
  if (ids) item.ids = ids;
  const y = num(String(m.releaseInfo || m.year || "").slice(0, 4));
  if (y >= 1870 && y <= 2100) item.year = y;
  const poster = httpUrl(m.poster);
  if (poster) item.poster = poster;
  const backdrop = httpUrl(m.background);
  if (backdrop) item.backdrop = backdrop;
  if (m.description) item.overview = String(m.description);
  const rating = parseFloat(m.imdbRating);
  if (rating > 0 && rating <= 10) item.rating = Math.round(rating * 10) / 10;
  const genres = (Array.isArray(m.genres) ? m.genres : []).filter((g) => typeof g === "string" && g.trim()).map((g) => g.trim().slice(0, 30)).slice(0, 5);
  if (genres.length) item.genres = genres;
  return item;
}

function addonItems(metas, catType) {
  const seen = new Set();
  const items = [];
  for (const m of metas) {
    const item = m && typeof m.id === "string" ? addonItem(m, catType) : null;
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

async function addonCatalog(type, id, search) {
  const path = `/catalog/${enc(type)}/${enc(id)}${search ? "/search=" + enc(search) : ""}.json`;
  const data = await cachedMem(hash(base()) + path, TTL_PAGE, () => getJson(path, 15000));
  return Array.isArray(data && data.metas) ? data.metas : [];
}

async function addonMeta(r) {
  const path = `/meta/${enc(r.y || r.k)}/${idPath(r.a)}.json`;
  const data = await cachedMem(hash(base()) + path, TTL_PAGE, () => getJson(path, 15000));
  if (!data || !data.meta) throw kino.error("not_found", "no meta", { userMessage: t("unknownRef") });
  return data.meta;
}

function infoOfAddon(meta) {
  const genres = (Array.isArray(meta.genres) ? meta.genres : []).filter((g) => typeof g === "string").slice(0, 5);
  return {
    title: meta.name ? String(meta.name).slice(0, 200) : undefined,
    poster: httpUrl(meta.poster),
    backdrop: httpUrl(meta.background),
    overview: meta.description ? String(meta.description) : undefined,
    genres: genres.length ? genres : undefined,
    year: num(String(meta.releaseInfo || meta.year || "").slice(0, 4)) || undefined,
    ids: idsOf(meta.id),
  };
}

async function addonEpisodes(r) {
  const meta = await addonMeta(r);
  const list = [];
  for (const v of Array.isArray(meta.videos) ? meta.videos : []) {
    const season = num(v.season) || 1;
    const number = num(v.episode != null ? v.episode : v.number);
    if (season < 1 || season > 999 || number < 1 || number > 99999 || !v.id) continue;
    const entry = { season, number, ref: makeRef({ k: "series", a: r.a, y: r.y, v: String(v.id) }) };
    if (v.title || v.name) entry.title = String(v.title || v.name).slice(0, 200);
    const still = httpUrl(v.thumbnail);
    if (still) entry.still = still;
    if (v.overview) entry.overview = String(v.overview);
    const aired = /^\d{4}-\d{2}-\d{2}/.exec(String(v.released || ""));
    if (aired) entry.airDate = aired[0];
    list.push(entry);
  }
  if (!list.length) throw kino.error("not_found", "no episodes", { userMessage: t("noEpisodes") });
  list.sort((a, b) => (a.season - b.season) || (a.number - b.number));
  return { series: infoOfAddon(meta), episodes: list };
}

/** A row per addon catalog that has titles, in the addon's own order; "Ver más" shows the whole catalog. */
async function addonRows(cats) {
  const pages = await pool(cats, 5, async (c) => addonItems(await addonCatalog(c.type, c.id), c.type));
  const rows = [];
  cats.forEach((c, i) => {
    const all = pages[i] || [];
    if (!all.length) return;
    const row = { id: "c" + hash(c.id), title: c.name, items: all.slice(0, ROW_ITEMS) };
    if (all.length > ROW_ITEMS) row.ref = makeRef({ k: "row", c: c.id, ty: c.type });
    rows.push(row);
  });
  return rows;
}

async function addonSearch(manifest, q, wanted) {
  const found = await pool(manifest.searches.slice(0, 4), 4, async (c) => addonItems(await addonCatalog(c.type, c.id, q), c.type));
  const items = [];
  const seen = new Set();
  for (const list of found) for (const item of list || []) if (!seen.has(item.id) && seen.add(item.id)) items.push(item);
  if (wanted) items.sort((a, b) => (a.kind === wanted ? 0 : 1) - (b.kind === wanted ? 0 : 1));
  return items.slice(0, 40);
}

// ---- 6. rows -----------------------------------------------------------------------------------------------------

const ROW_ITEMS = 15;
const DEADLINE_MS = 9000;

/** The TMDB list a row shows: an endpoint of one kind plus fixed filters. `kind` is "movie" or "series". */
function listSpec(kind, title, endpoint, q) {
  return { kind, title, endpoint, q: q || {} };
}

async function fetchList(spec, page) {
  return tmdb(spec.endpoint, Object.assign({ page: page || 1, include_adult: false }, spec.q));
}

function rowRef(spec) {
  return makeRef({ k: spec.kind, e: spec.endpoint, q: spec.q });
}

async function listRows(specs) {
  const names = await genreNames();
  const pages = await pool(specs, 5, async (spec) => (await fetchList(spec, 1)).results);
  const rows = [];
  specs.forEach((spec, i) => {
    const items = itemsOf(pages[i], spec.kind, names).slice(0, ROW_ITEMS);
    if (items.length) rows.push({ id: "r" + hash(spec.endpoint + JSON.stringify(spec.q) + spec.kind), title: spec.title.slice(0, 100), items, ref: rowRef(spec) });
  });
  return rows;
}

/** The lists every kind has: what is trending, popular and best rated, and what is on now. */
function mainSpecs(kind) {
  const movie = kind === "movie";
  const word = movie ? "cinema" : "series";
  return [
    listSpec(kind, `${t(word)} · ${t("trending")}`, movie ? "/trending/movie/week" : "/trending/tv/week"),
    listSpec(kind, `${t(word)} · ${t("popular")}`, movie ? "/movie/popular" : "/tv/popular"),
    listSpec(kind, `${t(word)} · ${t("topRated")}`, movie ? "/movie/top_rated" : "/tv/top_rated"),
    listSpec(kind, `${t(word)} · ${t(movie ? "nowPlaying" : "onAir")}`, movie ? "/movie/now_playing" : "/tv/on_the_air"),
  ];
}

/** Streaming services as TMDB knows them (watch provider ids, United States catalog): rows of what each one carries. */
const PLATFORMS = [
  { id: 8, name: "Netflix" }, { id: 9, name: "Prime Video" }, { id: 337, name: "Disney+" }, { id: 15, name: "Hulu" },
  { id: 1899, name: "Max" }, { id: 350, name: "Apple TV+" }, { id: 386, name: "Peacock" }, { id: 531, name: "Paramount+" },
];

function platformSpec(kind, p) {
  const movie = kind === "movie";
  return listSpec(kind, `${p.name} · ${t(movie ? "cinema" : "series")}`, movie ? "/discover/movie" : "/discover/tv", { with_watch_providers: p.id, watch_region: "US", sort_by: "popularity.desc" });
}

function platformSpecs() {
  const specs = [];
  for (const p of PLATFORMS) specs.push(platformSpec("movie", p), platformSpec("series", p));
  return specs;
}

function animeSpecs() {
  const jp = { with_genres: 16, with_original_language: "ja" };
  return [
    listSpec("series", `${t("animeSeries")} · ${t("popular")}`, "/discover/tv", Object.assign({ sort_by: "popularity.desc" }, jp)),
    listSpec("series", `${t("animeSeries")} · ${t("topRated")}`, "/discover/tv", Object.assign({ sort_by: "vote_average.desc", "vote_count.gte": 300 }, jp)),
    listSpec("movie", `${t("animeMovies")} · ${t("popular")}`, "/discover/movie", Object.assign({ sort_by: "popularity.desc" }, jp)),
    listSpec("movie", `${t("animeMovies")} · ${t("topRated")}`, "/discover/movie", Object.assign({ sort_by: "vote_average.desc", "vote_count.gte": 300 }, jp)),
  ];
}

/** TMDB's own genre ids people look for most, per kind; the names come from TMDB in the person's language. */
const MOVIE_GENRES = [28, 35, 18, 27, 878, 16, 10749, 53, 12, 80, 14, 99];
const SERIES_GENRES = [10759, 35, 18, 80, 10765, 16, 9648, 10751, 99, 10762, 10764, 10766];

function genreSpecs(kind, names, limit) {
  const movie = kind === "movie";
  const table = movie ? names.movie : names.tv;
  const word = movie ? "cinema" : "series";
  return (movie ? MOVIE_GENRES : SERIES_GENRES)
    .filter((id) => table[id])
    .slice(0, limit)
    .map((id) => listSpec(kind, `${t(word)} · ${table[id]}`, movie ? "/discover/movie" : "/discover/tv", { with_genres: id, sort_by: "popularity.desc" }));
}

function rowsSetting() {
  const n = num(kino.config.get("homeRows"));
  return n > 0 && n <= 12 ? n : 4;
}

export async function home() {
  const manifest = await loadManifest(false);
  const specs = mainSpecs("movie").concat(mainSpecs("series"));
  // Movies and series alternate, so a short Home shows both.
  const ordered = [];
  for (let i = 0; i < 4; i++) ordered.push(specs[i], specs[4 + i]);
  const fromTmdb = () => listRows(ordered.slice(0, rowsSetting()));
  const fromAddon = async () => {
    const rows = manifest.content.length ? await addonRows(manifest.content.slice(0, rowsSetting())) : [];
    return rows.length ? rows : fromTmdb();
  };
  const [rows, live] = await Promise.all([fromAddon().catch(fromTmdb), liveHomeRows(manifest).catch(() => [])]);
  return live.concat(rows);
}

// ---- the section: three tabs (movies, series, live), each with the lists above and its genres

export async function section(arg) {
  const manifest = await loadManifest(false);
  const tabs = [
    { id: "cinema", label: t("cinema") },
    { id: "series", label: t("series") },
    { id: "anime", label: t("anime") },
    ...(manifest.content.length ? [] : [{ id: "platforms", label: t("platforms") }]),
    { id: "live", label: t("live") },
  ];
  const tab = tabs.find((x) => x.id === (arg && arg.tab)) || tabs[0];
  if (tab.id === "live") return { tabs, tab: tab.id, rows: await liveRows(manifest) };
  const own = manifest.content.filter((c) => c.type === (tab.id === "cinema" ? "movie" : tab.id));
  if (own.length) {
    const rows = await addonRows(own.slice(0, 14)).catch(() => []);
    if (rows.length) return { tabs, tab: tab.id, rows };
  }
  if (tab.id === "anime") return { tabs, tab: tab.id, rows: await listRows(animeSpecs()) };
  if (tab.id === "platforms") return { tabs, tab: tab.id, rows: await listRows(platformSpecs()) };
  const kind = tab.id === "cinema" ? "movie" : "series";
  const names = await genreNames();
  return { tabs, tab: tab.id, rows: await listRows(mainSpecs(kind).concat(genreSpecs(kind, names, 6))) };
}

// ---- Categorías: a tile per genre, with a poster of its most popular title

const TTL_ART = 24 * 60 * 60 * 1000;
const ART_PER_CALL = 6; // posters asked per call: the rest fill in on later visits, so the TMDB budget is never spent here

async function genreArt(specs) {
  const key = "a1-" + tmdbLang();
  let cached = { at: Date.now(), v: {} };
  try {
    const e = JSON.parse(kino.storage.get(key) || "null");
    if (e && e.v && Date.now() - e.at < TTL_ART) cached = e;
  } catch { /* unreadable: start again */ }
  const missing = specs.filter((spec) => !cached.v[rowRef(spec)]).slice(0, ART_PER_CALL);
  if (missing.length) {
    const found = await pool(missing, 3, async (spec) => {
      const first = ((await fetchList(spec, 1)).results || []).find((r) => r.poster_path);
      return first ? image(first.poster_path, "w342") : undefined;
    });
    missing.forEach((spec, i) => { if (found[i]) cached.v[rowRef(spec)] = found[i]; });
    try { kino.storage.set(key, JSON.stringify(cached)); } catch { /* storage full: not cached */ }
  }
  return cached.v;
}

export async function categories() {
  const names = await genreNames();
  const specs = PLATFORMS.map((p) => platformSpec("movie", p)).concat(genreSpecs("movie", names, 8), genreSpecs("series", names, 8));
  const art = await genreArt(specs);
  return specs.map((spec) => {
    const ref = rowRef(spec);
    const tile = { id: "g" + hash(ref), title: spec.title.slice(0, 40), ref };
    if (art[ref]) tile.art = art[ref];
    return tile;
  });
}

/** "Ver más": a page of the same TMDB list; the cursor is its page number. */
export async function browse(ref, cursor) {
  const r = parseRef(ref);
  if (r.c) return { items: addonItems(await addonCatalog(r.ty, r.c), r.ty) }; // the addon answers a whole catalog at once
  if (!r.e || typeof r.e !== "string") throw kino.error("not_found", "bad ref", { userMessage: t("unknownRef") });
  const kind = r.k === "movie" ? "movie" : "series";
  const page = Math.max(1, num(cursor) || 1);
  const [names, data] = await Promise.all([genreNames(), fetchList({ endpoint: r.e, q: r.q || {} }, page)]);
  const items = itemsOf(data.results, kind, names);
  return page < Math.min(num(data.total_pages), 20) ? { items, next: String(page + 1) } : { items };
}

export async function search(query) {
  const q = String(query.q || "").trim();
  const wanted = query.type === "movie" ? "movie" : query.type === "series" ? "tv" : null;
  // Kino looking for one title it already knows (by TMDB id): answer that title, whichever kind it is.
  if (query.tmdbId > 0) {
    const names = await genreNames();
    const kinds = wanted === "tv" ? ["series"] : wanted === "movie" ? ["movie"] : ["movie", "series"];
    const found = await pool(kinds, 2, async (kind) => titleItem(await tmdb(kind === "movie" ? `/movie/${query.tmdbId}` : `/tv/${query.tmdbId}`), kind, names));
    const items = found.filter(Boolean);
    if (items.length) return items;
  }
  if (q.length < 2) return [];
  try {
    const own = await addonSearch(await loadManifest(false), q, wanted === "tv" ? "series" : wanted);
    if (own.length) return own;
  } catch { /* the addon's search failed: TMDB answers */ }
  const names = await genreNames();
  const data = await tmdb("/search/multi", { query: q, include_adult: false, page: 1 });
  const items = [];
  for (const r of data.results || []) {
    if (r.media_type !== "movie" && r.media_type !== "tv") continue;
    const item = titleItem(r, r.media_type === "movie" ? "movie" : "series", names);
    if (item) items.push(item);
  }
  // The type Kino leans towards goes first; the order inside each group is TMDB's.
  if (wanted) items.sort((a, b) => (a.kind === (wanted === "tv" ? "series" : "movie") ? 0 : 1) - (b.kind === (wanted === "tv" ? "series" : "movie") ? 0 : 1));
  return items.slice(0, 40);
}

// ---- 7. streams --------------------------------------------------------------------------------------------------

const LANGS = {
  eng: "en", spa: "es", por: "pt", fre: "fr", fra: "fr", ger: "de", deu: "de", ita: "it", hin: "hi", jpn: "ja", kor: "ko",
  chi: "zh", zho: "zh", ara: "ar", rus: "ru", tur: "tr", ind: "id", tam: "ta", tel: "te", ben: "bn", mal: "ml", kan: "kn",
};

function langOf(code) {
  const c = String(code || "").toLowerCase().trim();
  return (LANGS[c] || c || "und").slice(0, 16);
}

function trackFormat(url) {
  const decoded = decodeURIComponent(url.split("?")[0] + " " + (/[?&]url=([^&]+)/.exec(url) || [, ""])[1]);
  return /\.vtt\b/i.test(decoded) ? "vtt" : /\.srt\b/i.test(decoded) ? "srt" : undefined;
}

function tracksOf(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    const url = s && httpUrl(s.url);
    if (!url) continue;
    const track = { lang: langOf(s.lang), url };
    const format = trackFormat(url);
    if (format) track.format = format;
    out.push(track);
  }
  return out;
}

function headersOf(s) {
  const h = s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request;
  if (!h || typeof h !== "object") return undefined;
  const out = {};
  for (const k of Object.keys(h).slice(0, 20)) if (typeof h[k] === "string") out[k] = h[k];
  return Object.keys(out).length ? out : undefined;
}

function mimeOf(url) {
  const path = url.split("?")[0];
  if (/\.m3u8$/i.test(path) || /\.m3u8/i.test(url)) return "application/x-mpegURL";
  if (/\.mpd$/i.test(path)) return "application/dash+xml";
  return undefined;
}

/** A stream with ClearKey keys cannot be decrypted by the player. */
function drmBlocked(s) {
  return !!(s.clearkey || s.drm || /[?&]clearkey=/i.test(String(s.url || "")));
}

/** A stream Kino can play: a URL, and not a torrent, a YouTube id, a link out to a web page or one that needs a key. */
function playable(s) {
  return !!s && typeof s.url === "string" && /^https?:\/\//.test(s.url) && !s.infoHash && !s.ytId && !drmBlocked(s);
}

// The server describes each stream in its title ("2160p · Hindi, English · 65.95 GB"): the quality and size only order
// and filter the copies. A title that says neither keeps the server's own order.
const QUALITY_RANK = { "2160p": 4, "1080p": 3, "720p": 2, "480p": 1 };

function qualityOf(s) {
  const text = `${s.name || ""} ${s.title || ""}`.toLowerCase();
  if (/\b(2160p|4k)\b/.test(text)) return "2160p";
  for (const q of ["1080p", "720p", "480p"]) if (text.includes(q)) return q;
  return undefined;
}

function sizeGbOf(s) {
  const m = /([\d.]+)\s*(gb|mb)\b/i.exec(`${s.title || ""} ${s.name || ""}`);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? (m[2].toLowerCase() === "mb" ? n / 1024 : n) : undefined;
}

function preferredRank() {
  const q = String(kino.config.get("quality") || "auto");
  return QUALITY_RANK[q] || QUALITY_RANK["1080p"];
}

// A person who uses Kino in Spanish wants the copies that say so first; the server writes the language in the title.
const SPANISH = /\b(spanish|español|espanol|latino|castellano|spa|esp)\b|\b(es|lat)\s*(dub|audio)\b/i;

function inMyLanguage(s) {
  return String(kino.lang || "").toLowerCase().startsWith("es") && SPANISH.test(`${s.name || ""} ${s.title || ""}`);
}

/** The copies the person's settings allow: their language first, then the closest to the preferred quality, the lighter file among equals, then the server's order. */
function ordered(list) {
  const maxGb = parseFloat(String(kino.config.get("maxSize") || "0")) || 0;
  let usable = list;
  if (maxGb > 0) {
    const small = list.filter((s) => { const gb = sizeGbOf(s); return gb === undefined || gb <= maxGb; });
    if (small.length) usable = small; // never leave the person with nothing because of a size limit
  }
  const want = preferredRank();
  const score = (s) => { const r = QUALITY_RANK[qualityOf(s)]; return r ? Math.abs(r - want) : 99; };
  return usable
    .map((s, i) => ({ s, i, l: inMyLanguage(s) ? 0 : 1, k: score(s), gb: sizeGbOf(s) ?? 50 }))
    .sort((a, b) => (a.l - b.l) || (a.k - b.k) || (a.gb - b.gb) || (a.i - b.i))
    .map((x) => x.s);
}

function labelOf(s) {
  const first = String(s.title || "").split("\n")[0];
  const text = (first || String(s.name || "")).replace(VISUAL, "").replace(/\s+/g, " ").trim().slice(0, 48);
  return text || undefined;
}

function streamFor(list, live) {
  const seen = new Set();
  const usable = ordered(list.filter(playable).filter((s) => !seen.has(s.url) && seen.add(s.url)));
  if (!usable.length) return null;
  const taken = new Map();
  const unique = (text) => {
    if (!text) return text;
    const n = (taken.get(text) || 0) + 1;
    taken.set(text, n);
    return n === 1 ? text : `${text} · ${n}`.slice(0, 48);
  };
  const main = usable[0];
  const stream = { url: main.url };
  const mime = mimeOf(main.url);
  if (mime) stream.mime = mime;
  const headers = headersOf(main);
  if (headers) stream.headers = headers;
  const label = unique(labelOf(main));
  if (label) stream.label = label;
  if (live) {
    stream.expiresInSeconds = 1800; // live URLs may carry short-lived tokens: ask again when one stops working
  } else {
    const subs = [];
    const urls = new Set();
    for (const s of usable) for (const track of tracksOf(s.subtitles)) if (!urls.has(track.url) && urls.add(track.url)) subs.push(track);
    if (subs.length) stream.subtitles = subs.slice(0, 30);
  }
  const alternatives = [];
  for (const s of usable.slice(1, 9)) {
    const alt = { url: s.url };
    const m = mimeOf(s.url);
    if (m) alt.mime = m;
    const h = headersOf(s);
    if (h) alt.headers = h;
    const l = unique(labelOf(s));
    if (l) alt.label = l;
    alternatives.push(alt);
  }
  if (alternatives.length) stream.alternatives = alternatives;
  return stream;
}

/** The server asks its sources when a title is requested, so this one is slow (about ten seconds). */
async function streamsOf(path) {
  const data = await getJson(path, 18000, "warming");
  return Array.isArray(data && data.streams) ? data.streams : [];
}

/** The IMDb id the server asks for: the one in the ref, else what Kino knows, else what TMDB says. */
async function imdbOf(r) {
  if (r.m) return r.m;
  try {
    const answer = await metaOf(r.k, r.t);
    if (answer.ids && answer.ids.imdb) return answer.ids.imdb;
  } catch { /* try TMDB itself */ }
  const ext = await tmdb(r.k === "movie" ? `/movie/${r.t}/external_ids` : `/tv/${r.t}/external_ids`);
  return ext && ext.imdb_id ? String(ext.imdb_id) : "";
}

export async function resolve(ref) {
  const r = parseRef(ref);
  let list;
  if (r.k === "tv") {
    list = await streamsOf(`/stream/tv/${enc(r.id)}.json`);
  } else if (r.a) {
    let imdb = "";
    if (!r.v && r.k === "movie") {
      const mapped = await metaOf("movie", idsOf(r.a) || {}).catch(() => null);
      imdb = (mapped && mapped.ids && mapped.ids.imdb) || "";
    }
    list = await streamsOf(imdb ? `/stream/movie/${imdb}.json` : `/stream/${enc(r.y || r.k)}/${idPath(r.v || r.a)}.json`);
  } else {
    if (!r.t && !r.m) throw kino.error("not_found", "bad ref", { userMessage: t("unknownRef") });
    const imdb = await imdbOf(r);
    if (!/^tt\d+$/.test(imdb)) throw kino.error("not_found", "no imdb", { userMessage: t("noImdb") });
    list = await streamsOf(r.k === "movie" ? `/stream/movie/${imdb}.json` : `/stream/series/${imdb}:${num(r.s) || 1}:${num(r.e) || 1}.json`);
  }
  const stream = streamFor(list, r.k === "tv");
  if (!stream) {
    const blocked = list.some((s) => s && typeof s.url === "string" && drmBlocked(s));
    throw kino.error("unavailable", "no streams", { userMessage: t(blocked ? "drmOnly" : r.k === "tv" ? "noChannel" : "noStreams") });
  }
  return stream;
}

export async function subtitles(arg) {
  if (!arg.imdbId) return [];
  const series = arg.kind === "series";
  const id = series && arg.season && arg.episode ? `${arg.imdbId}:${arg.season}:${arg.episode}` : arg.imdbId;
  const data = await getJson(`/subtitles/${series ? "series" : "movie"}/${enc(id)}.json`, 9000);
  return tracksOf(data && data.subtitles);
}

// ---- 8. live -----------------------------------------------------------------------------------------------------

/** The server's genre words mapped to Kino's closed vocabulary, so En vivo can filter across plugins; others stay unmapped. */
const LIVE_GENRES = {
  sports: "deportes", cricket: "deportes", football: "deportes", soccer: "deportes", news: "noticias", kids: "infantil",
  music: "musica", documentary: "documentales", movies: "peliculas", entertainment: "entretenimiento",
};

function catalogPath(cat, genre, search) {
  const extras = [];
  if (genre) extras.push("genre=" + enc(genre));
  if (search) extras.push("search=" + enc(search));
  return `/catalog/${enc(cat.type)}/${enc(cat.id)}${extras.length ? "/" + extras.join("&") : ""}.json`;
}

async function liveMetas(cat, genre, search, timeoutMs) {
  const path = catalogPath(cat, genre, search);
  const data = await cachedMem(hash(base()) + path, TTL_PAGE, () => getJson(path, timeoutMs || 15000));
  return Array.isArray(data && data.metas) ? data.metas.filter((m) => m && typeof m.id === "string") : [];
}

/** The live categories: every genre the server lists for each live catalog, plus the catalog's whole list. */
function liveCategoryList(manifest) {
  const out = [];
  for (const cat of manifest.catalogs) {
    out.push({ id: "a" + hash(cat.id), title: cat.name.replace(VISUAL, "").trim().slice(0, 40) || cat.id, cat, genre: null });
    for (const genre of cat.genres) out.push({ id: "g" + hash(cat.id + "|" + genre), title: genre.slice(0, 40), cat, genre });
  }
  return out;
}

function channelOf(m, categoryId) {
  const title = BLANK.test(String(m.name || "")) ? "" : String(m.name).replace(/\s+/g, " ").trim();
  if (!title) return null;
  const channel = { id: safeId(m.id), title: title.slice(0, 200), ref: makeRef({ k: "tv", id: m.id }), categoryId };
  const logo = httpUrl(m.logo) || httpUrl(m.poster);
  if (logo) channel.logo = logo;
  return channel;
}

export async function liveCategories() {
  const manifest = await loadManifest(false);
  return liveCategoryList(manifest).map((c) => {
    const out = { id: c.id, title: c.title };
    const genre = c.genre ? LIVE_GENRES[c.genre.toLowerCase()] : undefined;
    if (genre) out.genre = genre;
    return out;
  });
}

export async function liveChannels(arg) {
  const manifest = await loadManifest(false);
  const entry = liveCategoryList(manifest).find((c) => c.id === arg.categoryId);
  if (!entry) return { items: [] };
  const taken = new Set();
  const items = [];
  for (const m of (await liveMetas(entry.cat, entry.genre, null)).slice(0, 500)) {
    const channel = channelOf(m, arg.categoryId);
    if (!channel || taken.has(channel.id)) continue;
    taken.add(channel.id);
    items.push(channel);
  }
  return { items };
}

export async function liveSearch(arg) {
  const q = String(arg.query || "").trim();
  if (q.length < 2) return { items: [] };
  const manifest = await loadManifest(false);
  const cats = manifest.catalogs.filter((c) => c.search).slice(0, 6);
  const found = await pool(cats, 3, async (cat) => (await liveMetas(cat, null, q, 10000)).slice(0, 50).map((m) => channelOf(m, "a" + hash(cat.id))).filter(Boolean));
  const seen = new Set();
  const items = [];
  for (const list of found) for (const c of list || []) if (!seen.has(c.id) && seen.add(c.id)) items.push(c);
  return { items: items.slice(0, 100) };
}

/** A section row per live category that has channels: the genres first, the whole list last. */
async function liveRows(manifest) {
  const cats = liveCategoryList(manifest);
  const specific = cats.filter((c) => c.genre).concat(cats.filter((c) => !c.genre));
  const pages = await pool(specific, 5, async (c) => (await liveMetas(c.cat, c.genre, null, 10000)).slice(0, ROW_ITEMS));
  const rows = [];
  specific.forEach((c, i) => {
    const items = (pages[i] || []).map((m) => channelOf(m, c.id)).filter(Boolean).map((ch) => {
      const item = { id: ch.id, ref: ch.ref, title: ch.title, kind: "live" };
      if (ch.logo) item.poster = ch.logo;
      return item;
    });
    if (items.length) rows.push({ id: "v" + c.id, title: c.title, items });
  });
  return rows;
}

/** Home: a row of live channels from the first live catalog. */
async function liveHomeRows(manifest) {
  const cat = manifest.catalogs[0];
  if (!cat) return [];
  const items = (await liveMetas(cat, null, null, 10000))
    .slice(0, ROW_ITEMS)
    .map((m) => channelOf(m, "a" + hash(cat.id)))
    .filter(Boolean)
    .map((ch) => {
      const item = { id: ch.id, ref: ch.ref, title: ch.title, kind: "live" };
      if (ch.logo) item.poster = ch.logo;
      return item;
    });
  return items.length ? [{ id: "v" + hash(cat.id), title: t("live"), items }] : [];
}

// ---- 10. the screen ----------------------------------------------------------------------------------------------
// Absolute Cinema's own home (Kino 0.9.74+, declared through the manifest's `enhancements`, so an older Kino keeps the
// section): one bar with the logo and the settings gear, tabs, a slider of featured titles and the addon's rows, and a search
// page. It paints at once from what is kept and fills each tab as the addon answers, one tab per timer tick. Every text is in
// both languages. The state holds only `tab`, `pending` and `failed`; the trees live in memory.

const LOGO_ASPECT = "4.33:1";
const LOGO_DATA = "data:image/png;base64,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";

const TAB_IDS = ["inicio", "cine", "series", "anime"];
const TAB_TEXT = { inicio: "tabHome", cine: "cinema", series: "series", anime: "anime" };
const SECTION_TAB = { cine: "cinema", series: "series", anime: "anime" };
const MAX_SLIDES = 6;
const MAX_RAILS = 8;
const MAX_RAIL_ITEMS = 20;
const MAX_SLIDE_TEXT = 160;
const SEARCH_CAP = 60;
const POLL_MS = 1500;
const SNAP_PREFIX = "br1:";
const SNAP_TTL_MS = 12 * 3600 * 1000;
const SNAP_MAX = 20 * 1024;
const TAB_KEY = "browseTab";
const HIST_KEY = "searchHist1";
const HIST_MAX = 24;
const HTTPS = /^https:\/\//;

/** A text in both languages as a node's twin fields: `{ [field]: Spanish, [field + "En"]: English }`. */
function twin(key, field) {
  const f = field || "text";
  return { [f]: TEXTS.es[key], [f + "En"]: TEXTS.en[key] };
}

// ---- what the screen shows, from the rows the section already builds

/** The card Kino draws: the fields a rail needs and nothing else (the tree and the kept copy stay small). */
function cardOf(item) {
  const out = { id: item.id, ref: item.ref, title: item.title, kind: item.kind };
  if (item.poster && HTTPS.test(item.poster)) out.poster = item.poster;
  if (item.backdrop && HTTPS.test(item.backdrop)) out.backdrop = item.backdrop;
  if (item.rating !== undefined) out.rating = item.rating;
  if (item.year !== undefined) out.year = item.year;
  if (item.ids) out.ids = item.ids;
  return out;
}

/** Up to MAX_SLIDES featured titles: the first, in row order, with a backdrop and a synopsis, one per title. */
function slidesOf(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    for (const item of row.items) {
      if (out.length >= MAX_SLIDES) return out;
      if (item.kind === "live" || seen.has(item.id) || !item.backdrop || !HTTPS.test(item.backdrop)) continue;
      const text = typeof item.overview === "string" ? item.overview.trim() : "";
      if (text === "") continue;
      seen.add(item.id);
      out.push({
        id: item.id, ref: item.ref, kind: item.kind, title: item.title, image: item.backdrop,
        text: text.length <= MAX_SLIDE_TEXT ? text : `${text.slice(0, MAX_SLIDE_TEXT - 1).trimEnd()}…`,
      });
    }
  }
  return out;
}

function railsOf(rows) {
  return rows.filter((r) => r.items && r.items.length > 0 && r.items[0].kind !== "live").slice(0, MAX_RAILS).map((r) => ({
    id: r.id, title: r.title, ...(r.ref ? { ref: r.ref } : {}), items: r.items.slice(0, MAX_RAIL_ITEMS).map(cardOf),
  }));
}

/** One tab as the screen draws it, from its rows; null when it has none. */
function tabOf(rows) {
  const rails = railsOf(rows);
  return rails.length ? { slides: slidesOf(rows), rails } : null;
}

// ---- the trees

const logo = () => ({
  type: "Image", key: "logo", url: LOGO_DATA, aspect: LOGO_ASPECT, fit: "contain", h: 40, alt: "Absolute Cinema", altEn: "Absolute Cinema",
  fallback: { type: "Text", text: "Absolute Cinema", textEn: "Absolute Cinema", style: "h4" },
});

const tabBar = (active) => ({
  type: "TabBar", key: "tabs", divider: false, value: active, onChanged: "tab",
  tabs: TAB_IDS.map((id) => ({ value: id, ...twin(TAB_TEXT[id], "label") })),
});

/** The skeleton of one rail: a heading bar and a row of poster cards (three on a phone, six on a wide window). */
const railSkeleton = (n) => ({
  type: "Column", key: "skel" + n, gap: 8, children: [
    { type: "Skeleton", shape: "line", width: 120 },
    { type: "Row", gap: 12, sizes: ["compact"], children: [1, 2, 3].map((i) => ({ type: "Skeleton", shape: "card", key: `sk${n}c${i}`, flex: 1 })) },
    { type: "Row", gap: 12, sizes: ["medium", "expanded"], children: [1, 2, 3, 4, 5, 6].map((i) => ({ type: "Skeleton", shape: "card", key: `sk${n}w${i}`, flex: 1 })) },
  ],
});

const gridSkeleton = () => ({
  type: "Column", key: "gridSkeleton", gap: 12, children: [
    ...[1, 2].map((r) => ({ type: "Row", gap: 12, sizes: ["compact"], key: `gc${r}`, children: [1, 2, 3].map((i) => ({ type: "Skeleton", shape: "card", key: `gc${r}-${i}`, flex: 1 })) })),
    ...[1, 2].map((r) => ({ type: "Row", gap: 12, sizes: ["medium", "expanded"], key: `gw${r}`, children: [1, 2, 3, 4, 5, 6].map((i) => ({ type: "Skeleton", shape: "card", key: `gw${r}-${i}`, flex: 1 })) })),
  ],
});

const heroSkeleton = () => ({ type: "Skeleton", key: "heroSkeleton", shape: "block", height: { compact: 200, expanded: 320 } });

const slideNode = (s) => ({
  type: "heroCard", key: "slide-" + s.id, h: { compact: 200, expanded: 240 }, title: s.title, text: s.text, image: s.image,
  buttons: [
    { type: "ElevatedButton", key: "watch-" + s.id, ...twin("brWatch", "labelText"), icon: "play",
      onPressed: { go: { play: { ref: s.ref, kind: s.kind, id: s.id, title: s.title } } } },
    { type: "TextButton", key: "info-" + s.id, ...twin("brInfo", "labelText"),
      onPressed: { go: { title: { ref: s.ref, kind: s.kind, id: s.id, title: s.title } } } },
  ],
});

// The key carries the number of slides: Kino's pager keeps the count of its first drawing, and a slider that goes from one number
// of slides to another closed the app ("Index 4 out of bounds for length 4"). A new key is a new pager.
const hero = (slides) => (slides.length === 1 ? slideNode(slides[0]) : {
  type: "PageView", key: "hero" + slides.length, autoPlayMs: 6000, children: slides.map(slideNode),
});

const rail = (r, key) => ({ type: "titleRail", key, title: r.title, ...(r.ref ? { ref: r.ref } : {}), items: r.items, size: "medium" });

/** `data`: `{ slides, rails }` of the active tab, or null while it is not in. `pending`: a tab is still being fetched. */
function browseView({ tab, data, pending, failed, device }) {
  const tv = device === "tv";
  const gear = { type: "IconButton", key: "settingsButton", icon: "settings", ...twin("brSettings", "labelText"), ...twin("brSettings", "tooltip"), onPressed: { event: "go", arg: "settings" } };
  const active = TAB_IDS.includes(tab) ? tab : TAB_IDS[0];
  const body = [];
  if (data) {
    if (data.slides.length > 0) body.push(hero(data.slides));
    for (const r of data.rails) body.push(rail(r, "rail-" + String(r.id).replace(/[^A-Za-z0-9_-]/g, "_")));
  } else if (failed) {
    body.push({ type: "MaterialBanner", key: "loadFailed", role: "error", ...twin("brFailed"), action: { ...twin("brRetry", "label"), onTap: "retry" } });
  } else {
    body.push(heroSkeleton(), railSkeleton(1), railSkeleton(2), railSkeleton(3));
  }
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      // One bar instead of two (Kino 0.9.81+; an older Kino draws its own bar above and this one under it): the close button where
      // Kino's was and the plugin's logo where its name was, with no line under it.
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "close", icon: "close", ...twin("brClose", "labelText"), ...twin("brClose", "tooltip"), onPressed: { go: { close: true } } },
      // On a TV the search is a button of the bar (a floating one is hard to reach with a remote); elsewhere it floats.
      actions: tv ? [{ type: "IconButton", key: "searchButton", icon: "search", ...twin("brSearch", "labelText"), ...twin("brSearch", "tooltip"), onPressed: "openSearch" }, gear] : [gear],
      // On a TV the tabs sit in the bar beside the logo; elsewhere they are pinned under it.
      title: tv ? { type: "Row", key: "titleRow", gap: 24, crossAxisAlignment: "center", children: [logo(), tabBar(active)] } : logo(),
    },
    ...(tv ? {} : { floatingActionButton: { type: "FloatingActionButton", key: "searchFab", icon: "search", ...twin("brSearch", "tooltip"), onPressed: "openSearch" } }),
    body: { type: "Column", key: "page", children: [
      ...(tv ? [] : [{ type: "Column", key: "tabsRow", padding: { compact: 0, expanded: 24 }, children: [tabBar(active)] }]),
      { type: "SingleChildScrollView", key: "browse-" + active, flex: 1, children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: body }] },
    ] },
    ...(pending ? { every: { ms: POLL_MS, event: "tick" } } : {}),
  };
}

/** The settings page (route "settings"): the same one bar, then Kino's own form of the plugin's settings. */
function settingsView() {
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar", mergeWithKinoBar: true, dense: true, divider: false,
      leading: { type: "IconButton", key: "back", icon: "arrow_back", ...twin("brBack", "labelText"), ...twin("brBack", "tooltip"), onPressed: "back" },
      title: logo(),
    },
    body: { type: "SingleChildScrollView", key: "settings-page", children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: [{ type: "settings", key: "form" }] }] },
  };
}

/** The search page (route "search"). `status`: "idle", "loading", "done" or "fail". */
function searchView({ query, status, items, history, device }) {
  const tv = device === "tv";
  const searchForm = () => ({
    type: "Form", key: "searchForm", onSubmitted: "search", gap: 8, children: tv
      ? [{ type: "Row", key: "searchRow", gap: 16, crossAxisAlignment: "center", children: [
        { type: "TextField", key: "q", kind: "text", value: query, ...twin("brSearchHint", "labelText"), maxLength: 100, autofocus: true, weight: 1 },
        { type: "ElevatedButton", key: "searchGo", ...twin("brSearch", "labelText"), icon: "search", submit: true },
      ] }]
      : [
        { type: "TextField", key: "q", kind: "text", value: query, ...twin("brSearchHint", "labelText"), maxLength: 100, autofocus: true },
        { type: "ElevatedButton", key: "searchGo", ...twin("brSearch", "labelText"), icon: "search", submit: true },
      ],
  });
  const body = tv ? [] : [searchForm()];
  if (status === "fail") {
    body.push({ type: "MaterialBanner", key: "searchFailed", role: "error", ...twin("brSearchFailed"), action: { ...twin("brRetry", "label"), onTap: "sretry" } });
  } else if (status === "done" && items) {
    if (items.length === 0) body.push({ type: "Text", ...twin("brNoResults"), color: "muted" });
    else body.push({ type: "titleGrid", key: "results", columns: { compact: 3, expanded: 6 }, items: items.slice(0, SEARCH_CAP) });
  } else if (status !== "idle") {
    body.push(gridSkeleton());
  } else if (history.length > 0) {
    body.push({ type: "Text", ...twin("brSearchedBefore"), style: "h4" });
    body.push({ type: "titleGrid", key: "history", columns: { compact: 3, expanded: 6 }, items: history.slice(0, SEARCH_CAP) });
  }
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar", mergeWithKinoBar: true, dense: true, divider: false,
      leading: { type: "IconButton", key: "back", icon: "arrow_back", ...twin("brBack", "labelText"), ...twin("brBack", "tooltip"), onPressed: "back" },
      ...(tv ? { title: searchForm() } : twin("brSearchTitle", "title")),
    },
    body: { type: "SingleChildScrollView", key: "search-page", children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: body }] },
    ...(status === "loading" ? { every: { ms: 1000, event: "stick" } } : {}),
  };
}

// ---- what the screen keeps and how it reacts

/** The rows of a tab: Home's (without its live channels, which have their own tab in Kino) or the section's. */
async function loadTabRows(tab) {
  if (tab === "inicio") return home();
  const page = await section({ tab: SECTION_TAB[tab] });
  return page.rows;
}

function makeBrowse() {
  const memo = new Map(); // tab -> { data, whole: loaded in this sandbox }
  const get = (k) => { try { return kino.storage.get(k); } catch { return null; } };
  const set = (k, v, opts) => { try { kino.storage.set(k, v, opts); } catch { /* full storage: no copy */ } };

  function readSnap(tab) {
    try {
      const o = JSON.parse(get(SNAP_PREFIX + hash(base()) + tab) || "null");
      return o && Date.now() - o.at < SNAP_TTL_MS && o.data && Array.isArray(o.data.rails) ? o.data : null;
    } catch { return null; }
  }
  function writeSnap(tab, data) {
    // Trimmed until it fits: the storage is shared with the manifest, genre and art caches.
    for (let per = 10; per >= 3; per -= 2) {
      const slim = { slides: data.slides, rails: data.rails.map((r) => ({ ...r, items: r.items.slice(0, per) })) };
      const text = JSON.stringify({ at: Date.now(), data: slim });
      if (text.length <= SNAP_MAX) { set(SNAP_PREFIX + hash(base()) + tab, text, { ttlMs: SNAP_TTL_MS }); return; }
    }
  }

  const stored = () => { const t = get(TAB_KEY); return TAB_IDS.includes(t) ? t : null; };

  function dataOf(tab) {
    if (memo.has(tab)) return memo.get(tab).data;
    const snap = readSnap(tab);
    if (snap) { memo.set(tab, { data: snap, whole: false }); return snap; }
    return null;
  }

  const slim = (c) => ({ id: c.id, ref: c.ref, title: c.title, kind: c.kind, ...(c.poster ? { poster: c.poster } : {}) });
  function readHistory() {
    try {
      const a = JSON.parse(get(HIST_KEY) || "[]");
      return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.ref === "string" && typeof c.title === "string").slice(0, HIST_MAX) : [];
    } catch { return []; }
  }
  function rememberFound(cards) {
    try {
      const fresh = cards.slice(0, 12).map(slim);
      const ids = new Set(fresh.map((c) => c.id));
      set(HIST_KEY, JSON.stringify([...fresh, ...readHistory().filter((c) => !ids.has(c.id))].slice(0, HIST_MAX)));
    } catch { /* the page just has no history */ }
  }

  let found = null; // { q, items }: the last search

  /** The tabs to load: the active one if it is not whole yet, then the rest (not on a TV: a weak box pays for every row). */
  function needed(tab, device) {
    const order = [tab, ...TAB_IDS.filter((x) => x !== tab)];
    return order.filter((x, i) => (i === 0 || device !== "tv") && !(memo.get(x) && memo.get(x).whole));
  }

  function view(ctx) {
    const st = ctx.state && typeof ctx.state === "object" ? ctx.state : {};
    if (ctx.route && ctx.route.name === "settings") return settingsView();
    if (ctx.route && ctx.route.name === "search") {
      const query = typeof st.sq === "string" ? st.sq : "";
      const items = found && found.q === query ? found.items : null;
      const status = query === "" ? "idle" : st.sstate === "fail" ? "fail" : items ? "done" : "loading";
      return searchView({ query, status, items, history: query === "" ? readHistory() : [], device: ctx.device });
    }
    const tab = TAB_IDS.includes(st.tab) ? st.tab : (stored() || TAB_IDS[0]);
    const pending = Array.isArray(st.pending) && st.pending.length > 0;
    return browseView({ tab, data: dataOf(tab), pending, failed: !!(st.failed && st.failed[tab]), device: ctx.device });
  }

  async function load(tab) {
    const data = tabOf(await loadTabRows(tab));
    if (data) { memo.set(tab, { data, whole: true }); writeSnap(tab, data); }
    return data !== null;
  }

  const events = {
    open({ state, device }) {
      const tab = TAB_IDS.includes(state.tab) ? state.tab : stored() || TAB_IDS[0];
      dataOf(tab);
      return { state: { tab, pending: needed(tab, device), failed: null } };
    },
    tab({ value, arg, state }) {
      const tab = TAB_IDS.includes(value) ? value : TAB_IDS.includes(arg) ? arg : null;
      if (!tab) return null;
      set(TAB_KEY, tab);
      dataOf(tab);
      const failed = { ...(state.failed || {}) };
      delete failed[tab];
      const pending = [tab, ...(Array.isArray(state.pending) ? state.pending.filter((x) => x !== tab) : [])];
      return { state: { tab, pending: memo.get(tab) && memo.get(tab).whole ? pending.slice(1) : pending, failed } };
    },
    retry({ state, device }) {
      const tab = TAB_IDS.includes(state.tab) ? state.tab : TAB_IDS[0];
      return { state: { failed: null, pending: [tab, ...needed(tab, device).filter((x) => x !== tab)] } };
    },
    async tick({ state }) {
      const pending = Array.isArray(state.pending) ? state.pending : [];
      if (pending.length === 0) return null;
      const [next, ...rest] = pending;
      const failed = { ...(state.failed || {}) };
      try {
        if (await load(next)) delete failed[next]; else failed[next] = true;
      } catch (e) {
        kino.log("screen tab " + next + " failed: " + ((e && e.code) || "error"));
        failed[next] = true;
      }
      return { state: { pending: rest, failed } };
    },
    openSearch() { return { route: { push: "search" }, state: { sq: "", sstate: null } }; },
    search({ value, route }) {
      const q = value && typeof value.q === "string" ? value.q.trim().slice(0, 100) : "";
      if (q === "") return null;
      const state = { sq: q, sstate: "loading" };
      return route && route.name === "search" ? { state } : { route: { push: "search" }, state };
    },
    // The search page's timer: one search per press, then no timer.
    async stick({ state }) {
      const q = typeof state.sq === "string" ? state.sq : "";
      if (q === "" || state.sstate !== "loading") return null;
      try {
        const out = await search({ q, type: "any" });
        found = { q, items: (Array.isArray(out) ? out : []).slice(0, 60).map(cardOf) };
        rememberFound(found.items);
        return { state: { sstate: "done" } };
      } catch (e) {
        kino.log("screen search failed: " + ((e && e.code) || "error"));
        return { state: { sstate: "fail" } };
      }
    },
    sretry({ state }) { return typeof state.sq === "string" && state.sq !== "" ? { state: { sstate: "loading" } } : null; },
    // The gear: the plugin's settings are a page of their own, one Back away.
    go({ arg }) { return arg === "settings" ? { route: { push: "settings" }, state: { fromBrowse: true } } : null; },
    back({ state, route }) {
      // The settings page opened on its own (from the settings button) closes; pushed from the gear, or the search page, it pops.
      if (route && route.name === "settings" && !state.fromBrowse) return { close: true };
      return { route: { pop: true }, state: { sq: null, sstate: null } };
    },
  };

  async function event(ev) {
    const handler = Object.hasOwn(events, ev.name) ? events[ev.name] : null;
    return handler ? (await handler({ ...ev, state: ev.state || {} })) ?? null : null;
  }

  return { view, event };
}

let browseInstance = null;
const browseScreen = () => browseInstance || (browseInstance = makeBrowse());

/** `screen(ctx)`: the plugin's own home (a pure view: it draws what it holds and never waits for the addon). */
export async function screen(ctx) {
  await null;
  return browseScreen().view(ctx && typeof ctx === "object" ? ctx : {});
}

/** `screenEvent(ev)`: the screen's events (its timers load a tab or a search, one per call). */
export async function screenEvent(ev) {
  await null;
  return browseScreen().event(ev && typeof ev === "object" ? ev : {});
}


// ---- 9. settings -------------------------------------------------------------------------------------------------

function detailOf(e) {
  return (e && (e.userMessage || e.code)) || "error";
}

export async function settingsStatus() {
  try {
    const manifest = await loadManifest(false);
    const cat = manifest.catalogs[0];
    const count = cat ? (await liveMetas(cat, null, null, 10000)).length : 0;
    return { serverStatus: t("online", { channels: count }) };
  } catch (e) {
    return { serverStatus: t("offline", { detail: detailOf(e) }) };
  }
}

/** Walks the same road a person does (manifest, a title from the catalog, its sources, a live channel). */
export async function action(key) {
  if (key !== "checkConn") return null;
  let manifest;
  try { manifest = await loadManifest(true); } catch (e) { return { message: t("stepManifest", { detail: detailOf(e) }) }; }
  let imdb;
  try {
    const first = ((await tmdb("/trending/movie/week")).results || [])[0];
    if (!first) throw kino.error("unavailable", "empty");
    imdb = String((await tmdb(`/movie/${first.id}/external_ids`)).imdb_id || "");
  } catch (e) { return { message: t("stepTitles", { detail: detailOf(e) }) }; }
  try {
    if (!/^tt\d+$/.test(imdb) || !streamFor(await streamsOf(`/stream/movie/${imdb}.json`), false)) throw kino.error("unavailable", "no streams");
  } catch (e) { return { message: t("stepStream", { detail: detailOf(e) }) }; }
  try {
    const cat = manifest.catalogs[0];
    const metas = cat ? await liveMetas(cat, null, null, 15000) : [];
    if (!metas.length || !streamFor(await streamsOf(`/stream/tv/${enc(metas[0].id)}.json`), true)) throw kino.error("unavailable", "no live");
  } catch (e) { return { message: t("stepLive", { detail: detailOf(e) }) }; }
  return { message: t("ok") };
}
