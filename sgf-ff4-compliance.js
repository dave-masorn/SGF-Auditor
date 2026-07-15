'use strict';

let fs, path;
if (typeof require !== 'undefined') {
  try {
    fs = require('fs');
    path = require('path');
  } catch (e) {}
}

// ============================================================
// SECTION 1: GO-SPECIFIC CONFIGURATION
// ============================================================

const GO = {
  GM: 1,
  FF: 4,
  MIN_BOARD: 1,
  MAX_BOARD: 52,
  DEFAULT_SIZE: 19,
};

const ROOT_PROPS = new Set(['FF', 'GM', 'SZ', 'AP', 'CA', 'ST']);
const GAME_INFO_PROPS = new Set([
  'AN', 'BR', 'BT', 'CP', 'DT', 'EV', 'GC', 'GN', 'ON', 'OT',
  'PB', 'PC', 'PW', 'RE', 'RO', 'RU', 'SO', 'TM', 'US', 'WR', 'WT',
]);
const MOVE_PROPS = new Set(['B', 'W', 'KO', 'MN']);
const SETUP_PROPS = new Set(['AB', 'AW', 'AE', 'PL']);
const NODE_ANNO_PROPS = new Set(['C', 'N', 'DM', 'GB', 'GW', 'UC', 'HO', 'V']);
const MOVE_ANNO_PROPS = new Set(['BM', 'TE', 'DO', 'IT']);
const MARKUP_PROPS = new Set(['TR', 'SQ', 'CR', 'MA', 'LB', 'AR', 'LN', 'SL', 'DD', 'VW']);
const MISC_PROPS = new Set(['FG', 'PM']);
const TIMING_PROPS = new Set(['BL', 'WL', 'OB', 'OW']);
const ALL_STANDARD_PROPS = new Set([
  ...ROOT_PROPS, ...GAME_INFO_PROPS, ...MOVE_PROPS, ...SETUP_PROPS,
  ...NODE_ANNO_PROPS, ...MOVE_ANNO_PROPS, ...MARKUP_PROPS, ...MISC_PROPS,
  ...TIMING_PROPS,
]);

