# Codebase Structure

## Directory Layout

```
/
├── src/                      # Source code
│   ├── components/           # Vue components
│   │   └── PWABadge.vue     # Service worker UI controller
│   ├── App.vue              # Root component
│   ├── main.ts              # Application entry point
│   ├── style.css            # Global styles
│   └── vite-env.d.ts        # Vite type declarations
├── public/                   # Static assets (not processed by Vite)
│   └── favicon.svg          # Source for PWA asset generation
├── docs/                     # Project documentation
│   └── requirements.md      # Functional requirements (FR001, FR002)
├── claudedocs/              # Claude-specific analysis documents
│   └── FR002-design.md      # Storage persistence design
├── .github/workflows/       # GitHub Actions CI/CD
│   └── main.yml             # Build and deploy workflow
├── .serena/                 # Serena MCP configuration and memories
│   ├── project.yml          # Project configuration
│   └── memories/            # Session persistence data
├── index.html               # Entry HTML file
├── vite.config.ts           # Vite + PWA + TailwindCSS config
├── pwa-assets.config.ts     # PWA asset generation config
├── tsconfig.json            # Root TypeScript config
├── tsconfig.app.json        # App-specific TypeScript config
├── tsconfig.node.json       # Node-specific TypeScript config
├── package.json             # Dependencies and scripts
├── bun.lock                 # Bun lockfile
├── CLAUDE.md                # Claude Code guidance
└── README.md                # Project readme
```

## Key Files & Their Roles

### Configuration Files
- **vite.config.ts**: Vite + Vue + TailwindCSS + PWA plugin configuration
  - Base path: `/2025-13-vue-openlayers-pwa/`
  - Path alias: `@` → `/src`
  - Service worker: `registerType: "prompt"`, `injectRegister: false`
  
- **pwa-assets.config.ts**: Icon and splash screen generation
  - Preset: `minimal2023Preset`
  - Source: `public/favicon.svg`

- **tsconfig.*.json**: TypeScript configuration
  - Strict mode with unused variable checks
  - DOM types included
  - Path alias support

### Source Code
- **src/main.ts**: Creates Vue app, mounts to `#app`
- **src/App.vue**: Root component (currently minimal, renders PWABadge)
- **src/components/PWABadge.vue**: 
  - Service worker lifecycle management
  - Update notification UI
  - Periodic sync checking (hourly default)

### Build Artifacts (Gitignored)
- `dist/`: Production build output
- `node_modules/`: Dependencies
- `.tmp/`: TypeScript build info

## Component Hierarchy
```
App.vue
└── PWABadge.vue
```

## PWA Architecture

### Service Worker Flow
1. **Registration**: PWABadge.vue uses `useRegisterSW` on mount
2. **Lifecycle Events**: 
   - `offlineReady`: Cache complete, offline capable
   - `needRefresh`: New version available
3. **Update Checking**: Periodic (`setInterval`) with configurable period
4. **User Control**: Updates triggered by user action, not automatic

### Caching Strategy
- **Workbox**: Precaches JS, CSS, HTML, SVG, PNG, ICO
- **Cleanup**: `cleanupOutdatedCaches: true`
- **Claims**: `clientsClaim: true` for immediate control

## Deployment
- **Target**: GitHub Pages or subdirectory deployment
- **Base Path**: `/2025-13-vue-openlayers-pwa/`
- **CI/CD**: GitHub Actions workflow in `.github/workflows/main.yml`