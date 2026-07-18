/**
 * SGF-Auditor / gnugo_wrapper.js
 * Systems Architecture Layer for WebAssembly GNU Go Tier 2 Move Legality Validation.
 * 
 * Enforces domain-correct pre-order DFS tree traversal across complex kifu variations.
 * Handles setup properties (AB, AW, AE) with proper backtracking for branch isolation.
 */

class GnuGoEngine {
    /**
     * Binds to the compiled Emscripten WebAssembly Module.
     * @param {Object} wasmModule - The initialized Emscripten Module instance.
     * @param {number} boardSize - Matrix allocation boundary (typically 9, 13, or 19).
     */
    constructor(wasmModule, boardSize) {
        this.Module = wasmModule;
        this.boardSize = boardSize;

        /* Bind WebAssembly runtime C functions using Emscripten cwrap */
        this._init = this.Module.cwrap('gnugo_init', null, ['number', 'number']);
        this._resetBoard = this.Module.cwrap('gnugo_reset_board', null, ['number']);
        this._undo = this.Module.cwrap('gnugo_undo', 'number', []);
        this._finalScore = this.Module.cwrap('gnugo_engine_final_score', 'string', []);

        /* play/checkLegal take (color, vertex) as UTF8 strings */
        this._play = this.Module.cwrap('gnugo_play', 'number', ['string', 'string']);
        this._checkLegal = this.Module.cwrap('gnugo_check_legal_move', 'number', ['string', 'string']);
        this._setStone = this.Module.cwrap('gnugo_set_stone_position', 'number', ['string', 'string']);
        this._clearStone = this.Module.cwrap('gnugo_remove_stone_position', 'number', ['string']);
        this._genMove = this.Module.cwrap('gnugo_engine_genmove', 'string', ['string']);
        this._setKomi = this.Module.cwrap('gnugo_set_komi', null, ['number']);

        /* Initialize engine (8 MB hash, deterministic seed) and set board size */
        this._init(8.0, 12345);
        this._resetBoard(boardSize);
    }

    clearBoard() { this._resetBoard(this.boardSize); }
    undo() { return this._undo() === 1; }
    finalScore() { return this._finalScore(); }

    play(color, vertex) { return this._play(color, vertex) === 1; }
    checkLegal(color, vertex) { return this._checkLegal(color, vertex) === 1; }
    setStone(color, vertex) { return this._setStone(color, vertex) === 1; }
    clearStone(vertex) { return this._clearStone(vertex) === 1; }
    genMove(color) { return this._genMove(color); }
    setKomi(k) { this._setKomi(k); }
}

class SgfMoveAuditor {
    /**
     * @param {Object} wasmModule - Initialized Emscripten Module
     * @param {number} boardSize - 9, 13, or 19
     */
    constructor(wasmModule, boardSize) {
        this.boardSize = boardSize || 19;
        this.engine = new GnuGoEngine(wasmModule, this.boardSize);
        /* GTP column spacing intentionally omits 'I' to avoid visual rendering confusion */
        this.gtpColumns = "ABCDEFGHJKLMNOPQRST";
    }

    /**
     * Translates raw SGF coordinate symbols into GTP vertex strings.
     * Maps top-left origin coordinates to the bottom-left layout constraints used by GTP.
     * Handles: empty values, 'tt' pass token, out-of-bounds coordinates.
     */
    sgfToGtpVertex(sgfCoord) {
        /* Enforce pass for empty fields and 'tt' on standard grids (<=19x19) */
        if (!sgfCoord || sgfCoord.trim() === "" ||
            (this.boardSize <= 19 && sgfCoord === "tt")) {
            return "pass";
        }

        const colIdx = sgfCoord.charCodeAt(0) - 97; /* 'a' maps to ASCII 97 */
        const rowIdx = sgfCoord.charCodeAt(1) - 97;

        if (colIdx < 0 || colIdx >= this.boardSize ||
            rowIdx < 0 || rowIdx >= this.boardSize) {
            return "pass";
        }

        const gtpCol = this.gtpColumns[colIdx];
        /* Calculate inverted row position: GTP Row = Board Size - SGF Row Index */
        const gtpRow = this.boardSize - rowIdx;

        return gtpCol + gtpRow;
    }