const PROP_DEFS = {
  FF:  { type: 'number',  nodes: ['root'],         required: true,  min: 4, max: 4, single: true },
  GM:  { type: 'number',  nodes: ['root'],         required: true,  min: 1, max: 1, single: true },
  SZ:  { type: 'size',    nodes: ['root'],         required: false, min: 1, max: 52 },
  AP:  { type: 'compose', nodes: ['root'],         required: false, composeTypes: ['simpletext', 'simpletext'] },
  CA:  { type: 'simpletext', nodes: ['root'],      required: false },
  ST:  { type: 'number',  nodes: ['root'],         required: false, min: 0, max: 3 },
  AN:  { type: 'simpletext', nodes: ['game-info'], required: false },
  BR:  { type: 'simpletext', nodes: ['game-info'], required: false },
  BT:  { type: 'simpletext', nodes: ['game-info'], required: false },
  CP:  { type: 'simpletext', nodes: ['game-info'], required: false },
  DT:  { type: 'date',      nodes: ['game-info'], required: false },
  EV:  { type: 'simpletext', nodes: ['game-info'], required: false },
  GC:  { type: 'text',       nodes: ['game-info'], required: false },
  GN:  { type: 'simpletext', nodes: ['game-info'], required: false },
  ON:  { type: 'simpletext', nodes: ['game-info'], required: false },
  OT:  { type: 'simpletext', nodes: ['game-info'], required: false },
  PB:  { type: 'simpletext', nodes: ['game-info'], required: false },
  PC:  { type: 'simpletext', nodes: ['game-info'], required: false },
  PW:  { type: 'simpletext', nodes: ['game-info'], required: false },
  RE:  { type: 'result',     nodes: ['game-info'], required: false },
  RO:  { type: 'simpletext', nodes: ['game-info'], required: false },
  RU:  { type: 'simpletext', nodes: ['game-info'], required: false },
  SO:  { type: 'simpletext', nodes: ['game-info'], required: false },
  TM:  { type: 'real',       nodes: ['game-info'], required: false },
  US:  { type: 'simpletext', nodes: ['game-info'], required: false },
  WR:  { type: 'simpletext', nodes: ['game-info'], required: false },
  WT:  { type: 'simpletext', nodes: ['game-info'], required: false },
  B:   { type: 'move',     nodes: ['move'],         required: false, single: true },
  W:   { type: 'move',     nodes: ['move'],         required: false, single: true },
  KO:  { type: 'none',     nodes: ['move'],         required: false, single: true },
  MN:  { type: 'number',   nodes: ['move'],         required: false, single: true },
  AB:  { type: 'list_point', nodes: ['setup'],      required: false },
  AW:  { type: 'list_point', nodes: ['setup'],      required: false },
  AE:  { type: 'list_point', nodes: ['setup'],      required: false },
  PL:  { type: 'color',    nodes: ['setup'],        required: false, single: true },
  C:   { type: 'text',     nodes: ['any'],          required: false },
  N:   { type: 'simpletext', nodes: ['any'],        required: false, single: true },
  DM:  { type: 'double',   nodes: ['any'],          required: false, single: true },
  GB:  { type: 'double',   nodes: ['any'],          required: false, single: true },
  GW:  { type: 'double',   nodes: ['any'],          required: false, single: true },
  UC:  { type: 'double',   nodes: ['any'],          required: false, single: true },
  HO:  { type: 'double',   nodes: ['any'],          required: false, single: true },
  V:   { type: 'real',     nodes: ['any'],          required: false, single: true },
  BM:  { type: 'double',   nodes: ['move'],         required: false, single: true, needsMove: true },
  TE:  { type: 'double',   nodes: ['move'],         required: false, single: true, needsMove: true },
  DO:  { type: 'none',     nodes: ['move'],         required: false, single: true, needsMove: true },
  IT:  { type: 'none',     nodes: ['move'],         required: false, single: true, needsMove: true },
  TR:  { type: 'list_point', nodes: ['any'],        required: false },
  SQ:  { type: 'list_point', nodes: ['any'],        required: false },
  CR:  { type: 'list_point', nodes: ['any'],        required: false },
  MA:  { type: 'list_point', nodes: ['any'],        required: false },
  LB:  { type: 'list_compose', nodes: ['any'],      required: false, composeTypes: ['point', 'simpletext'] },
  AR:  { type: 'list_compose', nodes: ['any'],      required: false, composeTypes: ['point', 'point'] },
  LN:  { type: 'list_compose', nodes: ['any'],      required: false, composeTypes: ['point', 'point'] },
  SL:  { type: 'list_point', nodes: ['any'],        required: false },
  DD:  { type: 'elist_point', nodes: ['any'],       required: false, inherit: true },
  VW:  { type: 'elist_point', nodes: ['any'],       required: false, inherit: true },
  FG:  { type: 'fg',       nodes: ['any'],          required: false, single: true },
  PM:  { type: 'number',   nodes: ['any'],          required: false, inherit: true, min: 0, max: 2, single: true },
  BL:  { type: 'real',     nodes: ['move'],         required: false },
  WL:  { type: 'real',     nodes: ['move'],         required: false },
  OB:  { type: 'number',   nodes: ['move'],         required: false },
  OW:  { type: 'number',   nodes: ['move'],         required: false },
};

// ============================================================
// SECTION 2: SGF PARSER
// ============================================================

