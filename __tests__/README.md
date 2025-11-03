# PDQ WASM Tests

This directory contains test scaffolding for the PDQ WebAssembly implementation.

## Status

Tests are currently **not implemented** - they are scaffolded with `.skip()` markers to outline the expected test coverage once we have a working prototype.

## Implementation Plan

Once the WASM module is successfully built and the basic functionality is working, we will:

1. **Unit Tests**
   - Test individual functions (hash generation, Hamming distance, hex conversion)
   - Test error handling and edge cases
   - Test input validation

2. **Integration Tests**
   - Test real image hashing workflows
   - Test browser vs Node.js environments
   - Test memory management and cleanup

3. **Compatibility Tests**
   - Verify hash compatibility with original C++ implementation
   - Verify cross-platform consistency (Node.js vs browser)
   - Verify hash format compatibility with other PDQ implementations

4. **Performance Tests**
   - Benchmark hashing speed for various image sizes
   - Test memory usage and leaks
   - Compare performance with native implementations

## Running Tests

Once tests are implemented:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- pdq.test.ts
```

## Test Data

We will need:
- Sample test images (various sizes, formats)
- Known PDQ hashes for validation
- Images with known similarity relationships
- Edge case images (all black, all white, gradients, etc.)

## Notes

- Tests should work in both Node.js and browser environments
- We should test against known good hashes from the C++ reference implementation
- Performance benchmarks will help validate the WASM implementation efficiency
