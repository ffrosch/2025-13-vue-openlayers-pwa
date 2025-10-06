# Code Style & Conventions

## TypeScript Configuration

### Compiler Options
- **Strict Mode**: Enabled (`strict: true`)
- **Unused Variables**: Not allowed (`noUnusedLocals: true`, `noUnusedParameters: true`)
- **Fall-through Cases**: Not allowed (`noFallthroughCasesInSwitch: true`)
- **Unchecked Side Effects**: Not allowed (`noUncheckedSideEffectImports: true`)
- **Path Alias**: `@/*` maps to `./src/*`

### File Extensions
- `.vue` for Vue components
- `.ts` for TypeScript files
- `.d.ts` for type declarations

## Vue 3 Patterns

### Script Setup
Components use `<script setup>` syntax (modern Vue 3 composition API)

### Component Structure
```vue
<script setup lang="ts">
// Imports
// Reactive state
// Functions
</script>

<template>
  <!-- Template -->
</template>

<style scoped>
  /* Component-specific styles */
</style>
```

## Naming Conventions

### Files
- **Components**: PascalCase (e.g., `PWABadge.vue`, `App.vue`)
- **Config Files**: kebab-case (e.g., `vite.config.ts`, `pwa-assets.config.ts`)
- **Documentation**: UPPERCASE or kebab-case (e.g., `CLAUDE.md`, `requirements.md`)

### Directories
- Lowercase with hyphens if needed
- `src/components/` for Vue components
- `public/` for static assets
- `docs/` for documentation
- `claudedocs/` for Claude-specific analysis

## Styling

### TailwindCSS v4
- Utility-first CSS framework
- No custom CSS unless necessary
- Use Tailwind classes in templates

## PWA Patterns

### Service Worker
- Manual registration via `useRegisterSW` composable
- `registerType: "prompt"` for user-controlled updates
- Periodic sync checking (configurable period)

### Update Strategy
- Toast notifications for offline ready and update available states
- User-initiated updates (not automatic)

## Import Style
- ES modules (`import`/`export`)
- Type-only imports use `import type` when appropriate
- Vite environment types via `/// <reference types="vite/client" />`