function parseSGF(input) {
  let pos = 0;
  const errors = [];

  function peek() { return pos < input.length ? input[pos] : null; }
  function advance() { const ch = input[pos]; pos++; return ch; }

  function skipWS() {
    while (pos < input.length && /\s/.test(input[pos])) pos++;
  }

  function makePos() {
    let line = 1, col = 1;
    for (let i = 0; i < pos && i < input.length; i++) {
      if (input[i] === '\n') { line++; col = 1; } else { col++; }
    }
    return { line, col };
  }

  function expect(ch) {
    skipWS();
    if (peek() !== ch) {
      const p = makePos();
      errors.push({ severity: 'error', message: `Expected '${ch}', found '${peek() || 'EOF'}'`, position: p });
      return false;
    }
    advance();
    return true;
  }

  function parseCollection() {
    const gameTrees = [];
    skipWS();
    while (peek() === '(') {
      const gt = parseGameTree();
      if (gt) gameTrees.push(gt);
      skipWS();
    }
    if (gameTrees.length === 0) {
      errors.push({ severity: 'error', message: 'No game trees found in collection', position: makePos() });
    }
    return { type: 'Collection', gameTrees, position: { line: 1, col: 1 } };
  }

  function parseGameTree() {
    const startPos = makePos();
    if (!expect('(')) return null;
    const sequence = parseSequence();
    const variations = [];
    skipWS();
    while (peek() === '(') {
      const v = parseGameTree();
      if (v) variations.push(v);
      skipWS();
    }
    if (!expect(')')) {
      errors.push({ severity: 'error', message: 'Unclosed game tree', position: startPos });
    }
    return { type: 'GameTree', sequence, variations, position: startPos };
  }

  function parseSequence() {
    const nodes = [];
    skipWS();
    while (peek() === ';') {
      const n = parseNode();
      if (n) nodes.push(n);
      skipWS();
    }
    return nodes;
  }

  function parseNode() {
    const startPos = makePos();
    advance();
    const properties = [];
    skipWS();
    while (peek() && peek() !== ';' && peek() !== '(' && peek() !== ')') {
      if (/[A-Z]/.test(peek())) {
        const p = parseProperty();
        if (p) properties.push(p);
      } else {
        const p = makePos();
        errors.push({ severity: 'error', message: `Unexpected character '${peek()}' in node`, position: p });
        advance();
      }
      skipWS();
    }
    return { type: 'Node', properties, position: startPos };
  }

  function parseProperty() {
    const startPos = makePos();
    const ident = parseIdent();
    if (!ident) return null;
    const values = [];
    skipWS();
    while (peek() === '[') {
      const v = parseValue();
      if (v !== null) values.push(v);
      skipWS();
    }
    if (values.length === 0) {
      errors.push({ severity: 'error', message: `Property '${ident}' has no values`, position: startPos });
      return null;
    }
    return { type: 'Property', ident, values, position: startPos };
  }

  function parseIdent() {
    let ident = '';
    const startPos = makePos();
    while (peek() && /[A-Z]/.test(peek())) {
      ident += advance();
    }
    if (ident.length === 0) {
      errors.push({ severity: 'error', message: 'Expected property identifier', position: startPos });
      return null;
    }
    if (ident.length > 2) {
      errors.push({ severity: 'warning', message: `Property identifier '${ident}' exceeds 2 characters`, position: startPos });
    }
    return ident;
  }

  function parseValue() {
    const startPos = makePos();
    if (!expect('[')) return null;
    let raw = '';
    while (peek() !== null && peek() !== ']') {
      if (peek() === '\\') {
        raw += advance();
        if (peek() !== null) raw += advance();
      } else {
        raw += advance();
      }
    }
    if (peek() === null) {
      errors.push({ severity: 'error', message: 'Unclosed property value', position: startPos });
      return null;
    }
    advance();
    return raw;
  }

  try {
    const tree = parseCollection();
    return { tree, errors };
  } catch (e) {
    errors.push({ severity: 'error', message: `Fatal parse error: ${e.message}`, position: makePos() });
    return { tree: null, errors };
  }
}

// ============================================================
// SECTION 3: UNESCAPE HELPER
// ============================================================

function unescapeSGF(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && i + 1 < raw.length) {
      out += raw[i + 1];
      i++;
    } else {
      out += raw[i];
    }
  }
  return out;
}

function unescapeForValidation(raw) {
  const unesc = unescapeSGF(raw);
  return unesc.replace(/[\r\n\t ]+/g, ' ');
}

// ============================================================
// SECTION 4: VALUE VALIDATORS
// ============================================================

function validateNone(value) {
  if (value !== '') return 'Value must be empty';
  return null;
}

function validateNumber(value) {
  if (!/^[+-]?\d+$/.test(value)) return 'Invalid number format';
  return null;
}

function parseNumber(value) {
  return parseInt(value, 10);
}

