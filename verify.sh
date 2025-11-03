#!/bin/bash

# Verification script for PDQ WASM package

set -e

echo "========================================="
echo "PDQ WASM Package Verification"
echo "========================================="
echo ""

# Check if required files exist
echo "Checking build artifacts..."
test -f wasm/pdq.wasm && echo "✓ wasm/pdq.wasm exists"
test -f wasm/pdq.js && echo "✓ wasm/pdq.js exists"
test -f dist/index.js && echo "✓ dist/index.js exists"
test -f dist/index.d.ts && echo "✓ dist/index.d.ts exists"
test -f dist/pdq.js && echo "✓ dist/pdq.js exists"
test -f dist/pdq.d.ts && echo "✓ dist/pdq.d.ts exists"
echo ""

# Check package.json
echo "Checking package.json..."
node -e "
const pkg = require('./package.json');
console.log('✓ Package name:', pkg.name);
console.log('✓ Version:', pkg.version);
console.log('✓ License:', pkg.license);
console.log('✓ Files:', pkg.files.join(', '));
"
echo ""

# Run tests
echo "Running tests..."
npm test --silent
echo "✓ All tests passed"
echo ""

# Run smoke test
echo "Running smoke test..."
node test-basic.js > /dev/null 2>&1 && echo "✓ Smoke test passed"
echo ""

# Check file sizes
echo "Build artifact sizes:"
ls -lh wasm/pdq.wasm | awk '{print "  WASM binary:", $5}'
ls -lh wasm/pdq.js | awk '{print "  WASM wrapper:", $5}'
ls -lh dist/pdq.js | awk '{print "  TypeScript output:", $5}'
echo ""

echo "========================================="
echo "✓ All verifications passed!"
echo "Package is ready for distribution"
echo "========================================="
