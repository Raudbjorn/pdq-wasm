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

# Check if emcc is available
if ! command -v emcc &> /dev/null; then
    echo -e "${RED}Error: emcc not found. Please install and activate Emscripten SDK.${NC}"
    echo "Visit: https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
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

# Copy output to dist
echo -e "${GREEN}Copying output files...${NC}"
cd ..
mkdir -p dist
cp build/pdq.wasm dist/ 2>/dev/null || true
cp build/pdq.js dist/ 2>/dev/null || true

echo -e "${GREEN}Build complete! Output files in dist/${NC}"
ls -lh dist/