function validateReal(value) {
  if (!/^[+-]?\d+(\.\d+)?$/.test(value)) return 'Invalid real number format';
  return null;
}

function validateDouble(value) {
  if (value !== '1' && value !== '2') return 'Double must be "1" or "2"';
  return null;
}

function validateColor(value) {
  if (value !== 'B' && value !== 'W') return 'Color must be "B" or "W"';
  return null;
}

function validatePoint(value, w, h) {
  if (value.length !== 2) return 'Point must be exactly 2 lowercase letters';
  const c0 = value.charCodeAt(0);
  const c1 = value.charCodeAt(1);
  if (c0 < 97 || c0 > 122 || c1 < 97 || c1 > 122) return 'Point coordinates must be lowercase letters';
  const col = c0 - 97;
  const row = c1 - 97;
  if (col >= w) return `Column '${value[0]}' (index ${col}) exceeds board width ${w}`;
  if (row >= h) return `Row '${value[1]}' (index ${row}) exceeds board height ${h}`;
  return null;
}

function validateMove(value, w, h) {
  if (value === '') return null;
  return validatePoint(value, w, h);
}

function validateStone(value, w, h) {
  return validatePoint(value, w, h);
}

function checkUnescapedBrackets(raw) {
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\') { i++; continue; }
    if (raw[i] === ']') return 'Unescaped \']\' in value';
  }
  return null;
}

function validateSimpleText(raw) {
  const err = checkUnescapedBrackets(raw);
  if (err) return err;
  return null;
}

function validateText(raw) {
  const err = checkUnescapedBrackets(raw);
  if (err) return err;
  return null;
}

function validateDate(value) {
  const unesc = unescapeForValidation(value);
  if (!/^\d{4}(-\d{2}(-\d{2})?)?/.test(unesc)) return 'Date must start with YYYY format';
  if (/[/\\.,\s]/.test(unesc)) return 'Date must use "-" separator only (ISO format YYYY-MM-DD)';
  const parts = unesc.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(trimmed)) {
      return `Invalid date segment: "${trimmed}"`;
    }
  }
  return null;
}

function validateResult(value) {
  const unesc = unescapeForValidation(value);
  if (unesc === '0' || unesc === 'Draw' || unesc === 'Void' || unesc === '?') return null;
  if (/^B\+([0-9]+(\.[0-9]+)?|R(esign)?|T(ime)?|F(orfeit)?)$/.test(unesc)) return null;
  if (/^W\+([0-9]+(\.[0-9]+)?|R(esign)?|T(ime)?|F(orfeit)?)$/.test(unesc)) return null;
  return `Invalid result format: "${unesc}"`;
}

function validateSizeValue(value) {
  if (/^[+-]?\d+$/.test(value)) {
    const n = parseInt(value, 10);
    if (n < GO.MIN_BOARD || n > GO.MAX_BOARD) return `Board size ${n} out of range (${GO.MIN_BOARD}–${GO.MAX_BOARD})`;
    return null;
  }
  if (/^[+-]?\d+:[+-]?\d+$/.test(value)) {
    const [a, b] = value.split(':');
    const w = parseInt(a, 10);
    const h = parseInt(b, 10);
    if (w === h) return `Square board ${w}x${h} must not use compose type (use SZ[${w}])`;
    if (w < GO.MIN_BOARD || w > GO.MAX_BOARD) return `Board width ${w} out of range`;
    if (h < GO.MIN_BOARD || h > GO.MAX_BOARD) return `Board height ${h} out of range`;
    return null;
  }
  return 'Invalid size format';
}

function validateFG(value) {
  if (value === '') return null;
  if (/^[+-]?\d+:.+$/.test(value)) return null;
  return 'Invalid figure format';
}

function validateComposeValue(raw, type1, type2, w, h) {
  let depth = 0;
  let splitIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\') { i++; continue; }
    if (raw[i] === ':') {
      if (depth === 0) { splitIdx = i; break; }
    }
  }
  if (splitIdx === -1) return 'Compose missing \':\' separator';
  const left = raw.substring(0, splitIdx);
  const right = raw.substring(splitIdx + 1);
  const e1 = validateSingleValue(left, type1, w, h);
  if (e1) return `Left part: ${e1}`;
  const e2 = validateSingleValue(right, type2, w, h);
  if (e2) return `Right part: ${e2}`;
  return null;
}

