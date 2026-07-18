/**
 * gnugowrapper.c — Thin C API bridging GNU Go internals to WASM-exported functions.
 *
 * Uses the actual GNU Go 3.8 public API from engine/gnugo.h and engine/board.h.
 * Board positions use the POS(i,j) macro from the engine's 1D board representation.
 *
 * Key API functions used:
 *   init_gnugo(memory, seed)       — one-time engine initialization
 *   gnugo_clear_board(boardsize)   — reset board to given size
 *   gnugo_play_move(pos, color)    — play a move (records in history, enforces rules)
 *   is_legal(pos, color)           — check legality without playing
 *   undo_move(n)                   — undo last n moves
 *   add_stone(pos, color)          — place stone without move history (for AB/AW)
 *   remove_stone(pos)              — remove stone (for AE)
 *   genmove(color, &value, &resign)— generate engine's best move
 *   komi (global)                  — current komi value
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "gnugo.h"
#include "board.h"

/* ── Helper: Parse GTP vertex string to board position index ── */

static int gnugo_vertex_to_pos(const char *vertex) {
    if (!vertex || strcmp(vertex, "pass") == 0 || strcmp(vertex, "resign") == 0) {
        return PASS_MOVE;
    }

    /* Use GNU Go's built-in parser (from board.h / printutils.c) */
    int pos = string_to_location(board_size, vertex);
    return pos;
}

/* ── Engine Lifecycle ── */

/**
 * Initialize the GNU Go engine. Call once at startup.
 * memory: hash table size in MB (8 is plenty for move validation)
 * random_seed: PRNG seed for deterministic behavior
 */
void gnugo_init(float memory, unsigned int random_seed) {
    init_gnugo(memory, random_seed);
}

/* ── Board Lifecycle ── */

/**
 * Clear the board and set the board size.
 * Note: GNU Go's gnugo_clear_board takes boardsize as parameter.
 */
void gnugo_reset_board(int boardsize) {
    gnugo_clear_board(boardsize);
}

void gnugo_set_komi(float k) {
    komi = k;
}

/* ── Move Execution & Legality ── */

/**
 * Plays a move on the board. Records in move history.
 * color: "black" or "white"
 * vertex: GTP vertex string (e.g., "Q16", "pass")
 * Returns 1 if move was played, 0 if illegal.
 */
int gnugo_play(const char *color, const char *vertex) {
    int color_int = (strcmp(color, "black") == 0) ? BLACK : WHITE;
    int pos = gnugo_vertex_to_pos(vertex);

    if (pos == PASS_MOVE) {
        /* Passing is always legal — just record it */
        gnugo_play_move(PASS_MOVE, color_int);
        return 1;
    }

    if (!ON_BOARD1(pos)) {
        return 0;
    }

    /* Check legality before playing */
    if (!is_legal(pos, color_int)) {
        return 0;
    }

    gnugo_play_move(pos, color_int);
    return 1;
}

/**
 * Checks if a move is legal WITHOUT playing it.
 * Returns 1 if legal, 0 if illegal.
 */
int gnugo_check_legal_move(const char *color, const char *vertex) {
    int color_int = (strcmp(color, "black") == 0) ? BLACK : WHITE;
    int pos = gnugo_vertex_to_pos(vertex);

    if (pos == PASS_MOVE) {
        return 1;
    }

    if (!ON_BOARD1(pos)) {
        return 0;
    }

    return is_legal(pos, color_int);
}

/**
 * Undo the last move. Returns 1 on success, 0 if nothing to undo.
 */
int gnugo_undo(void) {
    return undo_move(1);
}

/* ── Setup Properties (AB, AW, AE) ── */

/**
 * Places a stone directly on the board without recording in move history.
 * Use for handicap stones (AB/AW) and tsumego positions.
 */
int gnugo_set_stone_position(const char *color, const char *vertex) {
    int color_int = (strcmp(color, "black") == 0) ? BLACK : WHITE;
    int pos = gnugo_vertex_to_pos(vertex);

    if (pos == PASS_MOVE || !ON_BOARD1(pos)) {
        return 0;
    }

    add_stone(pos, color_int);
    return 1;
}

/**
 * Removes a stone from the board (for AE / Add Empty property).
 */
int gnugo_remove_stone_position(const char *vertex) {
    int pos = gnugo_vertex_to_pos(vertex);

    if (pos == PASS_MOVE || !ON_BOARD1(pos)) {
        return 0;
    }

    remove_stone(pos);
    return 1;
}

/* ── Move Generation & Scoring ── */

/**
 * Asks the engine to generate the best move for the given color.
 * Returns a static string in GTP vertex format (e.g., "Q16" or "pass").
 */
const char* gnugo_engine_genmove(const char *color) {
    int color_int = (strcmp(color, "black") == 0) ? BLACK : WHITE;
    float value;
    int resign;

    int pos = genmove(color_int, &value, &resign);

    static char result[8];

    if (pos == PASS_MOVE) {
        strcpy(result, "pass");
    } else {
        /* Convert position index back to GTP vertex string */
        location_to_buffer(pos, result);
    }

    return result;
}

/**
 * Returns the final score as a string.
 */
const char* gnugo_engine_final_score(void) {
    float upper, lower;
    float score = gnugo_estimate_score(&upper, &lower);

    static char result[32];
    sprintf(result, "%.1f", score);
    return result;
}
