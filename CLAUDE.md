# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vue 3 + OpenLayers Progressive Web App (PWA) with local tile storage for offline mode. Uses Bun as the runtime and package manager, configured with Vite for build tooling, TailwindCSS v4 for styling, and shadcn-vue for UI components.

## Development Commands

```bash
# Start development server (uses Bun runtime)
bunx --bun vite

# Type-check and build for production
vue-tsc -b && bunx --bun vite build

# Preview production build
bunx --bun vite preview

# Generate PWA assets (icons, splash screens)
bunx pwa-assets-generator

# Add shadcn-vue UI components
bunx shadcn-vue@latest add <component-name>
```

## Architecture

### UI Components (shadcn-vue)

- **Component Library**: shadcn-vue configured with "new-york" style variant
- **Icon Library**: Lucide icons via `lucide-vue-next` package
- **Styling**: TailwindCSS v4 with CSS variables enabled, neutral base color
- **Utilities**: `cn()` helper function available at `@/lib/utils` for className merging
- **Component Location**: UI components are installed to `@/components/ui/`
- **Usage**: Always prefer shadcn-vue components for UI elements (buttons, forms, dialogs, etc.)
- **Installation**: Use `bunx shadcn-vue@latest add <component>` to add new components

**Path Aliases:**
- `@/components` → src/components
- `@/components/ui` → src/components/ui
- `@/lib` → src/lib
- `@/lib/utils` → src/lib/utils

### PWA Configuration

- **Service Worker**: Configured with `registerType: "prompt"` and `injectRegister: false` in vite.config.ts
- **Update Strategy**: PWABadge component implements periodic sync checking every hour (configurable via `period` constant)
- **Offline Support**: Workbox caches JS, CSS, HTML, SVG, PNG, and ICO files with `cleanupOutdatedCaches` enabled
- **Manual Registration**: Service worker is NOT auto-injected; registration logic is in PWABadge.vue using `useRegisterSW` from `virtual:pwa-register/vue`

### PWA Update Flow

The PWABadge component (src/components/PWABadge.vue) handles service worker lifecycle:
1. Registers SW on component mount with `immediate: true`
2. Sets up periodic update checks (default: hourly) when SW is activated
3. Displays toast notifications for two states:
   - `offlineReady`: App cached and ready for offline use
   - `needRefresh`: New version available, prompting user to reload

### Build Configuration

- **Base Path**: Set to `/2025-13-vue-openlayers-pwa/` (GitHub Pages or subdirectory deployment)
- **Path Alias**: `@` maps to `/src` directory
- **TypeScript**: Strict mode enabled with unused variable checks
- **Dev PWA**: enabled

### Asset Generation

PWA assets use the `minimal2023Preset` from `@vite-pwa/assets-generator` with source image at `public/favicon.svg`.

## Project Structure

- **src/main.ts**: App entry point, minimal Vue app initialization
- **src/App.vue**: Root component, currently only renders PWABadge
- **src/components/**: Vue components directory
- **src/components/ui/**: shadcn-vue UI components (auto-generated)
- **src/components/PWABadge.vue**: Service worker UI controller and update manager
- **src/lib/utils.ts**: Utility functions including `cn()` for className merging
- **components.json**: shadcn-vue configuration file
- **vite.config.ts**: Vite + PWA + TailwindCSS plugin configuration
- **pwa-assets.config.ts**: PWA icon and splash screen generation settings
