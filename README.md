# Absolute Cinema plugin for Kino

A Kino plugin that bridges Kino to an Absolute Cinema addon (Stremio addon protocol, direct HTTP sources, no torrents).

Home, the tabs and search follow the addon's own catalogs, in the order its configuration chose (platforms, trending, anime...); TMDB (`kino.tmdb`, `kino.meta`) is the fallback and gives episodes. Video, subtitles and live TV come from the addon. The addon has no sources under Kitsu ids, so anime is played through the IMDb id Kino's anime mapping gives.
The addon's address is a setting (Ajustes del plugin ▸ Dirección de tu addon): paste the `manifest.json` address of your
own configuration. Empty uses the basic setup, without any profile.

| Kino | From |
| --- | --- |
| `screen` (Kino 0.9.74+) | The plugin's own home: one bar with the logo, the settings gear and search, tabs (Inicio, Cine, Series, Anime), a slider of featured titles and the addon's rows. An older Kino keeps the section below. |
| player panel | Three tabs while a title plays: this copy (label, resolution, network, stalls), a TMDB summary (rating, genres, synopsis, cast) and preferences (quality and maximum size, applied from the next play). |
| `home` | Live channels plus the addon's first catalogs, in its order. |
| `section` | Tabs Cine, Series, Anime (the addon's catalogs of each type) and En vivo; with no catalogs from the addon, TMDB rows and a Plataformas tab. |
| `categories`, `browse` | Tiles for each platform and genre; "Ver más" with TMDB paging. |
| `search`, `details`, `episodes` | The addon's search catalogs (TMDB search as fallback); `kino.meta` and the addon's `/meta`. |
| `resolve`, `subtitles` | The addon's `stream` and `subtitles` resources by IMDb id; the best copy plays first, the rest go in the Server menu. |
| `channels`, `liveSearch` | The addon's live TV catalogs (read from its manifest on every run). |
| settings | Address, rows on Home, preferred quality, maximum size, connection check. |

Check it locally: `node sdk/validate.mjs absolute-cinema` and `node sdk/run.mjs absolute-cinema resolve '{"k":"movie","t":603,"m":"tt0133093"}'`.
