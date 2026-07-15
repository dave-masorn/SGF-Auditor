---
name: sgf-ff4-go
description: SGF FF[4] standard knowledge base scoped exclusively to Go (GM[1]). Used for validating SGF file compliance.
---

# SGF FF[4] for Go (GM[1]) — Compliance Reference

Source: locally archived at `/Users/davemasorn/AntiGravity/SGF-Auditor/red-bean/red-bean.com/sgf/`

## 1. SGF Basics (Go-specific)
- **Format**: Text-only. Contains game trees stored in pre-order as a tree of property lists.
- **Encoding**: US ASCII for identifiers/values. `CA` property defines charset for `SimpleText`/`Text` (default: ISO-8859-1).
- **Node Numbering**: Starting from zero (root=0).
- **Game identification**: Root node MUST contain `FF[4]` and `GM[1]`.

## 2. EBNF Definition
```
Collection  = GameTree { GameTree }
GameTree    = "(" Sequence { GameTree } ")"
Sequence    = Node { Node }
Node        = ";" { Property }
Property    = PropIdent PropValue { PropValue }
PropIdent   = UcLetter { UcLetter }
PropValue   = "[" CValueType "]"
```
- Whitespace is allowed anywhere between tokens.
- `'list of'`: one or more PropValues required.
- `'elist of'`: list of PropValues or empty `[]`.

## 3. Property Rules
- **Order**: Property order within a node is NOT fixed. Do not rely on value order.
- **Duplicates**: Only ONE instance of each property identifier per node.
- **Property Types**:
  - `move` — must not be mixed with `setup` in the same node.
  - `setup` — must not be mixed with `move` in the same node.
  - `root` — only in root nodes (first node of each top-level GameTree).
  - `game-info` — only one game-info node per path in the tree.
  - none — may appear anywhere.
- **Property Attributes**:
  - `inherit` — values persist to all child nodes until overridden or cleared (e.g., `VW[]`).
- **Unknown properties**: Should be preserved. If not possible, display a warning.
- **Private properties**: Must not reuse standard identifiers. Max 2 uppercase letters recommended.