function validateSingleValue(raw, type, w, h) {
  switch (type) {
    case 'none': return validateNone(raw);
    case 'number': return validateNumber(raw);
    case 'real': return validateReal(raw);
    case 'double': return validateDouble(raw);
    case 'color': return validateColor(raw);
    case 'point': return validatePoint(raw, w, h);
    case 'move': return validateMove(raw, w, h);
    case 'stone': return validateStone(raw, w, h);
    case 'simpletext': return validateSimpleText(raw);
    case 'text': return validateText(raw);
    case 'size': return validateSizeValue(raw);
    case 'result': return validateResult(raw);
    case 'date': return validateDate(raw);
    case 'fg': return validateFG(raw);
    default: return null;
  }
}

// ============================================================
// SECTION 5: TREE VALIDATOR
// ============================================================

function validateTree(tree, filename) {
  const issues = [];
  const stats = { nodes: 0, properties: 0, gameTrees: tree.gameTrees.length, variations: 0, moves: 0 };
  const board = { width: GO.DEFAULT_SIZE, height: GO.DEFAULT_SIZE };

  function addIssue(severity, msg, pos) {
    issues.push({ severity, message: msg, position: pos || null });
  }

  function detectBoardSize(props) {
    for (const p of props) {
      if (p.ident === 'SZ' && p.values.length > 0) {
        const raw = p.values[0];
        if (/^[+-]?\d+$/.test(raw)) {
          const n = parseInt(raw, 10);
          board.width = n;
          board.height = n;
        } else if (/^[+-]?\d+:[+-]?\d+$/.test(raw)) {
          const [a, b] = raw.split(':');
          board.width = parseInt(a, 10);
          board.height = parseInt(b, 10);
        }
      }
    }
  }

  function classifyNode(props) {
    const idents = new Set(props.map(p => p.ident));
    const hasMove = [...MOVE_PROPS].some(id => idents.has(id));
    const hasSetup = [...SETUP_PROPS].some(id => idents.has(id));
    const hasRoot = [...ROOT_PROPS].some(id => idents.has(id));
    const hasGameInfo = [...GAME_INFO_PROPS].some(id => idents.has(id));
    if (hasRoot) return 'root';
    if (hasSetup && !hasMove) return 'setup';
    if (hasMove && !hasSetup) return 'move';
    if (hasGameInfo && !hasMove && !hasSetup) return 'game-info';
    return 'any';
  }

  function validateNode(node, isRootNode, hasGameInfoOnPath) {
    stats.nodes++;
    const seenIdents = new Map();
    const nodeType = classifyNode(node.properties);
    let hasMoveInNode = false;

    for (const prop of node.properties) {
      stats.properties++;

      const ident = prop.ident;
      const def = PROP_DEFS[ident];

      if (!ALL_STANDARD_PROPS.has(ident)) {
        addIssue('warning', `Unknown property '${ident}'`, prop.position);
      }

      if (seenIdents.has(ident)) {
        addIssue('error', `Duplicate property '${ident}' in node`, prop.position);
      }
      seenIdents.set(ident, prop);

      if (ident === 'B' || ident === 'W') hasMoveInNode = true;

      if (ident === 'B' || ident === 'W') stats.moves++;

      if (def) {
        if (isRootNode && !def.nodes.includes('root') && !def.nodes.includes('any')) {
          if (def.nodes.includes('game-info')) {
            /* game-info in root is fine */
          } else {
            addIssue('error', `Property '${ident}' is not allowed in root node`, prop.position);
          }
        }

        if (!isRootNode && def.nodes.includes('root')) {
          addIssue('error', `Root property '${ident}' found in non-root node`, prop.position);
        }

        if (ident !== 'FF' && ident !== 'GM' && !isRootNode && def.nodes.includes('root')) {
          /* already caught above */
        }
      }
    }

    const hasSetup = [...SETUP_PROPS].some(id => seenIdents.has(id));
    const hasMove = [...MOVE_PROPS].some(id => seenIdents.has(id));
    if (hasSetup && hasMove) {
      addIssue('error', 'Move and setup properties mixed in same node', node.position);
    }

    if (isRootNode) {
      for (const [ident, def] of Object.entries(PROP_DEFS)) {
        if (def.required && !seenIdents.has(ident)) {
          addIssue('error', `Required root property '${ident}' is missing`, node.position);
        }
      }
    }

    const nodeClass = classifyNode(node.properties);
    if (nodeClass !== 'root' && nodeClass !== 'any' && nodeClass !== 'game-info') {
      for (const [ident, def] of Object.entries(PROP_DEFS)) {
        if (seenIdents.has(ident) && def.nodes.includes('root') && !def.nodes.includes('any')) {
          /* already caught above */
        }
      }
    }

    if (nodeClass === 'game-info') {
      if (hasGameInfoOnPath) {
        addIssue('error', 'Multiple game-info nodes on same path in tree', node.position);
      }
    }

    for (const [ident, prop] of seenIdents) {
      const def = PROP_DEFS[ident];
      if (!def) continue;

      if (def.needsMove && !hasMoveInNode) {
        addIssue('error', `Move annotation '${ident}' requires a move (B[] or W[]) in the same node`, prop.position);
      }

      const isListType = def.type === 'list_point' || def.type === 'elist_point' || def.type === 'list_compose';
      const allValues = [];

      for (let vi = 0; vi < prop.values.length; vi++) {
        const raw = prop.values[vi];
        let err = null;

        switch (def.type) {
          case 'size':
            err = validateSizeValue(raw);
            if (!err) {
              const tmp = { width: board.width, height: board.height };
              if (/^[+-]?\d+$/.test(raw)) {
                const n = parseInt(raw, 10);
                tmp.width = n; tmp.height = n;
              } else if (/^[+-]?\d+:[+-]?\d+$/.test(raw)) {
                const [a, b] = raw.split(':');
                tmp.width = parseInt(a, 10); tmp.height = parseInt(b, 10);
              }
            }
            break;
          case 'number': {
            const fmtErr = validateNumber(raw);
            if (fmtErr) {
              err = fmtErr;
            } else if (def.min !== undefined || def.max !== undefined) {
              const n = parseNumber(raw);
              if (def.min !== undefined && n < def.min) err = `Value ${n} below minimum ${def.min}`;
              if (def.max !== undefined && n > def.max) err = `Value ${n} above maximum ${def.max}`;
            }
            break;
          }
          case 'result':
            err = validateResult(raw);
            break;
          case 'date':
            err = validateDate(raw);
            break;
          case 'fg':
            err = validateFG(raw);
            break;
          case 'list_point': {
            err = validatePointList(raw, board.width, board.height);
            if (!err) {
              const expanded = unescapeSGF(raw);
              const pts = extractPointsFromList(expanded);
              allValues.push(...pts);
            }
            break;
          }
          case 'elist_point':
            if (raw !== '') {
              err = validatePointList(raw, board.width, board.height);
              if (!err) {
                const expanded = unescapeSGF(raw);
                const pts = extractPointsFromList(expanded);
                allValues.push(...pts);
              }
            }
            break;
          case 'list_compose': {
            if (def.composeTypes) {
              const [t1, t2] = def.composeTypes;
              err = validateComposeValue(raw, t1, t2, board.width, board.height);
            }
            if (!err) {
              const expanded = unescapeSGF(raw);
              allValues.push(expanded);
            }
            break;
          }
          case 'move':
            err = validateMove(raw, board.width, board.height);
            break;
          case 'point':
            err = validatePoint(raw, board.width, board.height);
            break;
          case 'stone':
            err = validateStone(raw, board.width, board.height);
            break;
          default:
            err = validateSingleValue(raw, def.type, board.width, board.height);
        }

        if (err) {
          addIssue('error', `Property '${ident}' value[${vi}]: ${err}`, prop.position);
        }
      }

      if (isListType && allValues.length > 0) {
        const unique = new Set(allValues);
        if (unique.size !== allValues.length) {
          addIssue('error', `Property '${ident}' has duplicate values across multiple [] brackets`, prop.position);
        }
      }
    }
  }

  function validatePointList(raw, w, h) {
    const points = [];
    const expanded = unescapeSGF(raw);
    let i = 0;
    while (i < expanded.length) {
      if (i + 1 >= expanded.length) return 'Incomplete point at end of list';
      const c1 = expanded.charCodeAt(i);
      const c2 = expanded.charCodeAt(i + 1);
      if (c1 < 97 || c1 > 122 || c2 < 97 || c2 > 122) {
        return `Invalid character in point list at position ${i}`;
      }
      if (i + 2 < expanded.length && expanded[i + 2] === ':') {
        if (i + 4 >= expanded.length) return 'Incomplete compressed rectangle';
        const c3 = expanded.charCodeAt(i + 3);
        const c4 = expanded.charCodeAt(i + 4);
        if (c3 < 97 || c3 > 122 || c4 < 97 || c4 > 122) {
          return `Invalid character in compressed rectangle at position ${i + 3}`;
        }
        const col1 = c1 - 97, row1 = c2 - 97;
        const col2 = c3 - 97, row2 = c4 - 97;
        if (col1 > col2 || row1 > row2) return `Invalid rectangle: upperLeft must be above-left of lowerRight`;
        if (col1 === col2 && row1 === row2) return '1x1 rectangles are illegal in compressed point lists';
        for (let r = row1; r <= row2; r++) {
          for (let c = col1; c <= col2; c++) {
            const pt = String.fromCharCode(97 + c) + String.fromCharCode(97 + r);
            const e = validatePoint(pt, w, h);
            if (e) return e;
            points.push(pt);
          }
        }
        i += 5;
      } else {
        const pt = expanded.substring(i, i + 2);
        const e = validatePoint(pt, w, h);
        if (e) return e;
        points.push(pt);
        i += 2;
      }
    }
    const unique = new Set(points);
    if (unique.size !== points.length) return 'Duplicate points in point list';
    return null;
  }

  function extractPointsFromList(expanded) {
    const pts = [];
    let i = 0;
    while (i < expanded.length) {
      if (i + 1 >= expanded.length) break;
      if (i + 2 < expanded.length && expanded[i + 2] === ':') {
        if (i + 4 >= expanded.length) break;
        const col1 = expanded.charCodeAt(i) - 97;
        const row1 = expanded.charCodeAt(i + 1) - 97;
        const col2 = expanded.charCodeAt(i + 3) - 97;
        const row2 = expanded.charCodeAt(i + 4) - 97;
        for (let r = row1; r <= row2; r++) {
          for (let c = col1; c <= col2; c++) {
            pts.push(String.fromCharCode(97 + c) + String.fromCharCode(97 + r));
          }
        }
        i += 5;
      } else {
        pts.push(expanded.substring(i, i + 2));
        i += 2;
      }
    }
    return pts;
  }

  function walkGameTree(gt, hasGameInfoOnPath, isTopLevel) {
    stats.variations += gt.variations.length;
    detectBoardSize(
      gt.sequence.length > 0 ? gt.sequence[0].properties : []
    );
    let pathGameInfo = hasGameInfoOnPath;
    gt.sequence.forEach((node, idx) => {
      const isRoot = isTopLevel && idx === 0;
      validateNode(node, isRoot, pathGameInfo);
      const idents = new Set(node.properties.map(p => p.ident));
      const hasGI = [...GAME_INFO_PROPS].some(id => idents.has(id));
      if (hasGI) pathGameInfo = true;
    });
    for (const v of gt.variations) {
      walkGameTree(v, pathGameInfo, false);
    }
  }

  for (const gt of tree.gameTrees) {
    walkGameTree(gt, false, true);
  }

  const compliant = issues.filter(i => i.severity === 'error').length === 0;
  return { compliant, issues, stats, board };
}

