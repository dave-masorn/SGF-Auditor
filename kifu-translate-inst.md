# kifu-translate.js — Integration Guide

`kifu-translate.js` is a dependency-free ES module that translates Go-related
content (player names, dan ranks, titles, and general text) from Japanese,
Chinese, and Korean into English. It was extracted from the `download-kifudepot.sh`
script's "English mode" and merged with the `foxwq` downloader's player lookups.

It runs in any modern browser and in Node.js 18+ (which ships `fetch`). No build
step, no npm install, no other files required.

---

## What the module does

| Source of truth | Scope | Example |
|---|---|---|
| `PLAYER_LOOKUP` | 153 known player names in JP / CN (simplified + traditional) / KR (Hangul) | `呉清源` → `Go Seigen`, `신진서` → `Shin Jinseo` |
| `RANK_MAP` | dan ranks, pro/amateur status | `九段` → `9-dan`, `초단` → `1-dan`, `プロ` → `Pro`, `业余` → `amateur` |
| `GO_TERMS` | Go vocabulary and title names | `本因坊` → `Honinbo`, `棋圣` → `Kisei`, `定式` → `joseki`, `中盘` → `middle game`, `바둑` → `Go` |
| Google Translate (gtx) | any other non-English text, cached | `第12期十段戦敗者復活戦2回戦` → `2nd round of the 12th Judansen loser's comeback match` |

Resolution order for any text: **local lookup → cache → Google Translate**.
Results are stored in an in-memory cache seeded from the project's
`.trans_cache.json` (48 known phrases resolve offline) and persisted to
`localStorage` in the browser, so repeat translations are instant and free.

---

## Quick integration (your two use cases)

Copy `kifu-translate.js` into your web app's folder, then import it as a module.

### 1. "Translate to English" button — translate everything inside an SGF

```js
import { translateSgf } from './kifu-translate.js';

const translated = await translateSgf(sgfText, { delayMs: 0 });
```

`translateSgf()` returns the same SGF with every non-English value replaced:

- Root `EV` / `GN` → Title Case translation
- Root `PB` / `PW` → player lookup
- Root `BR` / `WR` → rank lookup
- Root `PC` / `SO` / `US` / `ON` / `AN` / `CP` → plain translation
- `C` comments anywhere in the tree (including variations) → plain translation

Moves, coordinates, results (`RE`), komi, formatting, and variations are
preserved byte-for-byte. Feed the result straight back into your SGF editor.

### 2. "Download (English filename)" — rename at download time

```js
import { englishFilenameFromSgf } from './kifu-translate.js';

const fileName = await englishFilenameFromSgf(sgfText);
// e.g. "1973-09-19__2nd-Round-of-the-12th-Judansen-Loser's-Comeback-Match__Go-Seigen__Handa-Dogen__(W+2.5).sgf"

const blob = new Blob([translatedSgf], { type: 'application/x-go-sgf' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = fileName;
a.click();
```

The filename is built from the SGF's own root properties (`DT`, `EV`/`GN`,
`PB`, `PW`, `RE`), translating whatever is still in the original language.

### Suggested flow for both features combined

```js
import { translateSgf, englishFilenameFromSgf } from './kifu-translate.js';

const t = document.getElementById('translate-btn');
const d = document.getElementById('download-btn');

t.addEventListener('click', async () => {
  const eng = await translateSgf(currentSgf, { delayMs: 0 });
  setEditorSgf(eng);          // swap into your editor
});

d.addEventListener('click', async () => {
  const eng = await translateSgf(currentSgf, { delayMs: 0 });
  download(eng, await englishFilenameFromSgf(eng));
});
```

---

## Full API

### `translate(text, opts?) → Promise<string>`
Translate one string. Returns it unchanged for empty/ASCII input and on network
failure. Falls back to the original text rather than throwing.

### `translateRank(value, opts?) → Promise<string>`
Rank-oriented: checks `RANK_MAP`, then `translate()`.
`九段` → `9-dan`, `프로` → `Pro`.

### `resolvePlayer(name, opts?) → Promise<string>`
Player-oriented: empty → `Unknown`, ASCII → unchanged, `PLAYER_LOOKUP`, then
`translate()`.
`呉清源` → `Go Seigen`, `박정환` → `Park Junghwan`.

### `titleCase(text) → string`
Converts a translation to the shell script's Title Case
("…of the…" style; small words stay lowercase, numbers preserved).

### `rootProps(sgfText) → object`
Returns decoded root properties of an SGF (`{ EV, PB, PW, DT, RE, … }`).

### `translateSgf(sgfText, opts?) → Promise<string>`
Translate all translatable values inside an SGF file (see use case 1).

### `englishFilenameFromSgf(sgfText, opts?) → Promise<string>`
Derive an English download filename from an SGF file (see use case 2).

### Helpers
`englishFilename(date, ev, pb, pw, result)`, `filenamePart(s)`,
`sanitizeFilename(s)`, `isEnglish(s)`, `getCache()`, `loadCache(entries)`.

### Options object `opts`

| Option | Default | Meaning |
|---|---|---|
| `delayMs` | `100` | Throttle between Google requests (be polite / avoid rate limits). `0` for interactive buttons. |
| `fetchImpl` | `fetch` | Swap in a mock/alternative `fetch` for testing or server use. |

---

## Notes / behavior

- **CORS:** the Google Translate `gtx` endpoint is CORS-enabled, so no proxy is
  needed from a browser. If it ever becomes unavailable, the module simply keeps
  the original text (offline dictionaries still work).
- **SGF parsing:** lightweight and faithful — values are decoded (handles
  `\]`/`\\` escapes) and re-encoded after translation; the rest of the file is
  copied verbatim. Root node = the first node; comments are translated in every
  node. If the text has no `(;`, it is returned unchanged.
- **Cache:** module-local + `localStorage` (key `kifu.translate.cache.v1`) when
  available; safe in private mode / Node (silently disabled).
- **Extending:** add entries to `PLAYER_LOOKUP`, `RANK_MAP`, or `GO_TERMS` — they
  are exact-match only, so longer phrases always go through Google first.
- **Deterministic Go terms:** because lookups are exact matches, `プロ` → `Pro`,
  `초단` → `1-dan`, `名人` → `Meijin`, etc. resolve offline, never via Google.

---

## Node usage (scripting / testing)

```js
import { translateSgf, englishFilenameFromSgf } from './kifu-translate.js';

const fs = await import('node:fs');
const sgf = fs.readFileSync('game.sgf', 'utf8');
fs.writeFileSync('game-en.sgf', await translateSgf(sgf, { delayMs: 50 }));
console.log(await englishFilenameFromSgf(sgf, { delayMs: 50 }));
```

---

## Origin / provenance

- `download-kifudepot.sh` — KifuDepot downloader; English mode introduced the
  player/rank lookups, Google Translate call, Title Case and filename rules.
- `foxwq` — Fox Go downloader; contributed Korean (Hangul) player names and
  simplified-Chinese/alternate spellings, merged into `PLAYER_LOOKUP`.
- `.trans_cache.json` — seed cache of previously machine-translated phrases.