## 4. Value Types
| Type | Format | Notes |
|---|---|---|
| None | `""` | Empty string |
| Number | `[+-]?digits` | Integer with optional sign |
| Real | `Number[.digits]` | Decimal allowed |
| Double | `"1"` or `"2"` | 1=normal, 2=emphasized |
| Color | `"B"` or `"W"` | |
| SimpleText | Any chars | Linebreaks→space. Soft breaks (`\`) removed. Must escape `]`, `\`, `:` (in Compose) |
| Text | Any chars | Hard linebreaks preserved. Soft breaks (`\`) removed. Same escaping as SimpleText |
| Point | Two lowercase letters `[xy]` | Go coordinates. Column=a–s, Row=a–s (max 19×19). |
| Move | Point or empty | Empty `[]` = pass. |
| Stone | Same as Point | Go has no distinguishable pieces. |
| Compose | `Type1:Type2` | e.g., `point:simpletext` for labels. |

### Go Coordinate System
- Format: `[xy]` where `x` = column (left→right), `y` = row (top→bottom).
- Both are lowercase letters: `a`=0, `b`=1, ..., `s`=18 (for 19×19).
- Default board: 19×19. Valid range: 1×1 to 52×52.
- Pass move: empty value `B[]` or `W[]`.

### Compressed Point Lists
- `"list of point"` may use rectangle notation: `[upperLeft:lowerRight]`.
- **1x1 rectangles are illegal** — must be listed as single points.
- Points must be unique; overlap and duplication forbidden.

### Text Escaping
- `\` is escape character. Char following `\` is inserted verbatim.
- Whitespace after `\` is still converted to space.
- Must escape: `]` → `\]`, `\` → `\\`, `:` → `\:` (only in Compose type).

## 5. Go Properties (FF[4])

### Root Properties (only in root node)
| Prop | Value Type | Required | Description |
|---|---|---|---|
| `FF` | Number (1–4) | YES | File format version. Must be `4`. |
| `GM` | Number (1) | YES | Game type. Must be `1` for Go. |
| `SZ` | Number \| Number:Number | No | Board size. Default 19×19. Range 1–52. Square boards MUST NOT use compose (e.g., `SZ[19:19]` illegal). |
| `AP` | SimpleText:SimpleText | No | Application name:version. |
| `CA` | SimpleText | No | Charset for Text/SimpleText. Default `ISO-8859-1`. |
| `ST` | Number (0–3) | No | Variation display style. |

### Game Info Properties (one game-info node per path)
| Prop | Value Type | Description |
|---|---|---|
| `PB` | SimpleText | Player Black |
| `PW` | SimpleText | Player White |
| `BR` | SimpleText | Black Rank (e.g., `"5d"`, `"3k"`) |
| `WR` | SimpleText | White Rank |
| `RE` | SimpleText | Result (see format below) |
| `DT` | SimpleText | Date (ISO: `YYYY-MM-DD`) |
| `RU` | SimpleText | Rules (`"Japanese"`, `"AGA"`, `"GOE"`, `"NZ"`) |
| `EV` | SimpleText | Event/Tournament |
| `GN` | SimpleText | Game Name |
| `GC` | Text | Game Comment |
| `TM` | Real | Time limit (seconds) |
| `AN` | SimpleText | Annotator |
| `BT` / `WT` | SimpleText | Black/White Team |
| `CP` | SimpleText | Copyright |
| `ON` | SimpleText | Opening |
| `OT` | SimpleText | Overtime description |
| `PC` | SimpleText | Place |
| `RO` | SimpleText | Round |
| `SO` | SimpleText | Source |
| `US` | SimpleText | User/enterer |

### RE (Result) Format for Go
- `"0"` or `"Draw"` — jigo
- `"B+" [score]` — black wins. Score is optional real number.
- `"W+" [score]` — white wins.
- Score examples: `"B+0.5"`, `"W+64"`, `"B+12.5"`
- `"B+R"` / `"B+Resign"` — resign
- `"W+R"` / `"W+Resign"`
- `"B+T"` / `"B+Time"` — time forfeit
- `"W+T"` / `"W+Time"`
- `"B+F"` / `"B+Forfeit"`
- `"W+F"` / `"W+Forfeit"`
- `"Void"` — no result / suspended
- `"?"` — unknown

### Move Properties
| Prop | Value Type | Description |
|---|---|---|
| `B` | Move | Black move. Empty `[]` = pass. |
| `W` | Move | White move. Empty `[]` = pass. |
| `KO` | None | Allow illegal move (ko). Requires B[] or W[] in same node. |
| `MN` | Number | Override move number. |

### Setup Properties
| Prop | Value Type | Description |
|---|---|---|
| `AB` | List of Point | Add black stones. Unique points required. |
| `AW` | List of Point | Add white stones. Unique points required. |
| `AE` | List of Point | Clear points. Unique points required. |
| `PL` | Color | Player to play next. |

### Node Annotation Properties
| Prop | Value Type | Description |
|---|---|---|
| `C` | Text | Comment |
| `N` | SimpleText | Node name |
| `DM` | Double | Even position |
| `GB` | Double | Good for Black |
| `GW` | Double | Good for White |
| `UC` | Double | Unclear position |
| `HO` | Double | Hotspot |
| `V` | Real | Estimated score (positive=Black, negative=White) |

### Move Annotation Properties (require B[] or W[] in same node)
| Prop | Value Type | Description |
|---|---|---|
| `BM` | Double | Bad move |
| `TE` | Double | Tesuji (good move) |
| `DO` | None | Doubtful move |
| `IT` | None | Interesting move |

### Markup Properties
| Prop | Value Type | Description |
|---|---|---|
| `TR` | List of Point | Triangle mark |
| `SQ` | List of Point | Square mark |
| `CR` | List of Point | Circle mark |
| `MA` | List of Point | X mark |
| `LB` | List of Point:SimpleText | Label. No length restriction in FF[4]. |
| `AR` | List of Point:Point | Arrow |
| `LN` | List of Point:Point | Line |
| `SL` | List of Point | Selected points |
| `DD` | Elist of Point | Dim/grey out (inherit) |
| `VW` | Elist of Point | View restriction (inherit) |

### Miscellaneous Properties
| Prop | Value Type | Description |
|---|---|---|
| `FG` | None \| Number:SimpleText | Figure for printing |
| `PM` | Number (0–2) | Print move numbers (inherit). 0=off, 1=on, 2=modulo 100. |

## 6. Validation Checklist (for compliance checker)
1. File parses without syntax errors
2. `FF[4]` present in every root node
3. `GM[1]` present in every root node
4. All property identifiers are valid (uppercase letters, 1–2 chars)
5. No duplicate property identifiers in any node
6. Root properties only appear in root nodes
7. Move and setup properties not mixed in same node
8. Game-info node constraint: at most one per path
9. All property values match their defined value types
10. Go coordinates within board bounds (`SZ`)
11. `SZ[19:19]` style square-compose is illegal
12. `RE` matches Go result format
13. `DT` matches ISO date format
14. Compressed point lists: no 1x1 rectangles, unique points
15. Text/SimpleText escaping is correct
16. Move annotation properties require a move in same node
