# Building PDQ WASM from Source

This guide covers building the PDQ WebAssembly module from source code.

## Prerequisites

### System Requirements

- Linux, macOS, or Windows with WSL2
- 2GB+ free disk space
- Internet connection for downloading dependencies

### Required Dependencies

1. **Node.js** (v16.0.0 or higher)
2. **Emscripten** (for WASM compilation)
3. **CMake** (v3.10 or higher)
4. **C++ Compiler** (supporting C++11)
5. **Git**

## Quick Start (Linux)

```bash
# Clone the repository
git clone https://github.com/Raudbjorn/pdq-wasm.git
cd pdq-wasm

# Install Node.js dependencies
npm install

# Build WASM and TypeScript
npm run build

# Run tests
npm test
```

## Detailed Setup Instructions

### 1. Installing Node.js

#### Ubuntu/Debian

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### macOS

```bash
brew install node
```

#### Arch Linux

```bash
sudo pacman -S nodejs npm
```

#### Verify installation

```bash
node --version  # Should be v16.0.0 or higher
npm --version
```

### 2. Installing Emscripten

Emscripten is required to compile C++ code to WebAssembly.

#### Option A: Using emsdk (Recommended for most systems)

```bash
# Clone the emsdk repository
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk

# Install and activate the latest version
./emsdk install latest
./emsdk activate latest

# Add to PATH (add this to your ~/.bashrc or ~/.zshrc)
source ./emsdk_env.sh
```

#### Option B: System package manager (Arch Linux)

```bash
# Arch Linux provides Emscripten in the official repository
sudo pacman -S emscripten

# The build script automatically detects /usr/lib/emscripten
```

#### Verify installation

```bash
emcc --version  # Should show Emscripten version
```

### 3. Installing CMake

#### Ubuntu/Debian

```bash
sudo apt-get install cmake
```

#### macOS

```bash
brew install cmake
```

#### Arch Linux

```bash
sudo pacman -S cmake
```

#### Verify installation

```bash
cmake --version  # Should be 3.10 or higher
```

### 4. Installing C++ Compiler

#### Ubuntu/Debian

```bash
sudo apt-get install build-essential
```

#### macOS

```bash
# Xcode Command Line Tools
xcode-select --install
```

#### Arch Linux

```bash
sudo pacman -S base-devel
```

### 5. Installing Git

#### Ubuntu/Debian

```bash
sudo apt-get install git
```

#### macOS

```bash
brew install git
```

#### Arch Linux

```bash
sudo pacman -S git
```

## Building the Project

### Full Build

```bash
# Install Node.js dependencies
npm install

# Build WASM module and TypeScript code
npm run build
```

This will:
1. Compile C++ code to WebAssembly (`wasm/pdq.wasm`)
2. Generate JavaScript wrapper (`wasm/pdq.js`)
3. Compile TypeScript to JavaScript (`dist/`)
4. Generate TypeScript type definitions (`dist/*.d.ts`)

### Partial Builds

```bash
# Build only WASM module
npm run build:wasm

# Build only TypeScript
npm run build:ts
```

### Clean Build

```bash
# Remove build artifacts
npm run clean

# Rebuild everything
npm run build
```

## Build Output

After a successful build, you'll have:

```
pdq-wasm/
├── wasm/
│   ├── pdq.wasm         # WebAssembly binary (~26KB)
│   └── pdq.js           # JavaScript wrapper (~13KB)
└── dist/
    ├── index.js         # Main entry point
    ├── index.d.ts       # Type definitions
    ├── pdq.js           # PDQ class
    ├── pdq.d.ts         # PDQ types
    ├── types.js         # Types module
    └── types.d.ts       # Type definitions
```

## Testing

```bash
# Run all tests
npm test

# Run specific test
npm test -- pdq.test.ts

# Run with coverage
npm test -- --coverage
```

## Troubleshooting

### "emcc: command not found"

**Solution:** Emscripten is not in your PATH.

```bash
# If using emsdk
source /path/to/emsdk/emsdk_env.sh

# Add to ~/.bashrc or ~/.zshrc for permanent setup
echo 'source /path/to/emsdk/emsdk_env.sh' >> ~/.bashrc
```