// ============================================================
// SECTION 6: REPORT GENERATOR
// ============================================================

function generateReport(result, filename) {
  const lines = [];
  const sep = '='.repeat(60);

  lines.push(`SGF FF[4] Compliance Report`);
  lines.push(`File: ${filename}`);
  lines.push(sep);
  lines.push(`Game trees:   ${result.stats.gameTrees}`);
  lines.push(`Nodes:        ${result.stats.nodes}`);
  lines.push(`Properties:   ${result.stats.properties}`);
  lines.push(`Moves:        ${result.stats.moves}`);
  lines.push(`Variations:   ${result.stats.variations}`);
  lines.push(`Board size:   ${result.board.width}x${result.board.height}`);
  lines.push(sep);

  if (result.issues.length === 0) {
    lines.push('');
    lines.push(`This SGF file [${filename}] is 100% compliant with SGF FF[4] Standard.`);
  } else {
    const errors = result.issues.filter(i => i.severity === 'error');
    const warnings = result.issues.filter(i => i.severity === 'warning');
    lines.push('');
    lines.push(`Issues found: ${result.issues.length} (${errors.length} errors, ${warnings.length} warnings)`);
    lines.push('');

    let idx = 1;
    for (const issue of result.issues) {
      const loc = issue.position ? `Line ${issue.position.line}, Col ${issue.position.line}` : 'Unknown';
      const tag = issue.severity.toUpperCase();
      lines.push(`  ${idx}. [${tag}] ${loc}: ${issue.message}`);
      idx++;
    }

    lines.push('');
    if (errors.length > 0) {
      lines.push(`This SGF file [${filename}] is NOT compliant with SGF FF[4] Standard.`);
    } else {
      lines.push(`This SGF file [${filename}] has warnings only (no errors). It is functionally compliant.`);
    }
  }

  lines.push(sep);
  return lines.join('\n');
}

