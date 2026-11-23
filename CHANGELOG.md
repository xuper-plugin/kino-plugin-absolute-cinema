# Changelog

## 1.4.6

- **A copy that plays goes first.** On a Redmi Note 9 Pro, Monsters vs Aliens sat on "Cargando video…" for minutes: the first copy was a 10 GB 1080p MKV from a Drive "download" server (and the size order had put a 10-bit HEVC one ahead of it), while 546 MB archive.org MP4s of the same film were last. Copies that are 10-bit / Hi10, HDR / Dolby Vision, AV1, REMUX or over 8 GB now go after every copy likely to play on a phone or a TV box, whatever their quality; among the rest, H.264 before HEVC. The same film now starts in ~13 s.
- **The first copies are peeked at** (2 KB, together, 4 s each) before one is handed to the player: one that refuses or errors goes last, a slow one after those that answer. `"fetchHosts": "any"` so the peek reaches the copies' own servers without a permission dialog.

## 1.4.5

- **Fixes `home thrown`** (210 events in 14 days): the saved-copy guard used `setTimeout` and `clearTimeout`, which do not exist in Kino, so its `finally` threw a ReferenceError. It now waits in short `kino.sleep` steps and stops as soon as the fresh build settles (the kit's validator had been warning about both lines).
- Home and rows answer from the saved copy at the 12 s guard: the fresh request that used to go on behind it kept running, and Kino waits for it before it delivers the answer. It is now dropped with the call; a copy older than the guard is refreshed by the next call that finishes in time. The plugin asks Kino to drop the requests a call leaves running (`globalThis.__kinoDropPendingFetches = true`, read by Kino 0.9.54 and later; an older Kino ignores it), with a test (`test/dropFetches.test.mjs`).
