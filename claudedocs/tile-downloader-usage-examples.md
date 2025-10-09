# Tile Downloader - Usage Examples

Complete examples for using the Tile Downloader service in various scenarios.

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Vue 3 Composable](#vue-3-composable)
3. [With Deduplication](#with-deduplication)
4. [Service Worker Background Download](#service-worker-background-download)
5. [GeoServer/WMTS](#geoserver-wmts)
6. [Error Handling](#error-handling)
7. [Progress Monitoring](#progress-monitoring)
8. [IndexedDB Storage](#indexeddb-storage)

---

## Basic Usage

### Simple OSM Download

```typescript
import { downloadTiles } from '@/services/tileDownloader';

async function downloadBerlinMap() {
  const result = await downloadTiles({
    serviceName: 'osm',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    bbox: [13.0, 52.3, 13.8, 52.7], // Berlin bounding box
    minZoom: 10,
    maxZoom: 14,
    subdomains: ['a', 'b', 'c'],
    rateLimit: 2 // Be nice to OSM servers
  });

  console.log(`Downloading ${result.totalTiles} tiles (~${result.estimatedSize / 1024 / 1024}MB)`);

  // Stream tiles as they download
  for await (const tile of result.tiles) {
    console.log(`Downloaded tile: ${tile.serviceName}:${tile.z}:${tile.x}:${tile.y}`);
    // Store tile (see IndexedDB section below)
    await storeTile(tile);
  }

  // Get final statistics
  const stats = await result.stats;
  console.log(`Download complete!`);
  console.log(`Success rate: ${stats.successRatio * 100}%`);
  console.log(`Downloaded: ${stats.successful} tiles`);
  console.log(`Failed: ${stats.failed} tiles`);
  console.log(`Total size: ${stats.actualSize / 1024 / 1024}MB`);
  console.log(`Average speed: ${stats.averageSpeed / 1024}KB/s`);
}
```

### With Pause/Resume/Cancel

```typescript
import { downloadTiles } from '@/services/tileDownloader';

let downloadResult: any = null;

async function startDownload() {
  downloadResult = await downloadTiles({
    serviceName: 'osm',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    bbox: [10.0, 50.0, 15.0, 55.0],
    minZoom: 8,
    maxZoom: 12
  });

  // Process tiles in background
  (async () => {
    for await (const tile of downloadResult.tiles) {
      await storeTile(tile);
    }
  })();
}

function pauseDownload() {
  if (downloadResult) {
    downloadResult.pause();
    console.log('Download paused');
  }
}

function resumeDownload() {
  if (downloadResult) {
    downloadResult.resume();
    console.log('Download resumed');
  }
}

function cancelDownload() {
  if (downloadResult) {
    downloadResult.cancel();
    console.log('Download cancelled');
  }
}
```

---

## Vue 3 Composable

### Component with Reactive Progress

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useTileDownloader } from '@/composables/useTileDownloader';
import { storeTileInIndexedDB } from '@/utils/tileStorage';

const downloader = useTileDownloader({
  mode: 'worker', // Use Web Worker for background downloads
  onTileDownloaded: async (tile) => {
    // Store each tile as it arrives
    await storeTileInIndexedDB(tile);
  },
  onProgress: (progress) => {
    console.log(`Progress: ${progress.percentComplete * 100}%`);
  },
  onComplete: (stats) => {
    console.log('Download complete!', stats);
  },
  onError: (error) => {
    console.error('Download failed:', error);
  }
});

const bbox = ref<[number, number, number, number]>([13.0, 52.3, 13.8, 52.7]);
const minZoom = ref(10);
const maxZoom = ref(14);

async function startDownload() {
  await downloader.start({
    serviceName: 'osm',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    bbox: bbox.value,
    minZoom: minZoom.value,
    maxZoom: maxZoom.value,
    subdomains: ['a', 'b', 'c'],
    rateLimit: 2
  });
}
</script>

<template>
  <div class="tile-downloader">
    <h2>Map Tile Downloader</h2>

    <!-- Configuration -->
    <div class="config">
      <label>
        Min Zoom: <input v-model.number="minZoom" type="number" min="0" max="18" />
      </label>
      <label>
        Max Zoom: <input v-model.number="maxZoom" type="number" min="0" max="18" />
      </label>
    </div>

    <!-- Controls -->
    <div class="controls">
      <button @click="startDownload" :disabled="downloader.isDownloading.value">
        Start Download
      </button>
      <button @click="downloader.pause()" :disabled="!downloader.isDownloading.value">
        Pause
      </button>
      <button @click="downloader.resume()" :disabled="!downloader.isPaused.value">
        Resume
      </button>
      <button @click="downloader.cancel()" :disabled="!downloader.isDownloading.value">
        Cancel
      </button>
    </div>

    <!-- Progress -->
    <div v-if="downloader.progress.value" class="progress">
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: `${downloader.progressPercent.value}%` }"
        ></div>
      </div>

      <div class="stats">
        <p>State: {{ downloader.state.value }}</p>
        <p>Progress: {{ downloader.progressPercent.value.toFixed(1) }}%</p>
        <p>Downloaded: {{ downloader.downloadedCount.value }} tiles</p>
        <p>Failed: {{ downloader.failedCount.value }} tiles</p>
        <p>Speed: {{ (downloader.downloadSpeed.value / 1024).toFixed(1) }} KB/s</p>
        <p>ETA: {{ Math.floor(downloader.eta.value / 60) }}m {{ Math.floor(downloader.eta.value % 60) }}s</p>
      </div>
    </div>

    <!-- Final Stats -->
    <div v-if="downloader.stats.value" class="final-stats">
      <h3>Download Complete</h3>
      <p>Success Rate: {{ (downloader.stats.value.successRatio * 100).toFixed(1) }}%</p>
      <p>Total Size: {{ (downloader.stats.value.actualSize / 1024 / 1024).toFixed(2) }} MB</p>
      <p>Download Time: {{ (downloader.stats.value.downloadTime / 1000).toFixed(1) }}s</p>
    </div>

    <!-- Error -->
    <div v-if="downloader.error.value" class="error">
      <p>Error: {{ downloader.error.value }}</p>
    </div>
  </div>
</template>

<style scoped>
.progress-bar {
  width: 100%;
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #4caf50;
  transition: width 0.3s ease;
}

.stats {
  margin-top: 1rem;
}

.error {
  color: red;
  margin-top: 1rem;
}
</style>
```

---

## With Deduplication

### Skip Already Downloaded Tiles

```typescript
import { downloadTiles, type TileCache } from '@/services/tileDownloader';
import { loadCacheFromIndexedDB } from '@/utils/tileStorage';

async function downloadWithDeduplication() {
  // Load existing tiles from IndexedDB
  const existingTiles: TileCache = await loadCacheFromIndexedDB();

  const result = await downloadTiles({
    serviceName: 'satellite',
    url: 'https://satellite.example.com/{z}/{x}/{y}.jpg',
    bbox: [5.0, 45.0, 10.0, 50.0],
    minZoom: 5,
    maxZoom: 10,
    existingTiles // Skip tiles that already exist
  });

  console.log(`${result.totalTiles} new tiles to download (deduplication applied)`);

  for await (const tile of result.tiles) {
    await storeTile(tile);
  }
}
```

### Building TileCache from IndexedDB

```typescript
import type { TileCache } from '@/services/tileDownloader';

async function loadCacheFromIndexedDB(): Promise<TileCache> {
  const db = await openDB('tile-storage', 1);
  const tx = db.transaction('tiles', 'readonly');
  const store = tx.objectStore('tiles');

  const allTiles = await store.getAll();
  const cache: TileCache = {};

  for (const record of allTiles) {
    const { serviceName, z, x, y } = record;

    if (!cache[serviceName]) cache[serviceName] = {};
    if (!cache[serviceName][z]) cache[serviceName][z] = {};
    if (!cache[serviceName][z][x]) cache[serviceName][z][x] = {};

    cache[serviceName][z][x][y] = true; // Just mark as existing
  }

  return cache;
}
```

---

## Service Worker Background Download

### Register and Start Background Download

```typescript
import type { TileDownloadConfig } from '@/services/tileDownloader';
import type { WorkerCommand, WorkerResponse } from '@/workers/tileDownloaderWorker';

class BackgroundTileDownloader {
  private worker: Worker | null = null;
  private downloadId: string | null = null;

  async startBackgroundDownload(config: TileDownloadConfig): Promise<void> {
    // Create worker
    this.worker = new Worker(
      new URL('@/workers/tileDownloaderWorker.ts', import.meta.url),
      { type: 'module' }
    );

    this.downloadId = `download-${Date.now()}`;

    return new Promise((resolve, reject) => {
      if (!this.worker || !this.downloadId) {
        reject(new Error('Worker initialization failed'));
        return;
      }

      // Handle messages
      this.worker.onmessage = async (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;

        switch (response.type) {
          case 'DOWNLOAD_STARTED':
            console.log(`Download started: ${response.totalTiles} tiles`);
            break;

          case 'PROGRESS_UPDATE':
            console.log(`Progress: ${response.progress.percentComplete * 100}%`);
            break;

          case 'TILE_DOWNLOADED':
            // Store tile in IndexedDB
            await storeTileInIndexedDB(response.tile);
            break;

          case 'DOWNLOAD_COMPLETE':
            console.log('Download complete!', response.stats);
            resolve();
            break;

          case 'DOWNLOAD_ERROR':
            reject(new Error(response.error));
            break;
        }
      };

      // Start download
      this.worker.postMessage({
        type: 'START_DOWNLOAD',
        id: this.downloadId,
        config
      } as WorkerCommand);
    });
  }

  pause(): void {
    if (this.worker && this.downloadId) {
      this.worker.postMessage({
        type: 'PAUSE_DOWNLOAD',
        id: this.downloadId
      } as WorkerCommand);
    }
  }

  resume(): void {
    if (this.worker && this.downloadId) {
      this.worker.postMessage({
        type: 'RESUME_DOWNLOAD',
        id: this.downloadId
      } as WorkerCommand);
    }
  }

  cancel(): void {
    if (this.worker && this.downloadId) {
      this.worker.postMessage({
        type: 'CANCEL_DOWNLOAD',
        id: this.downloadId
      } as WorkerCommand);

      this.worker.terminate();
      this.worker = null;
      this.downloadId = null;
    }
  }
}

// Usage
const downloader = new BackgroundTileDownloader();

await downloader.startBackgroundDownload({
  serviceName: 'osm',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  bbox: [13.0, 52.3, 13.8, 52.7],
  minZoom: 10,
  maxZoom: 14
});
```

---

## GeoServer/WMTS

### With GetCapabilities CRS Detection

```typescript
import { downloadTiles, getSupportedCRS } from '@/services/tileDownloader';

async function downloadGeoServerTiles() {
  // Optional: Get supported CRS first
  const capabilities = await getSupportedCRS(
    'https://geoserver.example.com/geoserver/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    'wms'
  );

  console.log('Supported CRS:', capabilities.supportedCRS);
  console.log('Default CRS:', capabilities.default);

  // Download with automatic CRS detection
  const result = await downloadTiles({
    serviceName: 'geoserver-layer',
    url: 'https://geoserver.example.com/geoserver/gwc/service/wmts?layer=myLayer&tilematrixset=EPSG:3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}',
    bbox: [10.0, 50.0, 15.0, 55.0],
    minZoom: 8,
    maxZoom: 12,
    capabilitiesUrl: 'https://geoserver.example.com/geoserver/wms?SERVICE=WMS&REQUEST=GetCapabilities',
    tileScheme: 'wmts'
  });

  for await (const tile of result.tiles) {
    await storeTile(tile);
  }
}
```

### QGIS Server

```typescript
import { downloadTiles } from '@/services/tileDownloader';

async function downloadQGISServerTiles() {
  const result = await downloadTiles({
    serviceName: 'qgis-layer',
    url: 'https://qgis.example.com/cgi-bin/qgis_mapserv.fcgi?MAP=/path/to/project.qgs&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox}&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&LAYERS=myLayer&FORMAT=image/png',
    bbox: [8.0, 47.0, 12.0, 50.0],
    minZoom: 6,
    maxZoom: 10,
    tileScheme: 'xyz',
    crs: 'EPSG:3857'
  });

  for await (const tile of result.tiles) {
    await storeTile(tile);
  }
}
```

---

## Error Handling

### Comprehensive Error Handling

```typescript
import { downloadTiles } from '@/services/tileDownloader';

async function downloadWithErrorHandling() {
  try {
    const result = await downloadTiles({
      serviceName: 'osm',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      bbox: [13.0, 52.3, 13.8, 52.7],
      minZoom: 10,
      maxZoom: 14,
      retries: 5,
      retryBaseDelay: 1000
    });

    for await (const tile of result.tiles) {
      try {
        await storeTile(tile);
      } catch (storageError) {
        console.error(`Failed to store tile ${tile.z}:${tile.x}:${tile.y}:`, storageError);
        // Continue with next tile
      }
    }

    const stats = await result.stats;

    if (stats.failed > 0) {
      console.warn(`${stats.failed} tiles failed to download`);
      console.log('Failed tiles:', stats.failedTiles);
      console.log('Errors:', stats.errors);

      // Optionally retry failed tiles
      if (stats.successRatio < 0.9) {
        console.log('Success rate below 90%, consider retrying');
      }
    }

  } catch (error) {
    if (error instanceof Error && error.message.includes('failure rate exceeded')) {
      console.error('Download aborted due to high failure rate');
    } else {
      console.error('Download failed:', error);
    }
  }
}
```

---

## Progress Monitoring

### Real-Time Progress Updates

```typescript
import { downloadTiles } from '@/services/tileDownloader';

async function downloadWithProgress() {
  const result = await downloadTiles({
    serviceName: 'osm',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    bbox: [13.0, 52.3, 13.8, 52.7],
    minZoom: 10,
    maxZoom: 14
  });

  // Monitor progress every second
  const progressInterval = setInterval(() => {
    const progress = result.progress;

    console.log(`
      State: ${progress.state}
      Progress: ${(progress.percentComplete * 100).toFixed(1)}%
      Downloaded: ${progress.downloaded}/${progress.totalTiles} tiles
      Failed: ${progress.failed}
      Speed: ${(progress.currentSpeed / 1024).toFixed(1)} KB/s
      ETA: ${Math.floor(progress.eta / 60)}m ${Math.floor(progress.eta % 60)}s
      Downloaded Size: ${(progress.downloadedBytes / 1024 / 1024).toFixed(2)} MB
    `);

    if (progress.state === 'completed' || progress.state === 'failed' || progress.state === 'cancelled') {
      clearInterval(progressInterval);
    }
  }, 1000);

  // Process tiles
  for await (const tile of result.tiles) {
    await storeTile(tile);
  }

  clearInterval(progressInterval);
}
```

---

## IndexedDB Storage

### Complete Storage Implementation

```typescript
import { openDB, type IDBPDatabase } from 'idb';
import type { TileBlob, TileCache } from '@/services/tileDownloader';

const DB_NAME = 'tile-storage';
const STORE_NAME = 'tiles';
const DB_VERSION = 1;

interface TileRecord {
  id: string; // "serviceName:z:x:y"
  serviceName: string;
  z: number;
  x: number;
  y: number;
  blob: Blob;
  size: number;
  timestamp: number;
}

/**
 * Open IndexedDB
 */
async function openTileDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('serviceName', 'serviceName');
        store.createIndex('z', 'z');
        store.createIndex('timestamp', 'timestamp');
      }
    }
  });
}

