# Changelog

## 1.4.5

- **Fixes `home thrown`** (210 events in 14 days): the saved-copy guard used `setTimeout` and `clearTimeout`, which do not exist in Kino, so its `finally` threw a ReferenceError. It now waits in short `kino.sleep` steps and stops as soon as the fresh build settles (the kit's validator had been warning about both lines).
- Home and rows answer from the saved copy at the 12 s guard: the fresh request that used to go on behind it kept running, and Kino waits for it before it delivers the answer. It is now dropped with the call; a copy older than the guard is refreshed by the next call that finishes in time. The plugin asks Kino to drop the requests a call leaves running (`globalThis.__kinoDropPendingFetches = true`, read by Kino 0.9.54 and later; an older Kino ignores it), with a test (`test/dropFetches.test.mjs`).
