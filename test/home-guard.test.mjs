// Home and the section tabs answer from the saved copy after a guard. The guard used `setTimeout`/`clearTimeout`, which do not exist in Kino
// (the `finally` threw a ReferenceError: `home thrown` on the board). The tests run with those globals removed, as Kino has them, and a virtual clock.
import test from "node:test";
import assert from "node:assert/strict";

const SAVED = [{ id: "saved-row", title: "Guardada", items: [{ id: "a", ref: "x", title: "A", kind: "movie" }] }];

function install({ fetch, withCopy = true }) {
  const clock = { t: 1_800_000_000_000 };
  const realNow = Date.now;
  Date.now = () => clock.t;
  const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  delete globalThis.setTimeout;
  delete globalThis.clearTimeout;
  const mem = new Map();
  globalThis.kino = {
    lang: "es-CO",
    config: { get: () => "" },
    storage: { get: (k) => (withCopy && k.startsWith("home1:") ? JSON.stringify({ at: clock.t, rows: SAVED }) : mem.get(k) ?? null), set: (k, v) => { mem.set(k, v); }, remove: (k) => { mem.delete(k); } },
    log() {},
    sleep: async (ms) => { clock.t += ms; },
    error: (code, message) => Object.assign(new Error(message), { code }),
    fetch,
  };
  return { clock, restore: () => { Date.now = realNow; Object.assign(globalThis, real); } };
}
let n = 0;
const load = () => import("../plugin.js?x=" + ++n);

test("a fresh Home that never answers: the saved copy is served at the guard, with no setTimeout in the runtime", async () => {
  const t = install({ fetch: () => new Promise(() => {}) });
  try {
    const { home } = await load();
    const t0 = t.clock.t;
    const rows = await home();
    assert.deepEqual(rows.map((r) => r.id), ["saved-row"]);
    const took = t.clock.t - t0;
    assert.ok(took >= 11_500 && took <= 13_000, "answered at the guard: " + took + " ms");
  } finally { t.restore(); }
});

test("a fresh Home that fails at once: the saved copy answers at once", async () => {
  const t = install({ fetch: async () => { throw Object.assign(new Error("net"), { code: "network" }); } });
  try {
    const { home } = await load();
    const t0 = t.clock.t;
    const rows = await home();
    assert.deepEqual(rows.map((r) => r.id), ["saved-row"]);
    assert.ok(t.clock.t - t0 < 5_000, "well before the guard (the client's own retries aside): " + (t.clock.t - t0));
  } finally { t.restore(); }
});

test("with no saved copy a failing Home is an empty list, not an exception", async () => {
  const t = install({ fetch: async () => { throw Object.assign(new Error("net"), { code: "network" }); }, withCopy: false });
  try {
    const { home } = await load();
    assert.deepEqual(await home(), []);
  } finally { t.restore(); }
});
