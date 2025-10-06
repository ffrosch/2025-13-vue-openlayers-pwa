# Suggested Commands

## Development Commands

### Start Development Server
```bash
bunx --bun vite
```
- Starts Vite dev server using Bun runtime
- Hot module replacement enabled
- PWA dev mode active

### Build for Production
```bash
vue-tsc -b && bunx --bun vite build
```
- Type-checks TypeScript files first
- Builds optimized production bundle
- Generates service worker and PWA assets

### Preview Production Build
```bash
bunx --bun vite preview
```
- Serves production build locally
- Tests PWA functionality in production mode

### Generate PWA Assets
```bash
bunx pwa-assets-generator
```
- Generates icons and splash screens
- Uses `public/favicon.svg` as source
- Applies `minimal2023Preset` configuration

## System Commands

### Git Operations
```bash
git status          # Check working tree status
git branch          # List branches
git log --oneline   # View commit history
```

### File Operations (Linux)
```bash
ls -la              # List all files with details
grep -r "pattern"   # Search files recursively
find . -name "*.vue" # Find files by pattern
```

## Testing & Quality
No test framework configured yet. Type checking via `vue-tsc -b` is the primary quality gate.