    /**
     * Executes a stateful, recursive pre-order traversal across all parsed variations.
     * Maintains synchronous continuity between the SGF AST branches and the WASM runtime.
     *
     * For each node:
     *   1. Apply setup properties (AB/AW/AE) — tracked for backtracking
     *   2. Check + play B/W move via engine
     *   3. Recurse into children (variations)
     *   4. Undo moves and clear setup stones on backtrack
     */
    auditGameTree(astNode, issuesAccumulator) {
        if (!astNode) return;

        var movesPlayedCount = 0;
        var modifiedVertices = []; /* Track explicit state alterations for cleanup */
        var properties = astNode.properties || {};

        /* ── 1. Process Positional Layout Modifications (Setup Properties Plane) ── */
        if (properties.AB) {
            for (var i = 0; i < properties.AB.length; i++) {
                var vertex = this.sgfToGtpVertex(properties.AB[i]);
                if (vertex !== "pass") {
                    this.engine.setStone("black", vertex);
                    modifiedVertices.push({ action: "clear", vertex: vertex });
                }
            }
        }
        if (properties.AW) {
            for (var i = 0; i < properties.AW.length; i++) {
                var vertex = this.sgfToGtpVertex(properties.AW[i]);
                if (vertex !== "pass") {
                    this.engine.setStone("white", vertex);
                    modifiedVertices.push({ action: "clear", vertex: vertex });
                }
            }
        }
        if (properties.AE) {
            for (var i = 0; i < properties.AE.length; i++) {
                var vertex = this.sgfToGtpVertex(properties.AE[i]);
                if (vertex !== "pass") {
                    this.engine.clearStone(vertex);
                    modifiedVertices.push({ action: "clear", vertex: vertex });
                }
            }
        }

        /* ── 2. Process and Validate Chronological Move Coordinates ── */
        var blackMove = properties.B;
        var whiteMove = properties.W;

        if (blackMove || whiteMove) {
            var color = blackMove ? "black" : "white";
            var rawCoord = blackMove ? blackMove[0] : whiteMove[0];
            var gtpVertex = this.sgfToGtpVertex(rawCoord);

            if (gtpVertex !== "pass") {
                /* Check legality rules before altering the engine's timeline state */
                var isLegal = this.engine.checkLegal(color, gtpVertex);

                if (!isLegal) {
                    issuesAccumulator.push({
                        line: (astNode.location && astNode.location.line) || 0,
                        column: (astNode.location && astNode.location.column) || 0,
                        message: "Illegal move: " + color.toUpperCase() +
                                 " at [" + gtpVertex +
                                 "] violates basic capture or ko constraints.",
                        severity: "error",
                        type: "ILLEGAL_MOVE"
                    });
                }
            }

            /* Commit the verified execution to advance the engine's internal board matrix */
            this.engine.play(color, gtpVertex);
            movesPlayedCount++;
        }

        /* ── 3. Depth-First Exploration of Subtrees and Alternate Variations ── */
        if (astNode.children && astNode.children.length > 0) {
            for (var c = 0; c < astNode.children.length; c++) {
                this.auditGameTree(astNode.children[c], issuesAccumulator);
            }
        }

        /* ── 4. Roll Back Engine Memory During Branch Ascent ── */
        while (movesPlayedCount > 0) {
            this.engine.undo();
            movesPlayedCount--;
        }

        /* Explicitly clear structural modifications for perfect sibling variation isolation */
        for (var m = 0; m < modifiedVertices.length; m++) {
            if (modifiedVertices[m].action === "clear") {
                this.engine.clearStone(modifiedVertices[m].vertex);
            }
        }
    }

    /**
     * Entry-point to invoke the Tier 2 Rule-Compliance validation check.
     * @param {Object} sgfAst - The pre-parsed root node of the target SGF file.
     * @returns {Object} Audit result with phase, name, success flag, and issues array.
     */
    executeAudit(sgfAst) {
        var issues = [];
        this.engine.clearBoard();

        /* Synchronize engine configuration based on initial root node attributes */
        var rootProps = sgfAst.properties || {};
        if (rootProps.KM) {
            this.engine.setKomi(parseFloat(rootProps.KM[0]));
        }

        /* Initialize recursive graph scanning at the root index location */
        this.auditGameTree(sgfAst, issues);

        return {
            phase: "1.3",
            name: "Move Legality Audit (GNU Go WASM)",
            success: issues.length === 0,
            issues: issues
        };
    }
}