/**
 * Store tile in IndexedDB
 */
export async function storeTileInIndexedDB(tile: TileBlob): Promise<void> {
  const db = await openTileDB();

  const record: TileRecord = {
    id: `${tile.serviceName}:${tile.z}:${tile.x}:${tile.y}`,
    serviceName: tile.serviceName,
    z: tile.z,
    x: tile.x,
    y: tile.y,
    blob: tile.blob,
    size: tile.size,
    timestamp: Date.now()
  };

  await db.put(STORE_NAME, record);
}

/**
 * Retrieve tile from IndexedDB
 */
export async function getTileFromIndexedDB(
  serviceName: string,
  z: number,
  x: number,
  y: number
): Promise<Blob | null> {
  const db = await openTileDB();
  const id = `${serviceName}:${z}:${x}:${y}`;

  const record = await db.get(STORE_NAME, id);
  return record ? record.blob : null;
}

/**
 * Load tile cache for deduplication
 */
export async function loadCacheFromIndexedDB(serviceName?: string): Promise<TileCache> {
  const db = await openTileDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  let records: TileRecord[];

  if (serviceName) {
    const index = store.index('serviceName');
    records = await index.getAll(serviceName);
  } else {
    records = await store.getAll();
  }

  const cache: TileCache = {};

  for (const record of records) {
    if (!cache[record.serviceName]) cache[record.serviceName] = {};
    if (!cache[record.serviceName][record.z]) cache[record.serviceName][record.z] = {};
    if (!cache[record.serviceName][record.z][record.x]) cache[record.serviceName][record.z][record.x] = {};

    cache[record.serviceName][record.z][record.x][record.y] = true;
  }

  return cache;
}

