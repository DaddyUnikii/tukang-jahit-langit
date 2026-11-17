# Tukang Jahit Langit

![best game](https://make.fun/badge/best-game-01.svg)
![rank](https://make.fun/badge/best-game-01/DaddyUnikii/tukang-jahit-langit/rank.svg)
![reward](https://make.fun/badge/best-game-01/DaddyUnikii/tukang-jahit-langit/reward.svg)

A small, offline puzzle game about mending a torn night sky. The sky has ripped
along the seams between eight islands; you are the tailor. Sew bridges of thread
between the pins, then walk a flock of fireflies home before a bridge gives way
under their weight.

Eight evenings, rising difficulty, three stars each — twenty-four in all.
Everything is drawn with Canvas2D and synthesised with oscillators: no image
files, no fonts, no network, no dependencies.

## How to play

Each evening is a graph. Numbered pins are islands, dashed lines are places a
seam could go, and one pin carries a small lit cottage — that is home.

- **Sew** a bridge by clicking two islands that a dashed link joins. A single
  thread carries one firefly; a **double** (two strands) carries up to three.
- **Guide** sends the flock one hop along the shortest way home. If the bridge
  under them is too thin for the flock, it snaps: the thread is lost with it and
  the evening is over.
- **Cut** takes a bridge back and refunds its thread — but never while the
  fireflies are standing on one of its ends. On the tight evenings you must sew a
  first seam, walk the flock across it, then cut it behind you to afford the next.
- **Undo** steps back one move; **Restart** begins the evening again.
- A flower on the way home is worth collecting.

Stars come from the move count: three if you finish within the evening's par,
two within half again as many, one otherwise, none if a seam snaps.

The first evening needs two sews and no cutting. The third is where cutting
starts to matter, and the last combines a single-file path, a flock of three and
a cut that has to be made behind you.

## Controls

| Action | Mouse | Keyboard |
| --- | --- | --- |
| Sew | click island, then island | `s` |
| Guide | click an island or a bridge | `g` / `Space` |
| Cut | click a bridge | `c` |
| Undo | toolbar | `u` / `z` |
| Restart | toolbar | `r` |
| One strand / two strands | toolbar | `1` / `2` |
| Help | toolbar | `h` |
| Book (evenings and stars) | toolbar | `b` |
| Language (English / Indonesian) | toolbar | — |
| Sound | toolbar | — |
| Close a window, or back out | click Close | `Escape` |

Progress (stars, unlocked evenings, language, mute) is saved in `localStorage`
under `tukang-jahit-langit-progress-v1` and survives a reload.

## Play it

Open `game/index.html` in a desktop browser, or serve the folder on loopback:

```sh
node server.mjs          # http://127.0.0.1:8080/
PORT=9000 node server.mjs
```

`server.mjs` serves `game/` only, on `127.0.0.1`, refuses any path that escapes
the folder with `403`, and answers `404` for anything missing.

## Tests

No npm packages, no browser, no build step: `node:test` plus a `node:vm` sandbox
that loads the six classic scripts with stubbed `window`, `document`,
`localStorage`, `requestAnimationFrame` and `AudioContext`.

```sh
node --test tests/*.test.mjs
```

- `tests/core.test.mjs` — the state engine: every error code, conservation,
  immutability, the deterministic route, snapping, stars.
- `tests/progress.test.mjs` — clamping of corrupt and out-of-range saves.
- `tests/render.test.mjs` — layout geometry at four viewports, hit testing, and
  that `draw` paints without reading or writing the state.
- `tests/controller.test.mjs` — the DOM controller: screens, modal locking, the
  keyboard and mouse routes, saving on a win.
- `tests/solutions.test.mjs` — replays `tests/solutions.json` through the real
  engine and the real controller: every evening is won with three stars.

## Packaging for make.fun

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` into the output directory and writes
`dossier.json` there through `buildDossier()` from `vendor/makefun-game.ts`, held
to the bounty's caps (160 KiB of text, four screenshots of 256 KiB, 993 files,
48 MiB, 1000-byte paths). `screenshots/` is deliberately empty in the repository
— the capture pass fills it — so when it holds no image the packaging step writes
one clearly named placeholder cover, a raster of the first evening's board, and
every remaining byte of the dossier is the real game.
