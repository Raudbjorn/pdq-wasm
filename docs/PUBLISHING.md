# Publishing PDQ WASM to npm

This guide covers publishing the pdq-wasm package to npm registry.

## Prerequisites

1. **npm account**: Create one at https://www.npmjs.com/signup
2. **npm CLI**: Installed with Node.js
3. **Package built**: Ensure `npm run build` has been run
4. **Tests passing**: Ensure `npm test` passes

## One-Time Setup

### 1. Login to npm

```bash
npm login
```

Enter your npm credentials when prompted:
- Username
- Password
- Email
- One-time password (if 2FA is enabled)

### 2. Verify Login

```bash
npm whoami
```

Should display your npm username.

## Publishing Process

### 1. Verify Package Contents

First, check what files will be included in the package:

```bash
npm pack --dry-run
```

This will show all files that will be published. Verify that:
- ✅ `dist/` directory is included
- ✅ `wasm/` directory is included
- ✅ `examples/` directory is included
- ✅ `README.md` is included
- ✅ `BUILDING.md` is included
- ✅ `LICENSE` is included
- ❌ `src/`, `__tests__/`, `cpp/` are NOT included
- ❌ `node_modules/` is NOT included

### 2. Clean Build

Ensure a fresh build:

```bash
npm run clean
npm run build
```

### 3. Run Tests

Verify everything works:

```bash
npm test
```

All 43 tests should pass.

### 4. Update Version (if needed)

If this isn't the first publish, update the version:

```bash
# For patch releases (bug fixes)
npm version patch

# For minor releases (new features)
npm version minor

# For major releases (breaking changes)
npm version major

# Or manually specify version
npm version 0.1.1
```

This will:
- Update `package.json` version
- Create a git commit
- Create a git tag

### 5. Publish to npm

```bash
npm publish
```

This will:
- Pack the package
- Upload to npm registry
- Make it publicly available

**Note**: The first publish might take a few moments.

### 6. Push to GitHub

Don't forget to push the version tag:

```bash
git push
git push --tags
```

## Verify Publication

### Check on npm

Visit: https://www.npmjs.com/package/pdq-wasm

You should see:
- Your package page
- Version number
- README displayed
- File explorer showing package contents

### Test Installation

In a separate directory:

```bash
# Create test directory
mkdir test-pdq-wasm
cd test-pdq-wasm
npm init -y

# Install your package
npm install pdq-wasm

# Test it
node -e "const {PDQ} = require('pdq-wasm'); PDQ.init().then(() => console.log('PDQ loaded!'))"
```

## Automated Publishing via GitHub Actions

The repository includes a GitHub Actions workflow (`.github/workflows/publish.yml`) that can automatically publish to npm.

### Setup

1. **Create npm access token**:
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token"
   - Choose "Automation" token type
   - Copy the token

2. **Add to GitHub Secrets**:
   - Go to your GitHub repository settings
   - Navigate to "Secrets and variables" → "Actions"
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Paste your npm token
   - Click "Add secret"

### Manual Trigger

You can manually trigger the publish workflow:

1. Go to GitHub repository → Actions tab
2. Select "Publish to npm" workflow
3. Click "Run workflow"
4. Choose the branch
5. Click "Run workflow"

### Automatic on Release

The workflow also triggers automatically when you create a GitHub release:

1. Go to GitHub repository → Releases
2. Click "Create a new release"
3. Choose a tag (e.g., `v0.1.1`)
4. Add release notes
5. Click "Publish release"

The workflow will automatically:
- Install dependencies
- Build the package
- Run tests
- Publish to npm (if tests pass)

## Versioning Strategy

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backward compatible
- **PATCH** (0.0.1): Bug fixes, backward compatible

### Examples

- `0.1.0` → `0.1.1`: Bug fix
- `0.1.1` → `0.2.0`: Added new API method
- `0.2.0` → `1.0.0`: Changed API in non-compatible way

## Troubleshooting

### "You must be logged in to publish packages"

**Solution**: Run `npm login` and authenticate.

### "You do not have permission to publish"

**Solution**:
- Verify you're logged in as the correct user: `npm whoami`
- Check if package name is available: `npm search pdq-wasm`
- If name is taken, choose a different name in `package.json`

### "Package name too similar to existing package"

**Solution**: npm prevents publishing packages with names too similar to existing ones. Choose a more unique name.

### "Version already exists"

**Solution**: You cannot republish the same version. Update version:
```bash
npm version patch
npm publish
```

### Build artifacts missing

**Solution**: Ensure you ran `npm run build` before publishing:
```bash
npm run build
ls dist/  # Should show compiled files
ls wasm/  # Should show WASM files
```

## Unpublishing (Emergency Only)

If you need to unpublish (not recommended):

```bash
# Unpublish a specific version
npm unpublish pdq-wasm@0.1.0

# Unpublish entire package (within 72 hours of publish)
npm unpublish pdq-wasm --force
```

**Note**: Unpublishing is heavily discouraged as it breaks existing dependencies.

### Better Alternative: Deprecate

If there's an issue, deprecate the version instead:

```bash
npm deprecate pdq-wasm@0.1.0 "This version has a critical bug, please upgrade to 0.1.1"
```

## Package Maintenance

### Updating Package

1. Make your changes
2. Run tests: `npm test`
3. Update version: `npm version patch` (or minor/major)
4. Publish: `npm publish`
5. Push changes: `git push && git push --tags`

### Checking Download Stats

```bash
npm view pdq-wasm

# Or visit
# https://npm-stat.com/charts.html?package=pdq-wasm
```

## Distribution Alternatives

### GitHub Packages

The package can also be published to GitHub Packages using the publish workflow.

**Setup**:
1. The workflow is already configured in `.github/workflows/publish.yml`
2. It publishes to both npm and GitHub Packages simultaneously
3. No additional configuration needed - uses `GITHUB_TOKEN` automatically

**Installation from GitHub Packages**:
```bash
npm install @Raudbjorn/pdq-wasm --registry=https://npm.pkg.github.com
```

### Direct from GitHub

Users can also install directly from GitHub:

```bash
npm install github:Raudbjorn/pdq-wasm

# Or specific branch/commit/tag
npm install github:Raudbjorn/pdq-wasm#main
npm install github:Raudbjorn/pdq-wasm#v0.1.0
```

## Best Practices

1. **Always test before publishing**: `npm test`
2. **Use semantic versioning**: Follow semver.org guidelines
3. **Update CHANGELOG**: Document changes in each version
4. **Tag releases**: Use git tags for each published version
5. **Test installation**: Install and test the published package
6. **Monitor issues**: Check npm and GitHub for user reports
7. **Keep dependencies updated**: Run `npm audit` regularly

## Resources

- npm documentation: https://docs.npmjs.com/
- Semantic Versioning: https://semver.org/
- npm package naming rules: https://docs.npmjs.com/cli/v8/configuring-npm/package-json#name
- Publishing scoped packages: https://docs.npmjs.com/creating-and-publishing-scoped-public-packages
