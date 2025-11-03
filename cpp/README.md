# PDQ WASM C++ Bindings

This directory contains the C++ WebAssembly bindings for the PDQ algorithm.

## Files

- `pdq_wasm.cpp` - Emscripten bindings that expose PDQ functions to JavaScript

## Implementation Notes

The bindings provide a simple C-style API that can be easily called from JavaScript via Emscripten. The API includes:

- `pdq_hash_from_rgb()` - Hash RGB image data
- `pdq_hash_from_gray()` - Hash grayscale image data
- `pdq_hamming_distance()` - Calculate Hamming distance between hashes
- `pdq_hash_to_hex()` - Convert hash bytes to hex string
- `pdq_hex_to_hash()` - Convert hex string to hash bytes

## Memory Management

All functions use manual memory management via `malloc`/`free`. The TypeScript bindings handle allocation and cleanup to prevent memory leaks.

## Dependencies

The bindings depend on the original PDQ C++ implementation located in `../pdq/cpp/`. The build process (CMakeLists.txt) automatically includes these files, excluding the IO-related files that depend on CImg.

## Building

See the main README.md for build instructions. The build is handled by Emscripten via CMake.
