#!/bin/bash
# Script to compile GNU Go 3.8 to WebAssembly using Emscripten
# Produces gnugo.js + gnugo.wasm in the project root
#
# Build strategy: native autotools build first (to generate pattern C files from .db),
# then compile all C sources with emcc to WASM.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
GNUGO_SRC="$SCRIPT_DIR/gnugo-3.8"
BUILD_DIR="$SCRIPT_DIR/gnugo-build"
OUT_DIR="$PROJECT_ROOT"

echo "=== GNU Go WASM Compilation Pipeline ==="
echo ""

# ── Step 1: Verify source exists ──
if [ ! -d "$GNUGO_SRC" ]; then
    echo "[1/6] Downloading GNU Go 3.8..."
    cd "$SCRIPT_DIR"
    curl -L -o gnugo-3.8.tar.gz "https://ftp.gnu.org/gnu/gnugo/gnugo-3.8.tar.gz"
    tar xzf gnugo-3.8.tar.gz
    rm gnugo-3.8.tar.gz
fi
echo "[1/6] GNU Go source ready"

# ── Step 2: Prepare build directory ──
echo ""
echo "[2/6] Preparing build directory..."
rm -rf "$BUILD_DIR"
cp -r "$GNUGO_SRC" "$BUILD_DIR"
cd "$BUILD_DIR"

export EM_CACHE="$SCRIPT_DIR/../.emscripten_cache"
mkdir -p "$EM_CACHE"

# ── Step 3: Native autotools build (generates pattern C files from .db) ──
echo ""
echo "[3/6] Running native configure..."
./configure --without-readline --without-curses --disable-socket-support --disable-color 2>&1 | tail -3

echo ""
echo "[4/6] Building native (to generate pattern .c files from .db databases)..."
make -j4 2>&1 | tail -5
echo "  ✓ Native build complete — pattern C files generated"

# ── Step 4: WASM compilation with emcc ──
echo ""
echo "[5/6] Compiling to WebAssembly..."

cd "$BUILD_DIR"

emcc -O2 -DHAVE_CONFIG_H -DGG_TURN_OFF_ASSERTS \
    -I. -Iengine -Ipatterns -Isgf -Iutils -Iinterface \
    -Wno-everything \
    engine/aftermath.c engine/board.c engine/boardlib.c engine/breakin.c \
    engine/cache.c engine/clock.c engine/combination.c engine/dragon.c \
    engine/endgame.c engine/filllib.c engine/fuseki.c engine/genmove.c \
    engine/globals.c engine/handicap.c engine/hash.c engine/influence.c \
    engine/interface.c engine/matchpat.c engine/montecarlo.c engine/move_reasons.c \
    engine/movelist.c engine/optics.c engine/owl.c engine/persistent.c \
    engine/printutils.c engine/readconnect.c engine/reading.c engine/semeai.c \
    engine/sgfdecide.c engine/sgffile.c engine/shapes.c engine/showbord.c \
    engine/surround.c engine/unconditional.c engine/utils.c engine/value_moves.c \
    engine/worm.c \
    interface/gtp.c interface/play_gtp.c \
    sgf/sgf_utils.c sgf/sgfnode.c sgf/sgftree.c \
    utils/gg_utils.c utils/random.c \
    patterns/connections.c patterns/helpers.c patterns/transform.c patterns/dfa.c \
    patterns/conn.c patterns/patterns.c patterns/apatterns.c patterns/dpatterns.c \
    patterns/eyes.c patterns/influence.c patterns/barriers.c patterns/endgame.c \
    patterns/aa_attackpat.c \
    patterns/owl_attackpat.c patterns/owl_defendpat.c patterns/owl_vital_apat.c \
    patterns/fusekipat.c patterns/fuseki9.c patterns/fuseki13.c patterns/fuseki19.c \
    patterns/josekidb.c patterns/handipat.c patterns/oraclepat.c patterns/mcpat.c \
    "$SCRIPT_DIR/gnugowrapper.c" \
    -s WASM=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=33554432 \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8"]' \
    -s EXPORTED_FUNCTIONS='["_gnugo_init","_gnugo_reset_board","_gnugo_play","_gnugo_check_legal_move","_gnugo_undo","_gnugo_set_stone_position","_gnugo_remove_stone_position","_gnugo_engine_genmove","_gnugo_engine_final_score","_gnugo_set_komi"]' \
    -s INVOKE_RUN=0 \
    -s FORCE_FILESYSTEM=0 \
    -s EXIT_RUNTIME=0 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="createGnuGo" \
    -Wl,--allow-multiple-definition \
    -lm \
    -o "$OUT_DIR/gnugo.js" \
    2>&1 | tail -5

echo "  ✓ WASM compilation complete"

# ── Step 5: Verify output ──
echo ""
echo "[6/6] Verifying build output..."
if [ -f "$OUT_DIR/gnugo.js" ] && [ -f "$OUT_DIR/gnugo.wasm" ]; then
    JS_SIZE=$(wc -c < "$OUT_DIR/gnugo.js" | tr -d ' ')
    WASM_SIZE=$(wc -c < "$OUT_DIR/gnugo.wasm" | tr -d ' ')
    echo "  ✓ gnugo.js   — ${JS_SIZE} bytes"
    echo "  ✓ gnugo.wasm — ${WASM_SIZE} bytes"
    echo ""
    echo "=== WASM compilation complete! ==="
else
    echo "  ✗ Build failed — output files not found"
    exit 1
fi