/**
 * Delete tiles for a service
 */
export async function deleteTilesForService(serviceName: string): Promise<void> {
  const db = await openTileDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('serviceName');

  const keys = await index.getAllKeys(serviceName);

  for (const key of keys) {
    await store.delete(key);
  }

  await tx.done;
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<{
  totalTiles: number;
  totalSize: number;
  byService: Record<string, { tiles: number; size: number }>;
}> {
  const db = await openTileDB();
  const records = await db.getAll(STORE_NAME);

  const stats = {
    totalTiles: records.length,
    totalSize: 0,
    byService: {} as Record<string, { tiles: number; size: number }>
  };

  for (const record of records) {
    stats.totalSize += record.size;

    if (!stats.byService[record.serviceName]) {
      stats.byService[record.serviceName] = { tiles: 0, size: 0 };
    }

    stats.byService[record.serviceName].tiles++;
    stats.byService[record.serviceName].size += record.size;
  }

  return stats;
}
```

### Using Stored Tiles with OpenLayers

```typescript
import { getTileFromIndexedDB } from '@/utils/tileStorage';
import XYZ from 'ol/source/XYZ';

const tileSource = new XYZ({
  url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileLoadFunction: async (tile: any, src: string) => {
    // Extract z, x, y from URL
    const match = src.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
    if (!match) return;

    const [, z, x, y] = match.map(Number);

    // Try to load from IndexedDB first
    const cachedBlob = await getTileFromIndexedDB('osm', z, x, y);

    if (cachedBlob) {
      const objectURL = URL.createObjectURL(cachedBlob);
      tile.getImage().src = objectURL;
    } else {
      // Fall back to network
      tile.getImage().src = src;
    }
  }
});
```

---

## Complete Example: Full Application

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useTileDownloader } from '@/composables/useTileDownloader';
import {
  storeTileInIndexedDB,
  loadCacheFromIndexedDB,
  getStorageStats
} from '@/utils/tileStorage';

const downloader = useTileDownloader({
  mode: 'worker',
  onTileDownloaded: storeTileInIndexedDB,
  onComplete: async (stats) => {
    console.log('Download complete!', stats);
    await updateStorageStats();
  }
});

const storageStats = ref<any>(null);

async function updateStorageStats() {
  storageStats.value = await getStorageStats();
}

async function startOSMDownload() {
  const existingTiles = await loadCacheFromIndexedDB('osm');

  await downloader.start({
    serviceName: 'osm',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    bbox: [13.0, 52.3, 13.8, 52.7],
    minZoom: 10,
    maxZoom: 14,
    existingTiles,
    rateLimit: 2
  });
}

// Load stats on mount
updateStorageStats();
</script>

<template>
  <div class="app">
    <h1>Offline Map Downloader</h1>

    <!-- Storage Stats -->
    <div v-if="storageStats" class="storage-stats">
      <h2>Storage</h2>
      <p>Total Tiles: {{ storageStats.totalTiles }}</p>
      <p>Total Size: {{ (storageStats.totalSize / 1024 / 1024).toFixed(2) }} MB</p>

      <div v-for="(stats, service) in storageStats.byService" :key="service">
        <h3>{{ service }}</h3>
        <p>Tiles: {{ stats.tiles }}</p>
        <p>Size: {{ (stats.size / 1024 / 1024).toFixed(2) }} MB</p>
      </div>
    </div>

    <!-- Download Controls -->
    <button @click="startOSMDownload">Download OSM Berlin (10-14)</button>
    <button @click="downloader.pause()" :disabled="!downloader.isDownloading.value">
      Pause
    </button>
    <button @click="downloader.resume()" :disabled="!downloader.isPaused.value">
      Resume
    </button>
    <button @click="downloader.cancel()">Cancel</button>

    <!-- Progress -->
    <div v-if="downloader.progress.value">
      <h2>Progress: {{ downloader.progressPercent.value.toFixed(1) }}%</h2>
      <progress :value="downloader.progressPercent.value" max="100"></progress>
      <p>{{ downloader.downloadedCount.value }} / {{ downloader.progress.value.totalTiles }} tiles</p>
      <p>Speed: {{ (downloader.downloadSpeed.value / 1024).toFixed(1) }} KB/s</p>
    </div>
  </div>
</template>
```