### "CMake Error: CMake was unable to find a build program"

**Solution:** Install CMake and make sure it's in your PATH.

```bash
sudo apt-get install cmake build-essential
```

### "fatal error: 'pdq/cpp/common/pdqbasetypes.h' file not found"

**Solution:** Make sure you've cloned the repository with all files intact. The PDQ C++ source should be in the `pdq/` directory.

### "WASM module loading failed"

**Solution:** The WASM module might not have been built correctly.

```bash
# Clean and rebuild
npm run clean
npm run build

# Verify WASM file exists
ls -lh wasm/pdq.wasm
```

### TypeScript compilation errors

**Solution:** Make sure you have the correct TypeScript version.

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Development Workflow

### Making Changes to C++ Code

1. Edit files in `cpp/pdq_wasm.cpp` or related files
2. Rebuild WASM: `npm run build:wasm`
3. Test: `npm test`

### Making Changes to TypeScript Code

1. Edit files in `src/`
2. Rebuild TypeScript: `npm run build:ts`
3. Test: `npm test`

### Adding New Tests

1. Create or edit test files in `__tests__/`
2. Run tests: `npm test`

## Build System Details

### CMake Configuration

The build uses CMake with Emscripten toolchain. Key settings in `CMakeLists.txt`:

- **Target:** WebAssembly (wasm32)
- **Optimization:** `-O2` for production, `-O0` for debug
- **Exports:** All PDQ functions exposed via `_pdq_*` names
- **Memory:** Malloc/free exported for manual memory management
- **Modularize:** WASM module exported as ES6 module

### Build Script

The `scripts/build-wasm.sh` script:

1. Detects Emscripten installation (emsdk or system)
2. Sets up environment variables
3. Creates build directory
4. Runs CMake configuration
5. Compiles C++ to WASM
6. Outputs to `wasm/` directory

### TypeScript Configuration

`tsconfig.json` settings:

- **Target:** ES2020
- **Module:** CommonJS
- **Output:** `dist/` directory
- **Declarations:** Generates `.d.ts` files for TypeScript support

## Packaging for Distribution

### Preparing for npm Publish

```bash
# Clean build
npm run clean
npm run build

# Run all tests
npm test

# Verify package contents
npm pack --dry-run

# Publish to npm (requires authentication)
npm publish
```

### Files Included in Package

The `.npmignore` file controls what gets published:

**Included:**
- `dist/` - TypeScript output
- `wasm/` - WebAssembly binaries
- `LICENSE` - BSD-3-Clause license
- `README.md` - Documentation
- `package.json` - Package metadata

**Excluded:**
- `src/` - TypeScript source (not needed)
- `cpp/` - C++ source (not needed)
- `__tests__/` - Tests
- `build/` - Build artifacts
- `node_modules/` - Dependencies

## Advanced Build Options

### Debug Build

```bash
# Edit CMakeLists.txt and change optimization level
# set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O0 -g")

npm run build:wasm
```

### Custom Emscripten Flags

Edit `CMakeLists.txt` and modify the `target_link_options`:

```cmake
target_link_options(pdq PRIVATE
  -s WASM=1
  -s MODULARIZE=1
  -s EXPORT_ES6=1
  # Add custom flags here
)
```

### Building for Different Targets

The current build targets WebAssembly for both browser and Node.js. To optimize for specific environments:

**Browser-only:**
```cmake
# Add browser-specific optimizations
-s ENVIRONMENT=web
```

**Node.js-only:**
```cmake
# Add Node.js-specific optimizations
-s ENVIRONMENT=node
```

## CI/CD

The project includes GitHub Actions workflows:

- **CI Workflow** (`.github/workflows/ci.yml`): Runs on every push/PR
  - Tests on Node.js 18.x and 20.x
  - Builds WASM and TypeScript
  - Runs full test suite

- **Publish Workflow** (`.github/workflows/publish.yml`): Publishes to npm
  - Triggered manually or on release
  - Publishes to npm and GitHub Packages

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

BSD 3-Clause License - see [LICENSE](LICENSE) for details.

The original PDQ algorithm is Copyright (c) Meta Platforms, Inc. and affiliates.
