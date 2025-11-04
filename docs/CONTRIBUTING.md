# Contributing to PDQ WASM

Thank you for your interest in contributing to PDQ WASM!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Install Emscripten SDK (see below)

## Emscripten Setup

This project requires Emscripten to compile C++ to WebAssembly.

```bash
# Clone and install emsdk
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

## Development Workflow

```bash
# Build WASM module
npm run build:wasm

# Build TypeScript
npm run build:ts

# Run tests (once implemented)
npm test

# Clean build artifacts
npm run clean
```

## Code Style

- Follow existing TypeScript/JavaScript conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and single-purpose

## Testing

- Write tests for new features
- Ensure existing tests pass
- Test in both Node.js and browser environments
- Include edge cases in tests

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Write/update tests
4. Update documentation as needed
5. Run tests and ensure they pass
6. Submit a pull request with a clear description

## License

By contributing, you agree that your contributions will be licensed under the same BSD 3-Clause License that covers the project.

## Questions?

Feel free to open an issue for questions or discussions.