// ============================================================
// SECTION 7: MAIN API
// ============================================================

function checkSGFContent(input, filename) {
  if (input.charCodeAt(0) === 0xFEFF) input = input.slice(1);

  const { tree, errors: parseErrors } = parseSGF(input);

  if (!tree || tree.gameTrees.length === 0) {
    const result = {
      compliant: false,
      issues: parseErrors.length > 0 ? parseErrors : [{ severity: 'error', message: 'Empty or unparseable SGF', position: null }],
      stats: { nodes: 0, properties: 0, gameTrees: 0, variations: 0, moves: 0 },
      board: { width: 19, height: 19 },
    };
    result.report = generateReport(result, filename);
    return result;
  }

  const { compliant, issues: treeIssues, stats, board } = validateTree(tree, filename);
  const allIssues = [...parseErrors, ...treeIssues];

  const result = { compliant, issues: allIssues, stats, board };
  result.report = generateReport(result, filename);
  return result;
}

function checkSGF(filePath) {
  let input;
  let filename;

  if (!fs || !path) {
    return {
      compliant: false,
      issues: [{ severity: 'error', message: 'File-based check is only supported in Node.js environment', position: null }],
      stats: { nodes: 0, properties: 0, gameTrees: 0, variations: 0, moves: 0 },
      board: { width: 19, height: 19 },
      report: 'Error: File-based check not supported in browser',
    };
  }

  try {
    filename = path.basename(filePath);
    input = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return {
      compliant: false,
      issues: [{ severity: 'error', message: `Cannot read file: ${e.message}`, position: null }],
      stats: { nodes: 0, properties: 0, gameTrees: 0, variations: 0, moves: 0 },
      board: { width: 19, height: 19 },
      report: `Error: Cannot read file '${filePath}': ${e.message}`,
    };
  }

  return checkSGFContent(input, filename);
}

// ============================================================
// SECTION 8: CLI
// ============================================================

if (typeof require !== 'undefined' && require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node sgf-ff4-compliance.js <file.sgf> [file2.sgf ...]');
    process.exit(1);
  }

  let allCompliant = true;
  for (const fp of args) {
    const result = checkSGF(fp);
    console.log(result.report);
    console.log('');
    if (!result.compliant) allCompliant = false;
  }

  process.exit(allCompliant ? 0 : 1);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkSGF, checkSGFContent, parseSGF, validateTree, generateReport };
} else if (typeof window !== 'undefined') {
  window.SGFCompliance = { checkSGFContent, checkSGF, parseSGF, validateTree, generateReport };
}
