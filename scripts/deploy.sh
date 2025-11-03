#!/bin/bash
set -e

# Deployment script for pdq-wasm
# Automatically updates version references in documentation

echo "🚀 PDQ-WASM Deployment Script"
echo "=============================="

# Check if we're on master branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "master" ]; then
  echo "❌ Error: Must be on master branch to deploy"
  echo "   Current branch: $CURRENT_BRANCH"
  exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo "❌ Error: Uncommitted changes detected"
  echo "   Please commit or stash your changes before deploying"
  exit 1
fi

# Get version bump type from argument (patch, minor, major)
BUMP_TYPE="${1:-patch}"

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "❌ Error: Invalid version bump type: $BUMP_TYPE"
  echo "   Usage: $0 [patch|minor|major]"
  exit 1
fi

echo ""
echo "Version bump type: $BUMP_TYPE"

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Bump version using npm (creates git tag automatically)
echo ""
echo "📦 Bumping version..."
NEW_VERSION=$(npm version "$BUMP_TYPE" --no-git-tag-version)
NEW_VERSION=${NEW_VERSION#v}  # Remove 'v' prefix
echo "New version: $NEW_VERSION"

# Update version references in README.md
echo ""
echo "📝 Updating README.md version references..."
sed -i "s|pdq-wasm@[0-9]\+\.[0-9]\+\.[0-9]\+|pdq-wasm@$NEW_VERSION|g" README.md
echo "   ✓ Updated all version references to $NEW_VERSION"

# Commit version bump and README updates
echo ""
echo "💾 Committing version bump..."
git add package.json package-lock.json README.md
git commit -m "Release v${NEW_VERSION}: Version bump and documentation update"
git tag "v${NEW_VERSION}"
echo "   ✓ Created commit and tag v${NEW_VERSION}"

# Run tests
echo ""
echo "🧪 Running tests..."
npm test
echo "   ✓ All tests passed"

# Build the project
echo ""
echo "🔨 Building project..."
npm run build
echo "   ✓ Build successful"

# Publish to npm
echo ""
echo "📤 Publishing to npm..."
npm publish --access public
echo "   ✓ Published to npm"

# Push to GitHub
echo ""
echo "⬆️  Pushing to GitHub..."
git push origin master --tags
echo "   ✓ Pushed to GitHub"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Package: pdq-wasm@${NEW_VERSION}"
echo "npm: https://www.npmjs.com/package/pdq-wasm"
echo "GitHub: https://github.com/Raudbjorn/pdq-wasm"
echo "unpkg: https://unpkg.com/pdq-wasm@${NEW_VERSION}/"
echo ""
