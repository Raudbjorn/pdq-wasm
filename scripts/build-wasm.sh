#!/bin/bash

# Build script for PDQ WebAssembly module
# Requires Emscripten SDK to be installed and activated

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building PDQ WebAssembly module...${NC}"

# Add Arch Linux's emscripten to PATH if it exists and emcc is not already available
if ! command -v emcc &> /dev/null; then
    if [ -d "/usr/lib/emscripten" ] && [ -x "/usr/lib/emscripten/emcc" ]; then
        echo -e "${YELLOW}Adding /usr/lib/emscripten to PATH (Arch Linux)${NC}"
        export PATH="/usr/lib/emscripten:$PATH"
    else
        echo -e "${RED}Error: emcc not found. Please install and activate Emscripten SDK.${NC}"
        echo "Visit: https://emscripten.org/docs/getting_started/downloads.html"
        echo "On Arch Linux: sudo pacman -S emscripten"
        exit 1
    fi
fi

# Print Emscripten version
echo -e "${YELLOW}Emscripten version:${NC}"
emcc --version

# Create build directory
BUILD_DIR="build"
mkdir -p $BUILD_DIR

# Navigate to build directory
cd $BUILD_DIR

# Configure with CMake using Emscripten
echo -e "${GREEN}Configuring with CMake...${NC}"
emcmake cmake ..

# Build
echo -e "${GREEN}Compiling...${NC}"
emmake make

# Output is already in wasm/ directory
echo -e "${GREEN}Build complete! Output files in wasm/${NC}"
cd ..
ls -lh wasm/ 2>/dev/null || echo "Output directory: wasm/"
