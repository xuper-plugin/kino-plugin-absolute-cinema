# Absolute Cinema plugin for Kino

A Kino plugin that bridges Kino to an Absolute Cinema addon (Stremio addon protocol, direct HTTP sources, no torrents).

Titles come from Kino's own TMDB access (`kino.tmdb`, `kino.meta`); the video, subtitles and live TV come from the addon.
The addon's address is a setting (Ajustes del plugin ▸ Dirección de tu addon): paste the `manifest.json` address of your
own configuration. Empty uses the basic setup, without any profile.

| Kino | From |
| --- | --- |
| `home` | A row of live channels plus movie and series rows alternating. |
| `section` | Tabs: Cine, Series, Anime, Plataformas (Netflix, Prime, Disney+, Hulu, Max, Apple TV+, Peacock, Paramount+), En vivo. |
| `categories`, `browse` | Tiles for each platform and genre; "Ver más" with TMDB paging. |
| `search`, `details`, `episodes` | TMDB search and `kino.meta`. |
| `resolve`, `subtitles` | The addon's `stream` and `subtitles` resources by IMDb id; the best copy plays first, the rest go in the Server menu. |
| `channels`, `liveSearch` | The addon's live TV catalogs (read from its manifest on every run). |
| settings | Address, rows on Home, preferred quality, maximum size, connection check. |

Check it locally: `node sdk/validate.mjs absolute-cinema` and `node sdk/run.mjs absolute-cinema resolve '{"k":"movie","t":603,"m":"tt0133093"}'`.
