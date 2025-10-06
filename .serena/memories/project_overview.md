# Project Overview

## Purpose
Vue 3 + OpenLayers Progressive Web App (PWA) with local tile storage for offline mode. The application allows users to access maps offline and ensures persistent storage of downloaded map tiles.

## Tech Stack
- **Runtime**: Bun (package manager and runtime)
- **Framework**: Vue 3 (3.5.13)
- **Build Tool**: Vite (6.0.11)
- **Styling**: TailwindCSS v4 (4.1.14)
- **Maps**: OpenLayers (to be integrated)
- **PWA**: vite-plugin-pwa (0.21.1) with Workbox (7.3.0)
- **Language**: TypeScript (5.9.3) with strict mode
- **Type Checking**: vue-tsc (2.2.0)

## Key Features
- Progressive Web App installable on mobile devices
- Service worker with manual registration and update prompts
- Periodic sync checking (hourly) for updates
- Offline map tile storage
- Storage persistence configuration (FR002)

## Project Status
- PWA infrastructure: ✅ Complete
- Storage persistence: 🔄 In progress (FR002 design phase)
- OpenLayers integration: ⏳ Pending