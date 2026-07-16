/**
 * SGF FF[4] Auditor & Parser for Go Game ONLY
 * 
 * Exposes window.SGFAuditor with:
 * - parseSGF(sgfText) -> treeRoot
 * - GoBoard class -> board simulator
 * - auditSGF(treeRoot) -> { errors, warnings, gameInfo, movesList }
 * - detectPhases(movesList, boardSizeStr) -> { fusekiEnd, chubanEnd, phases }
 */
(function(global) {
    'use strict';

    // Parse rectangular board size e.g. "19:19" or "19"
    function parseBoardSize(szProp) {
        if (!szProp || szProp.length === 0) return { width: 19, height: 19 };
        let val = szProp[0];
        if (val.includes(':')) {
            let parts = val.split(':');
            let w = parseInt(parts[0], 10);
            let h = parseInt(parts[1], 10);
            return { width: isNaN(w) ? 19 : w, height: isNaN(h) ? 19 : h };
        } else {
            let s = parseInt(val, 10);
            return { width: isNaN(s) ? 19 : s, height: isNaN(s) ? 19 : s };
        }
    }

    // Convert SGF coordinate (e.g., "pd", "ab", "") into {x, y}
    function parseCoords(str, boardWidth) {
        if (!str || str === "" || (str === "tt" && boardWidth <= 19)) {
            return null; // Pass
        }
        if (str.length !== 2) {
            throw new Error("Invalid coordinate length: " + str);
        }
        
        function charToVal(c) {
            let code = c.charCodeAt(0);
            if (code >= 97 && code <= 122) { // a-z -> 0-25
                return code - 97;
            } else if (code >= 65 && code <= 90) { // A-Z -> 26-51
                return code - 65 + 26;
            }
            throw new Error("Invalid coordinate character: " + c);
        }
        
        let x = charToVal(str[0]);
        let y = charToVal(str[1]);
        return { x, y };
    }

    // Go Board Simulator class
    class GoBoard {
        constructor(width = 19, height = 19) {
            this.width = width;
            this.height = height;
            this.board = Array(height).fill(null).map(() => Array(width).fill(null)); // 'B', 'W', or null
            this.koPoint = null;
            this.captures = { B: 0, W: 0 };
        }

        clone() {
            let copy = new GoBoard(this.width, this.height);
            copy.board = this.board.map(row => [...row]);
            copy.koPoint = this.koPoint ? { ...this.koPoint } : null;
            copy.captures = { ...this.captures };
            return copy;
        }

        isOnBoard(x, y) {
            return x >= 0 && x < this.width && y >= 0 && y < this.height;
        }

        getStone(x, y) {
            return this.board[y][x];
        }

        setStone(x, y, color) {
            this.board[y][x] = color;
        }

        play(color, x, y) {
            if (!this.isOnBoard(x, y)) {
                return { success: false, error: "Out of bounds" };
            }
            if (this.getStone(x, y) !== null) {
                return { success: false, error: "Point is occupied" };
            }
            if (this.koPoint && this.koPoint.x === x && this.koPoint.y === y) {
                return { success: false, error: "Ko violation (immediate recapture is illegal)" };
            }

            // Place stone temporarily
            this.setStone(x, y, color);

            // Find captured opponent groups
            let opponent = color === 'B' ? 'W' : 'B';
            let capturedStones = [];
            let visited = Array(this.height).fill(null).map(() => Array(this.width).fill(false));

            for (let dy = 0; dy < this.height; dy++) {
                for (let dx = 0; dx < this.width; dx++) {
                    if (this.board[dy][dx] === opponent && !visited[dy][dx]) {
                        let group = [];
                        let hasLiberties = this.checkLiberties(dx, dy, opponent, visited, group);
                        if (!hasLiberties) {
                            capturedStones = capturedStones.concat(group);
                        }
                    }
                }
            }

            // Remove captured stones
            for (let pt of capturedStones) {
                this.setStone(pt.x, pt.y, null);
            }

            // Check for suicide
            let ownVisited = Array(this.height).fill(null).map(() => Array(this.width).fill(false));
            let ownGroup = [];
            let ownHasLiberties = this.checkLiberties(x, y, color, ownVisited, ownGroup);

            if (!ownHasLiberties) {
                // Suicide is illegal: revert captures and stone placement
                for (let pt of capturedStones) {
                    this.setStone(pt.x, pt.y, opponent);
                }
                this.setStone(x, y, null);
                return { success: false, error: "Suicide move is illegal" };
            }

            // Update capture count
            if (color === 'B') {
                this.captures.B += capturedStones.length;
            } else {
                this.captures.W += capturedStones.length;
            }

            // Check for Ko condition
            if (capturedStones.length === 1 && ownGroup.length === 1) {
                let liberties = this.getLibertiesOfGroup(x, y, color);
                if (liberties.length === 1 && liberties[0].x === capturedStones[0].x && liberties[0].y === capturedStones[0].y) {
                    this.koPoint = { x: capturedStones[0].x, y: capturedStones[0].y };
                } else {
                    this.koPoint = null;
                }
            } else {
                this.koPoint = null;
            }

            return { success: true, capturedCount: capturedStones.length };
        }

        checkLiberties(x, y, color, visited, group) {
            let queue = [{ x, y }];
            visited[y][x] = true;
            let hasLiberties = false;
            
            let head = 0;
            while (head < queue.length) {
                let curr = queue[head++];
                group.push(curr);
                
                let dirs = [{x: 0, y: 1}, {x: 0, y: -1}, {x: 1, y: 0}, {x: -1, y: 0}];
                for (let d of dirs) {
                    let nx = curr.x + d.x;
                    let ny = curr.y + d.y;
                    if (this.isOnBoard(nx, ny)) {
                        if (this.board[ny][nx] === null) {
                            hasLiberties = true;
                        } else if (this.board[ny][nx] === color && !visited[ny][nx]) {
                            visited[ny][nx] = true;
                            queue.push({ x: nx, y: ny });
                        }
                    }
                }
            }
            return hasLiberties;
        }

        getLibertiesOfGroup(x, y, color) {
            let visited = Array(this.height).fill(null).map(() => Array(this.width).fill(false));
            let queue = [{ x, y }];
            visited[y][x] = true;
            let liberties = [];
            let libertyKeys = new Set();
            
            let head = 0;
            while (head < queue.length) {
                let curr = queue[head++];
                
                let dirs = [{x: 0, y: 1}, {x: 0, y: -1}, {x: 1, y: 0}, {x: -1, y: 0}];
                for (let d of dirs) {
                    let nx = curr.x + d.x;
                    let ny = curr.y + d.y;
                    if (this.isOnBoard(nx, ny)) {
                        if (this.board[ny][nx] === null) {
                            let key = `${nx},${ny}`;
                            if (!libertyKeys.has(key)) {
                                libertyKeys.add(key);
                                liberties.push({ x: nx, y: ny });
                            }
                        } else if (this.board[ny][nx] === color && !visited[ny][nx]) {
                            visited[ny][nx] = true;
                            queue.push({ x: nx, y: ny });
                        }
                    }
                }
            }
            return liberties;
        }

        setupStone(color, x, y) {
            if (this.isOnBoard(x, y)) {
                this.setStone(x, y, color);
                this.koPoint = null;
            }
        }

        clearStone(x, y) {
            if (this.isOnBoard(x, y)) {
                this.setStone(x, y, null);
                this.koPoint = null;
            }
        }
    }

    // Core SGF Parser (Parses collection of GameTrees)
    function parseSGF(sgfText) {
        let index = 0;
        
        function skipWhitespace() {
            while (index < sgfText.length && /\s/.test(sgfText[index])) {
                index++;
            }
        }
        
        function parseValue() {
            if (sgfText[index] !== '[') return null;
            index++; // skip '['
            let value = "";
            while (index < sgfText.length) {
                if (sgfText[index] === '\\') {
                    index++;
                    if (index < sgfText.length) {
                        value += sgfText[index];
                        index++;
                    }
                } else if (sgfText[index] === ']') {
                    index++; // skip ']'
                    return value;
                } else {
                    value += sgfText[index];
                    index++;
                }
            }
            throw new Error("Unclosed property value bracket at index " + index);
        }
        
        function parseProperty() {
            skipWhitespace();
            let propIdent = "";
            while (index < sgfText.length && /[A-Z]/.test(sgfText[index])) {
                propIdent += sgfText[index];
                index++;
            }
            if (!propIdent) return null;
            
            let values = [];
            skipWhitespace();
            while (index < sgfText.length && sgfText[index] === '[') {
                let val = parseValue();
                values.push(val);
                skipWhitespace();
            }
            
            if (values.length === 0) {
                throw new Error("Property " + propIdent + " has no values at index " + index);
            }
            
            return { name: propIdent, values: values };
        }
        
        function parseNode() {
            skipWhitespace();
            if (sgfText[index] !== ';') return null;
            index++; // skip ';'
            
            let node = { properties: {} };
            while (index < sgfText.length) {
                let prop = parseProperty();
                if (!prop) break;
                if (node.properties[prop.name]) {
                    node.properties[prop.name] = node.properties[prop.name].concat(prop.values);
                } else {
                    node.properties[prop.name] = prop.values;
                }
            }
            return node;
        }
        
        function parseSequence() {
            let nodes = [];
            while (index < sgfText.length) {
                skipWhitespace();
                if (sgfText[index] !== ';') break;
                let node = parseNode();
                if (node) nodes.push(node);
            }
            return nodes;
        }
        
        function parseGameTree() {
            skipWhitespace();
            if (sgfText[index] !== '(') {
                throw new Error("GameTree must start with '(' at index " + index);
            }
            index++; // skip '('
            
            let sequence = parseSequence();
            let children = [];
            
            skipWhitespace();
            while (index < sgfText.length && sgfText[index] === '(') {
                children.push(parseGameTree());
                skipWhitespace();
            }
            
            if (sgfText[index] !== ')') {
                throw new Error("GameTree must end with ')' at index " + index);
            }
            index++; // skip ')'
            
            if (sequence.length === 0) {
                throw new Error("Empty sequence in GameTree at index " + index);
            }
            
            let root = sequence[0];
            let current = root;
            for (let i = 1; i < sequence.length; i++) {
                current.children = [sequence[i]];
                current = sequence[i];
            }
            current.children = children;
            
            return root;
        }
        
        let trees = [];
        let cleanText = sgfText.trim();
        if (cleanText === "") {
            throw new Error("SGF content is empty");
        }

        let firstChar = cleanText[0];
        if (firstChar !== '(') {
            // Find first '('
            let openIndex = cleanText.indexOf('(');
            if (openIndex === -1) {
                throw new Error("No valid SGF GameTree found (missing opening parenthesis)");
            }
            sgfText = cleanText.substring(openIndex);
        } else {
            sgfText = cleanText;
        }

        skipWhitespace();
        while (index < sgfText.length && sgfText[index] === '(') {
            try {
                trees.push(parseGameTree());
            } catch (e) {
                throw new Error("SGF Syntax Error: " + e.message);
            }
            skipWhitespace();
        }
        
        if (trees.length === 0) {
            throw new Error("No valid SGF GameTree collection found");
        }
        return trees;
    }

    // Go-Specific Compliance Auditor
    function auditSGF(treeRoot) {
        let errors = [];
        let warnings = [];
        let gameInfo = {
            blackPlayer: "Unknown",
            whitePlayer: "Unknown",
            blackRank: "",
            whiteRank: "",
            result: "Unknown",
            date: "Unknown",
            komi: 0,
            handicap: 0,
            rules: "Unknown",
            boardSize: "19x19"
        };

        if (!treeRoot) {
            return { errors: [{ type: "structure", msg: "Empty or invalid SGF GameTree" }], warnings: [], gameInfo, movesList: [] };
        }

        let root = treeRoot;

        // 1. Validate File Format (FF)
        if (root.properties.FF) {
            let ff = root.properties.FF[0];
            if (ff !== '4') {
                warnings.push({
                    type: "format",
                    msg: `File format is FF[${ff}]. Auditor is built for FF[4].`
                });
            }
        } else {
            warnings.push({
                type: "format",
                msg: "Missing File Format (FF) property. Assuming FF[4]."
            });
        }

        // 2. Enforce Game Type (GM) is Go (1)
        if (root.properties.GM) {
            let gm = root.properties.GM[0];
            if (gm !== '1') {
                errors.push({
                    type: "game_type",
                    msg: `Game type GM[${gm}] is not supported. This auditor is strictly for Go (GM[1]).`
                });
                return { errors, warnings, gameInfo, movesList: [] };
            }
        } else {
            warnings.push({
                type: "game_type",
                msg: "Missing Game Type (GM) property. Assuming Go (GM[1])."
            });
        }

        // Extract metadata
        if (root.properties.PB) gameInfo.blackPlayer = root.properties.PB[0];
        if (root.properties.PW) gameInfo.whitePlayer = root.properties.PW[0];
        if (root.properties.BR) gameInfo.blackRank = root.properties.BR[0];
        if (root.properties.WR) gameInfo.whiteRank = root.properties.WR[0];
        if (root.properties.RE) gameInfo.result = root.properties.RE[0];
        if (root.properties.DT) gameInfo.date = root.properties.DT[0];
        if (root.properties.KM) {
            gameInfo.komi = parseFloat(root.properties.KM[0]);
            if (isNaN(gameInfo.komi)) {
                warnings.push({ type: "metadata", msg: `Invalid Komi value: ${root.properties.KM[0]}` });
                gameInfo.komi = 0;
            }
        }
        if (root.properties.HA) {
            gameInfo.handicap = parseInt(root.properties.HA[0], 10);
            if (isNaN(gameInfo.handicap)) {
                warnings.push({ type: "metadata", msg: `Invalid Handicap value: ${root.properties.HA[0]}` });
                gameInfo.handicap = 0;
            }
        }
        if (root.properties.RU) gameInfo.rules = root.properties.RU[0];

        let sz = parseBoardSize(root.properties.SZ);
        gameInfo.boardSize = `${sz.width}x${sz.height}`;

        let board = new GoBoard(sz.width, sz.height);
        let movesList = [];

        function traverse(node, currentBoard, moveNum, isMainBranch) {
            let props = node.properties;
            
            // Check for move and setup in same node (illegal in SGF FF[4])
            let hasMove = props.B || props.W;
            let hasSetup = props.AB || props.AW || props.AE;
            
            if (props.B && props.W) {
                errors.push({
                    type: "spec",
                    msg: "SGF violation: node contains both Black (B) and White (W) moves.",
                    moveNum
                });
            }
            if (hasMove && hasSetup) {
                errors.push({
                    type: "spec",
                    msg: "SGF violation: node contains both move (B/W) and setup (AB/AW/AE) properties.",
                    moveNum
                });
            }

            // Apply Setup properties (AB, AW, AE)
            if (props.AB) {
                for (let val of props.AB) {
                    try {
                        let pt = parseCoords(val, currentBoard.width);
                        if (pt) currentBoard.setupStone('B', pt.x, pt.y);
                    } catch (e) {
                        errors.push({ type: "coordinate", msg: `Invalid AB coordinate: ${val}`, moveNum });
                    }
                }
            }
            if (props.AW) {
                for (let val of props.AW) {
                    try {
                        let pt = parseCoords(val, currentBoard.width);
                        if (pt) currentBoard.setupStone('W', pt.x, pt.y);
                    } catch (e) {
                        errors.push({ type: "coordinate", msg: `Invalid AW coordinate: ${val}`, moveNum });
                    }
                }
            }
            if (props.AE) {
                for (let val of props.AE) {
                    try {
                        let pt = parseCoords(val, currentBoard.width);
                        if (pt) currentBoard.clearStone(pt.x, pt.y);
                    } catch (e) {
                        errors.push({ type: "coordinate", msg: `Invalid AE coordinate: ${val}`, moveNum });
                    }
                }
            }

            // Check Handicap consistency on root setup
            if (isMainBranch && moveNum === 0 && gameInfo.handicap > 0) {
                let abCount = props.AB ? props.AB.length : 0;
                if (abCount !== gameInfo.handicap) {
                    warnings.push({
                        type: "consistency",
                        msg: `Handicap is set to HA[${gameInfo.handicap}], but found ${abCount} setup stones (AB).`
                    });
                }
            }

            // Handle Moves (B, W)
            let color = null;
            let moveVal = null;
            
            if (props.B) {
                color = 'B';
                moveVal = props.B[0];
            } else if (props.W) {
                color = 'W';
                moveVal = props.W[0];
            }

            if (color) {
                moveNum++;
                let pt = null;
                let isPass = false;
                
                try {
                    pt = parseCoords(moveVal, currentBoard.width);
                    if (!pt) isPass = true;
                } catch (e) {
                    errors.push({
                        type: "coordinate",
                        msg: `Invalid ${color === 'B' ? 'Black' : 'White'} move coordinate value: '${moveVal}'`,
                        moveNum
                    });
                }

                if (isPass) {
                    if (moveVal === "tt" && currentBoard.width <= 19) {
                        warnings.push({
                            type: "obsolete",
                            msg: `Obsolete pass format '${color}[tt]' used. In FF[4] it should be empty brackets '${color}[]'.`,
                            moveNum
                        });
                    }
                    if (isMainBranch) {
                        movesList.push({ color, isPass: true, moveNo: moveNum, capturedCount: 0 });
                    }
                } else if (pt) {
                    if (!currentBoard.isOnBoard(pt.x, pt.y)) {
                        errors.push({
                            type: "boundary",
                            msg: `Move ${color}[${moveVal}] is outside board boundary.`,
                            moveNum
                        });
                    } else {
                        // Check if occupied
                        let occupied = currentBoard.getStone(pt.x, pt.y);
                        if (occupied !== null) {
                            errors.push({
                                type: "rules",
                                msg: `Move ${color}[${moveVal}] played on occupied point.`,
                                moveNum
                            });
                        }

                        // Play stone
                        let res = currentBoard.play(color, pt.x, pt.y);
                        if (!res.success) {
                            errors.push({
                                type: "rules",
                                msg: `Illegal move: ${res.error} at ${moveVal}.`,
                                moveNum
                            });
                        }

                        if (isMainBranch) {
                            movesList.push({
                                color,
                                x: pt.x,
                                y: pt.y,
                                isPass: false,
                                moveNo: moveNum,
                                capturedCount: res.capturedCount || 0
                            });
                        }
                    }
                }
            }

            // Traverse children nodes
            if (node.children && node.children.length > 0) {
                node.children.forEach((child, idx) => {
                    let nextBoard = currentBoard.clone();
                    traverse(child, nextBoard, moveNum, isMainBranch && (idx === 0));
                });
            }
        }

        traverse(root, board, 0, true);

        return {
            errors,
            warnings,
            gameInfo,
            movesList
        };
    }

    // Go Phase Detector (Fuseki, Chuban, Yose)
    function detectPhases(movesList, boardSizeStr) {
        let totalMoves = movesList.length;
        if (totalMoves === 0) {
            return { fusekiEnd: 0, chubanEnd: 0, phases: [] };
        }
        
        let width = 19;
        if (boardSizeStr && boardSizeStr.includes('x')) {
            width = parseInt(boardSizeStr.split('x')[0], 10) || 19;
        }

        let moves = movesList.map((m, idx) => {
            if (m.isPass) {
                return { idx, isPass: true, line: 0, dist: 0, captured: 0 };
            }
            let prev = idx > 0 ? movesList[idx - 1] : null;
            let line = Math.min(m.x, width - 1 - m.x, m.y, width - 1 - m.y) + 1;
            let dist = 0;
            if (prev && !prev.isPass) {
                dist = Math.abs(m.x - prev.x) + Math.abs(m.y - prev.y);
            }
            return {
                idx,
                isPass: false,
                line,
                dist,
                captured: m.capturedCount || 0
            };
        });

        // 1. Detect Fuseki End / Chuban Start
        // Heuristic: Corner/side enclosure plays end, and direct fight/captures/center moves begin.
        let fusekiEnd = Math.min(45, Math.floor(totalMoves * 0.25));
        if (width < 13) {
            fusekiEnd = Math.min(15, Math.floor(totalMoves * 0.20));
        }

        let minFuseki = Math.min(10, Math.floor(totalMoves * 0.08));
        let maxFuseki = Math.min(60, Math.floor(totalMoves * 0.4));

        for (let i = minFuseki; i < Math.min(totalMoves, maxFuseki); i++) {
            let m = moves[i];
            // Capture occurs or played deep in center with close local response
            if (m.captured > 0 || (m.line >= 5 && m.dist > 0 && m.dist <= 3)) {
                fusekiEnd = i + 1; // Move number is index + 1
                break;
            }
        }

        // 2. Detect Chuban End / Yose Start
        // Heuristic: Fights in center settle, and players start plays on lines 1 & 2 (boundaries)
        let yoseStart = Math.floor(totalMoves * 0.75);
        let minChuban = Math.max(fusekiEnd + 10, Math.floor(totalMoves * 0.5));

        for (let i = minChuban; i < totalMoves - 8; i++) {
            let edgeMoves = 0;
            let localMoves = 0;
            let windowSize = Math.min(10, totalMoves - i);
            
            for (let j = 0; j < windowSize; j++) {
                let nextM = moves[i + j];
                if (nextM.line <= 2 || nextM.isPass) edgeMoves++;
                if (nextM.dist <= 2 || nextM.isPass) localMoves++;
            }
            
            // If 75% of moves in the window are low-line (edge) and local response (endgame boundary closing)
            if (edgeMoves >= windowSize * 0.75 && localMoves >= windowSize * 0.75) {
                yoseStart = i + 1;
                break;
            }
        }

        if (yoseStart <= fusekiEnd) {
            yoseStart = Math.min(totalMoves, fusekiEnd + Math.floor((totalMoves - fusekiEnd) * 0.6));
        }

        let phases = [];
        for (let i = 1; i <= totalMoves; i++) {
            if (i <= fusekiEnd) {
                phases.push("Fuseki");
            } else if (i <= yoseStart) {
                phases.push("Chuban");
            } else {
                phases.push("Yose");
            }
        }

        return {
            fusekiEnd,
            chubanEnd: yoseStart,
            phases
        };
    }

    // ── Properties Validation: DT (Date) & RE (Result) ──
    function validateSGFProperties(sgfText) {
        let errors = [];
        let warnings = [];

        if (!sgfText || !sgfText.trim()) {
            warnings.push({ type: "properties", msg: "Empty SGF content — nothing to validate." });
            return { errors, warnings };
        }

        // Extract root node properties via regex (first ';' after '(')
        let rootMatch = sgfText.match(/\(\s*;([\s\S]*?)(?:\(|$)/);
        if (!rootMatch) {
            warnings.push({ type: "properties", msg: "Could not locate root node for properties validation." });
            return { errors, warnings };
        }
        let rootNode = rootMatch[1];

        // ── Helper: extract first value of a property identifier ──
        function extractProp(source, ident) {
            // Match e.g. DT[2024-01-15] — property ident followed by one or more [value]s
            let re = new RegExp('\\b' + ident + '\\s*\\[([^\\]]*)\\]');
            let m = source.match(re);
            return m ? m[1] : null;
        }

        // ── Validate DT (Date) ──
        let dtRaw = extractProp(rootNode, 'DT');
        if (dtRaw === null) {
            warnings.push({
                type: "properties",
                msg: "Missing Date property (DT). SGF files should include a DT property with the game date."
            });
        } else {
            let dtVal = dtRaw.trim();
            // Basic single-day: YYYY-MM-DD
            let singleDay = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
            // Multi-day same month:   YYYY-MM-DD,DD
            let multiDaySameMonth = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]),(0[1-9]|[12]\d|3[01])$/;
            // Multi-day same year:    YYYY-MM-DD,MM-DD
            let multiDaySameYear = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]),(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
            // Multi-day diff year:    YYYY-MM-DD,YYYY-MM-DD
            let multiDayDiffYear = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]),\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

            let dtOk = singleDay.test(dtVal)
                    || multiDaySameMonth.test(dtVal)
                    || multiDaySameYear.test(dtVal)
                    || multiDayDiffYear.test(dtVal);

            if (!dtOk) {
                warnings.push({
                    type: "properties",
                    msg: `Invalid Date format (DT[${dtVal}]). Expected ISO format "YYYY-MM-DD" (optionally with multi-day extensions like "YYYY-MM-DD,DD", "YYYY-MM-DD,MM-DD", or "YYYY-MM-DD,YYYY-MM-DD").`
                });
            }
        }

        // ── Validate RE (Result) ──
        let reRaw = extractProp(rootNode, 'RE');
        if (reRaw === null) {
            warnings.push({
                type: "properties",
                msg: "Missing Result property (RE). SGF files should include an RE property with the game result."
            });
        } else {
            let reVal = reRaw.trim();
            // Valid patterns:
            //   0            (jigo / draw)
            //   ?            (unknown)
            //   B+score      e.g. B+2.5, B+0.5, B+64
            //   W+score      e.g. W+6.5, W+0.5, W+12
            //   B+R / W+R    (resignation)
            //   B+T / W+T    (time)
            //   B+F / W+F    (forfait)
            let rePattern = /^(0|\?|[BW]\+(\d+(\.\d+)?|R|T|F))$/;
            if (!rePattern.test(reVal)) {
                warnings.push({
                    type: "properties",
                    msg: `Invalid Result format (RE[${reVal}]). Expected one of: "0" (jigo), "B+score"/"W+score" (e.g. "B+2.5", "W+64"), "B+R"/"W+R" (resign), "B+T"/"W+T" (time), "B+F"/"W+F" (forfait), or "?" (unknown). Use .5 not 1/2 for half-point results.`
                });
            }
        }

        return { errors, warnings };
    }

    // Expose APIs
    global.SGFAuditor = {
        parseSGF,
        GoBoard,
        auditSGF,
        detectPhases,
        validateSGFProperties
    };

})(typeof window !== 'undefined' ? window : global);
