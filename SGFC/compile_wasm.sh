#!/bin/bash
# Script to compile SGFC (C source) to WebAssembly using Emscripten
set -e

# Path to C source files relative to this script
SRC_DIR="sgfc-main/src"
# Output directory relative to the source directory (targets SGF-Auditor root)
OUT_DIR="../../.."

echo "Compiling SGFC to WebAssembly..."

cd "$(dirname "$0")/$SRC_DIR"

# Set Emscripten cache directory to a local workspace path to avoid sandbox/permission errors
export EM_CACHE="$(pwd)/../../../.emscripten_cache"
mkdir -p "$EM_CACHE"

emcc -O3 -std=c99 \
  execute.c gameinfo.c load.c main.c parse.c parse2.c options.c \
  properties.c save.c strict.c util.c error.c encoding.c \
  -s INVOKE_RUN=0 \
  -s FORCE_FILESYSTEM=1 \
  -s EXIT_RUNTIME=0 \
  -s EXPORTED_RUNTIME_METHODS="['callMain','FS']" \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createSGFC" \
  -o "$OUT_DIR/sgfc.js"

echo "WASM compilation complete!"
echo "Outputs created:"
echo "  - $OUT_DIR/sgfc.js"
echo "  - $OUT_DIR/sgfc.wasm"
