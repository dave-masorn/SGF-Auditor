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
        let line = 1;
        let col = 1;

        function advanceChar() {
            if (sgfText[index] === '\n') {
                line++;
                col = 1;
            } else {
                col++;
            }
            index++;
        }
        
        function skipWhitespace() {
            while (index < sgfText.length && /\s/.test(sgfText[index])) {
                advanceChar();
            }
        }
        
        function parseValue() {
            if (sgfText[index] !== '[') return null;
            advanceChar(); // skip '['
            let value = "";
            while (index < sgfText.length) {
                if (sgfText[index] === '\\') {
                    advanceChar();
                    if (index < sgfText.length) {
                        value += sgfText[index];
                        advanceChar();
                    }
                } else if (sgfText[index] === ']') {
                    advanceChar(); // skip ']'
                    return value;
                } else {
                    value += sgfText[index];
                    advanceChar();
                }
            }
            throw new Error("Unclosed property value bracket at index " + index);
        }
        
        function parseProperty() {
            skipWhitespace();
            let propIdent = "";
            while (index < sgfText.length && /[A-Z]/.test(sgfText[index])) {
                propIdent += sgfText[index];
                advanceChar();
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
            let nodeLine = line;
            let nodeCol = col;
            advanceChar(); // skip ';'
            
            let node = { properties: {}, location: { line: nodeLine, column: nodeCol, offset: index } };
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
            advanceChar(); // skip '('
            
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
            advanceChar(); // skip ')'
            
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

    // ── FF[4] Maximization Audit ──
    function maximizeSGF(sgfText) {
        if (!sgfText || !sgfText.trim()) {
            return { score: 0, categories: [], strengths: [], opportunities: [] };
        }

        // Helper: check if a property exists anywhere in the SGF
        function hasProp(id) {
            return new RegExp('\\b' + id + '\\s*\\[').test(sgfText);
        }
        // Helper: count occurrences of a property
        function countProp(id) {
            let m = sgfText.match(new RegExp('\\b' + id + '\\s*\\[', 'g'));
            return m ? m.length : 0;
        }
        // Helper: check if there are multiple game trees (variations at top level)
        function hasMultipleTrees() {
            let depth = 0;
            for (let i = 0; i < sgfText.length; i++) {
                if (sgfText[i] === '(') depth++;
            }
            return depth > 1;
        }
        // Helper: check if there are variation branches (child game trees inside a tree)
        function hasBranches() {
            // Count '(' that are NOT the very first opening paren
            let foundFirst = false;
            let treeCount = 0;
            for (let i = 0; i < sgfText.length; i++) {
                if (sgfText[i] === '(') {
                    if (!foundFirst) { foundFirst = true; }
                    else { treeCount++; }
                }
            }
            return treeCount > 0;
        }

        // ── Category definitions ──
        const categories = [
            {
                name: "Game Identity",
                weight: 0.20,
                features: [
                    { id: "PB", desc: "Player Black name", tag: "recommended", detail: "Identifies the Black player. Required by SGF FF[4] for any complete game record — omitting it makes the game unattributed." },
                    { id: "PW", desc: "Player White name", tag: "recommended", detail: "Identifies the White player. Required by SGF FF[4] for any complete game record." },
                    { id: "BR", desc: "Black player rank", tag: "recommended", detail: "States Black's rank (e.g. 4p, 1d). Helps engines and databases contextualize the game's strength level." },
                    { id: "WR", desc: "White player rank", tag: "recommended", detail: "States White's rank. Same purpose as BR for the White side." },
                    { id: "RE", desc: "Game result", tag: "mandatory", detail: "The outcome of the game (e.g. B+R, W+2.5). Mandatory for records — without it the game has no conclusion." },
                    { id: "DT", desc: "Game date", tag: "mandatory", detail: "ISO-formatted date (YYYY-MM-DD) of the game. Essential for chronological sorting and historical archives." },
                    { id: "KM", desc: "Komi", tag: "recommended", detail: "Compensation points given to White for going second. Required to understand the scoring context of the result." },
                    { id: "RU", desc: "Ruleset", tag: "recommended", detail: "Names the rules used (e.g. Japanese, Chinese, AGA). Different rules affect scoring, captures, and legal moves." },
                    { id: "EV", desc: "Event / tournament", tag: "recommended", detail: "Names the tournament, league, or context (e.g. 'Oteai', 'Kifu Cup'). Helps organize and search game collections." },
                    { id: "TM", desc: "Time limit", tag: "recommended", detail: "Total time allocated per player in seconds. SGF FF[4] requires a single Real number. Enables time-pressure analysis." }
                ]
            },
            {
                name: "Root Configuration",
                weight: 0.10,
                features: [
                    { id: "AP", desc: "Application identifier", tag: "recommended", detail: "Names the software that created the SGF file (e.g. 'SGF Auditor'). Useful for debugging format-specific quirks." },
                    { id: "CA", desc: "Charset (UTF-8)", tag: "recommended", detail: "Declares the character encoding. Non-ASCII names (CJK players) will corrupt without it." },
                    { id: "ST", desc: "Variation display style", tag: "optional", detail: "Controls how variation branches are displayed (0=none, 1=up, 2=down, 3=both). Affects how SGF viewers render alternatives." }
                ]
            },
            {
                name: "Game Tree Structure",
                weight: 0.15,
                features: [
                    { id: "__branches__", desc: "Variation branches (tree structure)", tag: "structural", detail: "SGF's tree structure allows storing alternative move sequences (variations). Without branches, the game is a single linear line." },
                    { id: "__nodeNames__", desc: "Node names (N) for navigation", tag: "recommended", detail: "The N property assigns a name to a node (e.g. 'Opening', 'Tsumego'). Enables quick navigation and referencing in viewers." },
                    { id: "__rootComment__", desc: "Root-level game summary comment", tag: "recommended", detail: "A C property on the root node summarizing the game context. Serves as a metadata-rich header beyond the standard properties." }
                ]
            },
            {
                name: "Move Annotations",
                weight: 0.15,
                features: [
                    { id: "C",  desc: "Comments on moves", tag: "recommended", detail: "Free-text commentary on a move. The primary way to add human-readable analysis and explanations to a game record." },
                    { id: "TE", desc: "Tesuji (good move) markers", tag: "optional", detail: "Marks a move as a tesuji (skillful tactical move). TE[1] = good move. Used by annotators to highlight key plays." },
                    { id: "BM", desc: "Bad move markers", tag: "optional", detail: "Marks a move as a bad play. BM[1] = bad move. Part of SGF's built-in annotation system for editorial review." },
                    { id: "IT", desc: "Interesting move markers", tag: "optional", detail: "Marks a move as interesting — not clearly good or bad, but worth noting. IT[1] = interesting." },
                    { id: "DO", desc: "Doubtful move markers", tag: "optional", detail: "Marks a move as doubtful — likely suboptimal but not outright bad. DO[1] = doubtful." },
                    { id: "HO", desc: "Hotspot markers", tag: "optional", detail: "Marks a critical or pivotal move. HO[1] = hotspot. Often used to flag turning points in the game." }
                ]
            },
            {
                name: "Position Annotations",
                weight: 0.10,
                features: [
                    { id: "DM", desc: "Even position marker", tag: "optional", detail: "Declares the position as even (balanced). DM[1] = clearly even, DM[2] = roughly even. Used in joseki/fuseki annotations." },
                    { id: "GB", desc: "Good for Black", tag: "optional", detail: "Declares the position favors Black. GB[1] = clearly good, GB[2] = somewhat good. Part of SGF's positional evaluation system." },
                    { id: "GW", desc: "Good for White", tag: "optional", detail: "Declares the position favors White. GW[1] = clearly good, GW[2] = somewhat good." },
                    { id: "UC", desc: "Unclear position", tag: "optional", detail: "Marks the position as unclear — neither side has a clear advantage. UC[1] = unclear." },
                    { id: "V",  desc: "Score estimate", tag: "optional", detail: "A numeric score estimate at this position (Real value). Positive = Black leads, negative = White leads. Useful for AI analysis output." }
                ]
            },
            {
                name: "Board Markup",
                weight: 0.15,
                features: [
                    { id: "CR", desc: "Circle markers", tag: "optional", detail: "Draws circles on board points. Commonly highlights key stones or intersections in diagrams." },
                    { id: "TR", desc: "Triangle markers", tag: "optional", detail: "Draws triangles on board points. Often marks important stones or areas of interest." },
                    { id: "SQ", desc: "Square markers", tag: "optional", detail: "Draws squares on board points. Used to highlight specific intersections in analysis." },
                    { id: "MA", desc: "Cross (X) markers", tag: "optional", detail: "Draws X marks on board points. Frequently used to mark dead stones or captured territories." },
                    { id: "LB", desc: "Text labels on board", tag: "optional", detail: "Places text labels on board intersections (e.g. LB[dd:A][ee:1]). Essential for annotated diagrams and teaching materials." },
                    { id: "AR", desc: "Arrows between points", tag: "optional", detail: "Draws arrows between two or more points. Used to show influence, direction of play, or move sequences." },
                    { id: "LN", desc: "Lines between points", tag: "optional", detail: "Draws lines connecting points. Similar to arrows but without direction. Used for territory boundaries or connections." },
                    { id: "DD", desc: "Dimmed points", tag: "optional", detail: "Dims (greys out) board points. Used to focus attention on specific areas by de-emphasizing others." },
                    { id: "SL", desc: "Selected points", tag: "optional", detail: "Highlights selected points on the board. Used in tsumego to mark which stones are part of a problem." },
                    { id: "TB", desc: "Black territory", tag: "optional", detail: "Marks points as Black territory. Used in scoring diagrams and endgame analysis." },
                    { id: "TW", desc: "White territory", tag: "optional", detail: "Marks points as White territory. Used in scoring diagrams and endgame analysis." }
                ]
            },
            {
                name: "Timing",
                weight: 0.05,
                features: [
                    { id: "BL", desc: "Black time remaining", tag: "optional", detail: "Records Black's remaining time in seconds at this move. Critical for time-pressure analysis and reconstructing the clock state." },
                    { id: "WL", desc: "White time remaining", tag: "optional", detail: "Records White's remaining time in seconds at this move. Same purpose as BL for White." },
                    { id: "OB", desc: "Black byo-yomi stones", tag: "optional", detail: "Number of byo-yomi periods or stones remaining for Black. Indicates how close Black is to timeout in byo-yomi." },
                    { id: "OW", desc: "White byo-yomi stones", tag: "optional", detail: "Number of byo-yomi periods or stones remaining for White. Same purpose as OB for White." }
                ]
            },
            {
                name: "Miscellaneous",
                weight: 0.05,
                features: [
                    { id: "FG", desc: "Figure / print diagram", tag: "optional", detail: "Defines a figure (diagram) for printing. FG[1] includes the current move; FG[0] or omitting shows the position without it." },
                    { id: "PM", desc: "Print move number mode", tag: "optional", detail: "Controls move numbering in printed diagrams. PM[1] = print all moves, PM[2] = print only last move." },
                    { id: "VW", desc: "View (visible board area)", tag: "optional", detail: "Restricts the visible board area for tsumego or局部 problems. Only the specified intersections are shown." },
                    { id: "MN", desc: "Move number override", tag: "optional", detail: "Overrides the automatic move number for a specific node. Useful when the linear numbering doesn't match the intended display." }
                ]
            },
            {
                name: "Setup (conditional)",
                weight: 0.05,
                features: [
                    { id: "AB", desc: "Add Black stones (setup)", tag: "conditional", detail: "Places Black stones on the board as an initial setup position. Used for tsumego, handicap games, and position replays." },
                    { id: "AW", desc: "Add White stones (setup)", tag: "conditional", detail: "Places White stones on the board as an initial setup position. Same purpose as AB for the White side." },
                    { id: "PL", desc: "Player to move indicator", tag: "conditional", detail: "Declares whose turn it is in a setup position (PL[B] or PL[W]). Required when the position doesn't follow from alternating moves." }
                ]
            }
        ];

        // ── Evaluate each category ──
        let totalScore = 0;
        let catResults = [];
        let strengths = [];
        let opportunities = [];

        for (let cat of categories) {
            let found = 0;
            let total = cat.features.length;
            let catStrengths = [];
            let catOpps = [];

            for (let feat of cat.features) {
                let present = false;

                if (feat.id === '__branches__') {
                    present = hasBranches();
                } else if (feat.id === '__nodeNames__') {
                    present = hasProp('N');
                } else if (feat.id === '__rootComment__') {
                    // Root comment: C property in the first node (root)
                    let rootMatch = sgfText.match(/\(\s*;([\s\S]*?)(?:\(|$)/);
                    present = rootMatch ? /\bC\s*\[/.test(rootMatch[1]) : false;
                } else {
                    present = hasProp(feat.id);
                }

                if (present) {
                    found++;
                    catStrengths.push(feat);
                } else {
                    catOpps.push(feat);
                }
            }

            let catScore = total > 0 ? Math.round((found / total) * 100) : 0;
            totalScore += catScore * cat.weight;

            catResults.push({
                name: cat.name,
                weight: cat.weight,
                score: catScore,
                found,
                total
            });

            strengths.push(...catStrengths.map(f => ({
                ...f, category: cat.name
            })));
            opportunities.push(...catOpps.map(f => ({
                ...f, category: cat.name
            })));
        }

        totalScore = Math.round(totalScore);

        return {
            score: totalScore,
            categories: catResults,
            strengths,
            opportunities
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

    // ── Auto-Fix: Stream Sanitizer — bracket escaping, stray artifact cleanup, TM consolidation ──

    // Fix 1: Escape unescaped closing brackets inside C[...] and N[...] text properties
    function fixEscapedBrackets(sgfText) {
        if (!sgfText) return { fixed: sgfText, changes: 0 };
        var changes = 0;
        // Match C[...] or N[...] with content, using DOTALL for multi-line
        var fixed = sgfText.replace(/([CN])\s*\[(.*?)\]/g, function(match, prop, content) {
            // Count unescaped ] in content
            var unescaped = content.replace(/\\\]/g, '').length - content.replace(/\\\]/g, '').replace(/\]/g, '').length;
            if (unescaped > 0) {
                changes++;
                var escaped = content.replace(/(?<!\\)\]/g, '\\]');
                return prop + '[' + escaped + ']';
            }
            return match;
        });
        return { fixed: fixed, changes: changes };
    }

    // Fix 2: Strip stray non-SGF artifacts (bullets, smart quotes, arrows, etc.) leaked outside brackets
    function fixStrayArtifacts(sgfText) {
        if (!sgfText) return { fixed: sgfText, changes: 0 };
        // Characters that are illegal outside SGF bracket context
        var strayPattern = /[\u2022\u25CF\u25CB\u2023\u2043\u2219\u203C\u203D\u2756\u2766\u2767\u2619\u275B\u275C\u275D\u275E\u2018\u2019\u201C\u201D\u2033\u2036\u00AB\u00BB\u2190\u2191\u2192\u2193\u2194\u2195\u21A6\u21A8\u21AB\u21AC\u21AD\u21B0\u21B1\u21B2\u21B3\u21B6\u21B7\u21BA\u21BB\u21BC\u21BD\u21BE\u21BF\u21C0\u21C1\u21C2\u21C3\u21C4\u21C5\u21C6\u21C7\u21C8\u21C9\u21CA\u21CB\u21CC\u21CD\u21CE\u21CF\u21D0\u21D1\u21D2\u21D3\u21D4\u21D5\u21D6\u21D7\u21D8\u21D9\u21DA\u21DB\u21DC\u21DD\u21DE\u21DF\u21E0\u21E1\u21E2\u21E3\u21E4\u21E5\u21E6\u21E7\u21E8\u21E9\u21EA\u21EB\u21EC\u21ED\u21EE\u21EF\u21F0\u21F1\u21F2\u21F3\u21F4\u21F5\u21F6\u21F7\u21F8\u21F9\u21FA\u21FB\u21FC\u21FD\u21FE\u21FF\u27F0\u27F1\u27F2\u27F3\u27F4\u27F5\u27F6\u27F7\u27F8\u27F9\u27FA\u27FB\u27FC\u27FD\u27FE\u27FF\u2900\u2901\u2902\u2903\u2904\u2905\u2906\u2907\u2908\u2909\u290A\u290B\u290C\u290D\u290E\u290F\u2910\u2911\u2912\u2913\u2914\u2915\u2916\u2917\u2918\u2919\u291A\u291B\u291C\u291D\u291E\u291F\u2920\u2921\u2922\u2923\u2924\u2925\u2926\u2927\u2928\u2929\u292A\u292B\u292C\u292D\u292E\u292F\u2930\u2931\u2932\u2933\u2934\u2935\u2936\u2937\u2938\u2939\u293A\u293B\u293C\u293D\u293E\u293F\u2940\u2941\u2942\u2943\u2944\u2945\u2946\u2947\u2948\u2949\u294A\u294B\u294C\u294D\u294E\u294F\u2950\u2951\u2952\u2953\u2954\u2955\u2956\u2957\u2958\u2959\u295A\u295B\u295C\u295D\u295E\u295F\u2960\u2961\u2962\u2963\u2964\u2965\u2966\u2967\u2968\u2969\u296A\u296B\u296C\u296D\u296E\u296F\u2970\u2971\u2972\u2973\u2974\u2975\u2976\u2977\u2978\u2979\u297A\u297B\u297C\u297D\u297E\u297F\u2B05\u2B06\u2B07\u2B50\u2B55\u3030\u303D\u3297\u3299\uFE0F\u200D\u20E3\u2694\u2695\u2696\u2697\u2699\u269B\u269C\u26A0\u26A1\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2702\u2708\u2709\u270A\u270B\u270C\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753\u2754\u2755\u2757\u2763\u2764\u2795\u2796\u2797\u27A1\u27B0\u2934\u2935\u2B05\u2B06\u2B07\u3030\u303D]|["\u201C\u201D\u2018\u2019]/g;
        // Only strip these if they appear OUTSIDE of [ ] brackets (i.e., not inside property values)
        // Split by bracket pairs and only clean non-bracket sections
        var parts = sgfText.split(/(\[[^\]]*\])/);
        var changes = 0;
        for (var i = 0; i < parts.length; i++) {
            // Even indices are OUTSIDE brackets, odd indices are INSIDE brackets
            if (i % 2 === 0) {
                var cleaned = parts[i].replace(strayPattern, function(m) { changes++; return ''; });
                if (cleaned !== parts[i]) parts[i] = cleaned;
            }
        }
        return { fixed: parts.join(''), changes: changes };
    }

    // Fix 3: Remove stray non-ASCII chars that are not inside brackets
    function fixStrayNonASCII(sgfText) {
        if (!sgfText) return { fixed: sgfText, changes: 0 };
        var changes = 0;
        var parts = sgfText.split(/(\[[^\]]*\])/);
        for (var i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                // Outside brackets: remove stray bullet/arrow characters (only the char itself, not consuming the line)
                var cleaned = parts[i].replace(/[•\u2022\u25CF\u21A6\u21A2\u27A2\u27B2\u29CF\u29D0]/g, function(m) { changes++; return ''; });
                // Also remove smart/curly quotes and typographic artifacts outside brackets
                cleaned = cleaned.replace(/[\u201C\u201D\u2018\u2019\u00AB\u00BB]/g, function(m) { changes++; return ''; });
                // Remove stray ] that appear outside property brackets (illegal in SGF)
                cleaned = cleaned.replace(/\]/g, function(m) { changes++; return ''; });
                if (cleaned !== parts[i]) parts[i] = cleaned;
            }
        }
        return { fixed: parts.join(''), changes: changes };
    }

    // Fix 4: Remove down-line TM properties and consolidate to root node
    function fixDuplicateTM(sgfText) {
        if (!sgfText) return { fixed: sgfText, changes: 0, tmValues: [] };
        var tmInstances = [];
        var re = /TM\s*\[([^\]]+)\]/g;
        var m;
        while ((m = re.exec(sgfText)) !== null) {
            tmInstances.push({ full: m[0], value: m[1].trim(), index: m.index });
        }
        if (tmInstances.length === 0) return { fixed: sgfText, changes: 0, tmValues: [] };

        // Find the first TM with actual data
        var parsed = null;
        var bestRaw = '';
        for (var i = 0; i < tmInstances.length; i++) {
            var val = tmInstances[i].value;
            if (/^\d+(\.\d+)?$/.test(val)) {
                parsed = { black: parseFloat(val), white: parseFloat(val), baseline: parseFloat(val) };
                bestRaw = tmInstances[i].full;
                break;
            }
            var p = parseAsymmetricTM(val);
            if (p.baseline > 0) {
                parsed = p;
                bestRaw = tmInstances[i].full;
                break;
            }
        }
        if (!parsed) return { fixed: sgfText, changes: 0, tmValues: [] };

        var fixed = sgfText;
        var changes = 0;

        // Remove ALL TM properties from the entire string
        fixed = fixed.replace(/TM\s*\[[^\]]+\]\s*/g, function(match) { changes++; return ''; });
        if (changes === 0) return { fixed: fixed, changes: 0, tmValues: [] };

        // Build compliant TM (baseline = min of both)
        var compliantTM = 'TM[' + parsed.baseline + ']';

        // Build OT metadata if asymmetric
        var otProp = '';
        if (parsed.black !== parsed.white) {
            var otText = 'Asymmetric initial limits - Black: ' + parsed.black + 's, White: ' + parsed.white + 's';
            otProp = 'OT[' + otText + ']';
        }

        // Find root node and inject TM (and OT if present) after FF[x] or after ;
        var rootMatch = fixed.match(/\(\s*;FF\s*\[(\d+)\]/);
        if (!rootMatch) rootMatch = fixed.match(/\(\s*;/);
        if (rootMatch) {
            var insertPos = rootMatch.index + rootMatch[0].length;
            var inject = compliantTM + otProp;
            fixed = fixed.substring(0, insertPos) + inject + fixed.substring(insertPos);
        }

        // Inject BL on first B move, WL on first W move (after the closing ] of the move value)
        if (parsed.black !== null) {
            var bMove = fixed.match(/;B\[[^\]]*\]/);
            if (bMove) {
                var bEnd = bMove.index + bMove[0].length;
                fixed = fixed.substring(0, bEnd) + 'BL[' + parsed.black + ']' + fixed.substring(bEnd);
            }
        }
        if (parsed.white !== null) {
            var wMove = fixed.match(/;W\[[^\]]*\]/);
            if (wMove) {
                var wEnd = wMove.index + wMove[0].length;
                fixed = fixed.substring(0, wEnd) + 'WL[' + parsed.white + ']' + fixed.substring(wEnd);
            }
        }

        // Remove old C[System Clock Metadata:...] if present
        fixed = fixed.replace(/\s*C\[System Clock Metadata:[^\]]*\]/g, '');

        return { fixed: fixed, changes: changes, tmValues: tmInstances.map(function(t) { return t.full; }) };
    }

    // Fix 5: Remove stray property identifiers without values (e.g. "From" leaked from UI into move sequence)
    function fixStrayPropertyNames(sgfText) {
        if (!sgfText) return { fixed: sgfText, changes: 0 };
        var changes = 0;
        var parts = sgfText.split(/(\[[^\]]*\])/);
        for (var i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                // Outside brackets: remove standalone 2-5 uppercase letter identifiers NOT followed by [
                // e.g. "From;B[qc]" → ";B[qc]" but don't touch ;B, ;W, ( ; etc.
                var cleaned = parts[i].replace(/\b([A-Z][a-z]{1,4})\b(?!\s*\[)/g, function(match, p1) {
                    // Only strip if it looks like a leaked word, not a valid SGF token
                    if (/^(From|Black|White|Move|Game|Time|Player|Result|Score|Board|Color|Handicap|Komi|Rules|Date|Event|Comment|Next|Previous|Pass|Resign|Capture|Atari|Liberty|Territory|Life|Death|Seki|Ko|Snapback|Ladder|Net|Shoulder|Contact|Jump|Diagonal|Knight|Enclosure|Corner|Side|Center|Edge|Line|Point|Star|Hoshi|Tengen|Joseki|Fuseki|Yose)$/.test(match)) {
                        changes++;
                        return '';
                    }
                    return match;
                });
                if (cleaned !== parts[i]) parts[i] = cleaned;
            }
        }
        return { fixed: parts.join(''), changes: changes };
    }

    // Fix 6: Remove empty/worthless property-without-value errors (like <From> from leaked text)
    // This is handled by artifact cleanup — once stray text is removed, the phantom properties vanish

    // ── Comprehensive Sanitizer: runs all fixes in sequence ──
    function sanitizeSGFStream(sgfText) {
        if (!sgfText || !sgfText.trim()) return { fixed: sgfText, archive: [] };

        var fixed = sgfText;
        var archive = [];
        var changeNum = 0;

        // Step 1: Escape unescaped brackets in text properties
        var r1 = fixEscapedBrackets(fixed);
        if (r1.changes > 0) {
            changeNum++;
            archive.push(
                '<span class="step-label">Why:</span> SGF text properties (C, N) use square brackets as delimiters. Unescaped \']\' inside them prematurely closes the property, corrupting the rest of the file.' +
                '<br><span class="step-label">Fix:</span> Escaped ' + r1.changes + ' unescaped bracket(s) inside C/N properties with \'\\]\' so parsers treat them as literal text.'
            );
            fixed = r1.fixed;
        }

        // Step 2: Strip stray non-ASCII artifacts outside brackets
        var r2 = fixStrayNonASCII(fixed);
        if (r2.changes > 0) {
            changeNum++;
            archive.push(
                '<span class="step-label">Why:</span> Characters like bullets (\u2022), smart quotes (\u201C\u201D), and stray \']\' outside property brackets are not valid SGF tokens. They cause SGFC "illegal char" errors.' +
                '<br><span class="step-label">Fix:</span> Removed ' + r2.changes + ' stray non-ASCII artifact(s) that were outside any property bracket.'
            );
            fixed = r2.fixed;
        }

        // Step 3: Strip other stray interface characters
        var r3 = fixStrayArtifacts(fixed);
        if (r3.changes > 0) {
            changeNum++;
            archive.push(
                '<span class="step-label">Why:</span> Interface characters (e.g. copied from Chinese Go server UIs) leaked into the SGF raw text outside property brackets. These are invisible to the game record but trigger parse errors.' +
                '<br><span class="step-label">Fix:</span> Cleaned ' + r3.changes + ' stray interface character(s) from outside property brackets.'
            );
            fixed = r3.fixed;
        }

        // Step 3b: Strip stray property names without values (leaked UI words like "From")
        var r3b = fixStrayPropertyNames(fixed);
        if (r3b.changes > 0) {
            changeNum++;
            archive.push(
                '<span class="step-label">Why:</span> Words like "From" (from server UI copy-paste) appeared as bare text in the move sequence without a property bracket. SGFC treats them as phantom property identifiers and flags "without any values" errors.' +
                '<br><span class="step-label">Fix:</span> Removed ' + r3b.changes + ' stray property identifier(s) that had no corresponding [value].'
            );
            fixed = r3b.fixed;
        }

        // Step 4: Consolidate duplicate/misplaced TM to root node
        var r4 = fixDuplicateTM(fixed);
        if (r4.changes > 0) {
            changeNum++;
            var tmParsed = parseAsymmetricTM(r4.tmValues[0] || '0');
            var tmDetail = 'TM[' + tmParsed.baseline + ']';
            if (tmParsed.black !== tmParsed.white) {
                tmDetail += ' (baseline = min of Black ' + tmParsed.black + 's, White ' + tmParsed.white + 's)';
            }
            archive.push(
                '<span class="step-label">Why:</span> SGF FF[4] requires exactly one TM property in the root node. Chinese Go servers inject per-player clock strings (e.g. "TM[\u9ED1: 06:06 \u767D: 05:07]") which are not valid \u2014 TM must be a single Real number in seconds. Duplicate or misplaced TM properties break parsers.' +
                '<br><span class="step-label">Fix:</span> Consolidated ' + r4.changes + ' TM propert' + (r4.changes > 1 ? 'ies' : 'y') + ' to root node as ' + tmDetail + '.' +
                (tmParsed.black !== tmParsed.white ?
                    '<br>Additionally injected BL[' + tmParsed.black + '] on first Black move and WL[' + tmParsed.white + '] on first White move to preserve the asymmetric clock allocation. Added OT property with original clock metadata.' : '')
            );
            fixed = r4.fixed;
        }

        // Step 5: Fix non-standard TM format (only if step 4 didn't already handle TM)
        if (r4.changes === 0) {
            var r5 = autoFixTMFormat(fixed);
            if (r5.changes > 0) {
                for (var c = 0; c < r5.archive.length; c++) {
                    changeNum++;
                    archive.push('[' + String(changeNum).padStart(3, '0') + '] ' + r5.archive[c]);
                }
                fixed = r5.fixed;
            }
        }

        // NOTE: Archive is NOT appended to the SGF file — it causes SGFC parse errors.
        // Archive data is returned separately for UI display via fixedIssuesMap.

        return { fixed: fixed, archive: archive };
    }

    // ── Helper: parse asymmetric Chinese clock → {black, white, baseline} ──
    function parseAsymmetricTM(rawValue) {
        var blackSec = null, whiteSec = null;
        var segs = rawValue.match(/([黑白])\s*[:：]?\s*(\d+[:：]\d+(?:[:：]\d+)?)/g);
        if (segs) {
            for (var i = 0; i < segs.length; i++) {
                var cm = segs[i].match(/([黑白])/);
                var tm = segs[i].match(/(\d+)[：:](\d+)(?:[：:](\d+))?/);
                if (!cm || !tm) continue;
                var sec = 0;
                if (tm[3] !== undefined) sec = parseFloat(tm[1])*3600 + parseFloat(tm[2])*60 + parseFloat(tm[3]);
                else sec = parseFloat(tm[1])*60 + parseFloat(tm[2]);
                if (cm[1] === '\u9ED1') blackSec = sec;
                else if (cm[1] === '\u767D') whiteSec = sec;
            }
        }
        var minSegs = rawValue.match(/([黑白])\s*[:：]?\s*(\d+)\s*分/g);
        if (minSegs) {
            for (var j = 0; j < minSegs.length; j++) {
                var mm = minSegs[j].match(/([黑白])/);
                var mv = minSegs[j].match(/(\d+)\s*分/);
                if (mm && mv) {
                    var s = parseFloat(mv[1]) * 60;
                    if (mm[1] === '\u9ED1') blackSec = s;
                    else if (mm[1] === '\u767D') whiteSec = s;
                }
            }
        }
        var times = [];
        if (blackSec !== null) times.push(blackSec);
        if (whiteSec !== null) times.push(whiteSec);
        var baseline = times.length > 0 ? Math.min.apply(null, times) : 0;
        return { black: blackSec, white: whiteSec, baseline: baseline };
    }

    // Helper: parse TM value to seconds (reused)
    function parseSecondsFromTM(rawValue) {
        if (/^\d+(\.\d+)?$/.test(rawValue)) return parseFloat(rawValue);
        var blackSec = null, whiteSec = null;
        var segs = rawValue.match(/([黑白])\s*[:：]?\s*(\d+[:：]\d+(?:[:：]\d+)?)/g);
        if (segs) {
            for (var i = 0; i < segs.length; i++) {
                var cm = segs[i].match(/([黑白])/);
                var tm = segs[i].match(/(\d+)[：:](\d+)(?:[：:](\d+))?/);
                if (!cm || !tm) continue;
                var sec = 0;
                if (tm[3] !== undefined) sec = parseFloat(tm[1])*3600 + parseFloat(tm[2])*60 + parseFloat(tm[3]);
                else sec = parseFloat(tm[1])*60 + parseFloat(tm[2]);
                if (cm[1] === '\u9ED1') blackSec = sec;
                else if (cm[1] === '\u767D') whiteSec = sec;
            }
        }
        var minSegs = rawValue.match(/([黑白])\s*[:：]?\s*(\d+)\s*分/g);
        if (minSegs) {
            for (var j = 0; j < minSegs.length; j++) {
                var mm = minSegs[j].match(/([黑白])/);
                var mv = minSegs[j].match(/(\d+)\s*分/);
                if (mm && mv) {
                    var s = parseFloat(mv[1]) * 60;
                    if (mm[1] === '\u9ED1') blackSec = s;
                    else if (mm[1] === '\u767D') whiteSec = s;
                }
            }
        }
        var times = [];
        if (blackSec !== null) times.push(blackSec);
        if (whiteSec !== null) times.push(whiteSec);
        return times.length > 0 ? Math.max.apply(null, times) : 0;
    }

    // ── Auto-Fix: Normalize non-standard TM format only (standalone per-issue fix) ──
    function autoFixTMFormat(sgfText) {
        if (!sgfText) return { fixed: sgfText, changes: 0, archive: [] };
        var fixed = sgfText;
        var archive = [];
        var changes = 0;

        var tmMatch = fixed.match(/TM\s*\[([^\]]+)\]/);
        if (tmMatch) {
            var rawValue = tmMatch[1].trim();
            if (!/^\d+(\.\d+)?$/.test(rawValue)) {
                var parsed = parseAsymmetricTM(rawValue);

                var compliantTM = 'TM[' + parsed.baseline + ']';
                archive.push(
                    '<span class="step-label">Why:</span> SGF FF[4] requires TM to be a single Real value (seconds). The value "' + rawValue + '" is a per-player clock string from a Chinese Go server \u2014 not a valid TM format.' +
                    '<br><span class="step-label">Fix:</span> Converted to ' + compliantTM + ' (baseline = min of both players).'
                );
                fixed = fixed.replace(tmMatch[0], compliantTM);
                changes++;

                // Inject OT if asymmetric
                if (parsed.black !== parsed.white) {
                    var otText = 'Asymmetric initial limits - Black: ' + parsed.black + 's, White: ' + parsed.white + 's';
                    var rootMatch = fixed.match(/\(\s*;FF\s*\[\d+\]/);
                    if (!rootMatch) rootMatch = fixed.match(/\(\s*;/);
                    if (rootMatch) {
                        var insertPos = rootMatch.index + rootMatch[0].length;
                        fixed = fixed.substring(0, insertPos) + 'OT[' + otText + ']' + fixed.substring(insertPos);
                        archive.push(
                            '<span class="step-label">Why:</span> The original clock had asymmetric values (Black ' + parsed.black + 's, White ' + parsed.white + 's). TM can only hold one number. The difference must be preserved elsewhere.' +
                            '<br><span class="step-label">Fix:</span> Injected OT[' + otText + '] into root node to preserve the asymmetry metadata.'
                        );
                    }
                }

                // Inject BL on first B move, WL on first W move (after closing ] of move value)
                if (parsed.black !== null) {
                    var bMove = fixed.match(/;B\[[^\]]*\]/);
                    if (bMove) {
                        var bEnd = bMove.index + bMove[0].length;
                        fixed = fixed.substring(0, bEnd) + 'BL[' + parsed.black + ']' + fixed.substring(bEnd);
                        archive.push(
                            '<span class="step-label">Why:</span> Engines track remaining time via BL (Black clock) on move nodes. Without it, Black\'s actual time (' + parsed.black + 's) would be lost after normalization.' +
                            '<br><span class="step-label">Fix:</span> Injected BL[' + parsed.black + '] on first Black move so the engine starts with the correct clock.'
                        );
                    }
                }
                if (parsed.white !== null) {
                    var wMove = fixed.match(/;W\[[^\]]*\]/);
                    if (wMove) {
                        var wEnd = wMove.index + wMove[0].length;
                        fixed = fixed.substring(0, wEnd) + 'WL[' + parsed.white + ']' + fixed.substring(wEnd);
                        archive.push(
                            '<span class="step-label">Why:</span> Same as BL above \u2014 engines need WL (White clock) on move nodes to track remaining time. White\'s actual time (' + parsed.white + 's) must be preserved.' +
                            '<br><span class="step-label">Fix:</span> Injected WL[' + parsed.white + '] on first White move so the engine starts with the correct clock.'
                        );
                    }
                }

                // Remove old C[System Clock Metadata:...] if present
                var oldComment = fixed.match(/\s*C\[System Clock Metadata:[^\]]*\]/);
                if (oldComment) {
                    fixed = fixed.replace(oldComment[0], '');
                    archive.push(
                        '<span class="step-label">Why:</span> A previous fix had dumped raw clock data into a C (comment) property. This is no longer needed since clock data is now properly stored in OT/BL/WL.' +
                        '<br><span class="step-label">Fix:</span> Removed legacy C[System Clock Metadata] comment.'
                    );
                }
            }
        }

        return { fixed: fixed, changes: changes, archive: archive };
    }

    // ── Auto-Fix: Normalize non-standard TM values & archive changes ──
    function autoFixSGFProperties(sgfText) {
        if (!sgfText || !sgfText.trim()) {
            return { fixed: sgfText, archive: [] };
        }

        let fixed = sgfText;
        let archive = [];
        let changeNum = 0;

        // ── Fix TM: non-standard Chinese time format → FF[4] compliant ──
        var tmMatch = fixed.match(/TM\s*\[([^\]]+)\]/);
        if (tmMatch) {
            var rawValue = tmMatch[1].trim();
            // Already compliant: a number (int or float)
            if (/^\d+(\.\d+)?$/.test(rawValue)) {
                // do nothing
            } else {
                var parsed = parseAsymmetricTM(rawValue);

                // TM → baseline (min of both)
                var compliantTM = 'TM[' + parsed.baseline + ']';
                changeNum++;
                archive.push('[' + String(changeNum).padStart(3, '0') + '] \u2014 From "' + tmMatch[0] + '" \u2192 "' + compliantTM + '"');
                fixed = fixed.replace(tmMatch[0], compliantTM);

                // OT → asymmetry metadata (if values differ)
                if (parsed.black !== parsed.white) {
                    var otText = 'Asymmetric initial limits - Black: ' + parsed.black + 's, White: ' + parsed.white + 's';
                    var rootMatch = fixed.match(/\(\s*;/);
                    if (rootMatch) {
                        var afterRoot = rootMatch.index + rootMatch[0].length;
                        fixed = fixed.substring(0, afterRoot) + 'OT[' + otText + ']' + fixed.substring(afterRoot);
                        changeNum++;
                        archive.push('[' + String(changeNum).padStart(3, '0') + '] \u2014 Injected OT[' + otText + '] into root node');
                    }
                }

                // BL on first B move (after closing ] of move value)
                if (parsed.black !== null) {
                    var bMove = fixed.match(/;B\[[^\]]*\]/);
                    if (bMove) {
                        var bEnd = bMove.index + bMove[0].length;
                        fixed = fixed.substring(0, bEnd) + 'BL[' + parsed.black + ']' + fixed.substring(bEnd);
                        changeNum++;
                        archive.push('[' + String(changeNum).padStart(3, '0') + '] \u2014 Injected BL[' + parsed.black + '] on first B move');
                    }
                }

                // WL on first W move (after closing ] of move value)
                if (parsed.white !== null) {
                    var wMove = fixed.match(/;W\[[^\]]*\]/);
                    if (wMove) {
                        var wEnd = wMove.index + wMove[0].length;
                        fixed = fixed.substring(0, wEnd) + 'WL[' + parsed.white + ']' + fixed.substring(wEnd);
                        changeNum++;
                        archive.push('[' + String(changeNum).padStart(3, '0') + '] \u2014 Injected WL[' + parsed.white + '] on first W move');
                    }
                }
            }
        }

        // NOTE: Archive is NOT appended to the SGF file — it causes SGFC parse errors.

        return { fixed: fixed, archive: archive };
    }

    // Expose APIs
    global.SGFAuditor = {
        parseSGF,
        GoBoard,
        auditSGF,
        detectPhases,
        validateSGFProperties,
        maximizeSGF,
        autoFixSGFProperties,
        sanitizeSGFStream,
        fixEscapedBrackets,
        fixStrayArtifacts,
        fixStrayNonASCII,
        fixStrayPropertyNames,
        fixDuplicateTM,
        autoFixTMFormat
    };

})(typeof window !== 'undefined' ? window : global);
