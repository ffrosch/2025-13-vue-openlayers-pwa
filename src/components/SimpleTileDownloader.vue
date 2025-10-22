<script setup lang="ts">
import { ref, computed } from 'vue';
import { createTileRangeCollection, downloadTiles } from '@/services/newTileDownloader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

// State
const isDownloading = ref(false);
const totalTiles = ref(0);
const downloadedTiles = ref(0);
const failedTiles = ref(0);
const error = ref<string | null>(null);
const tilesByZoom = ref<Map<number, string[]>>(new Map()); // Map of zoom -> blob URLs
const totalBytesDownloaded = ref(0);

// Computed
const progressPercent = computed(() => {
  if (totalTiles.value === 0) return 0;
  return (downloadedTiles.value / totalTiles.value) * 100;
});

const estimatedTotalSize = computed(() => {
  if (downloadedTiles.value === 0) return 0;
  const avgSize = totalBytesDownloaded.value / downloadedTiles.value;
  return avgSize * totalTiles.value;
});

const statusMessage = computed(() => {
  if (error.value) return `Error: ${error.value}`;
  if (isDownloading.value) return 'Downloading...';
  if (downloadedTiles.value > 0) return 'Download complete!';
  return 'Ready to download';
});

// Helpers
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Methods
async function startDownload() {
  // Reset state
  isDownloading.value = true;
  downloadedTiles.value = 0;
  failedTiles.value = 0;
  error.value = null;

  try {
    // Create tile range for a small area (Berlin demo)
    const config = createTileRangeCollection({
      sourceName: 'osm-simple-demo',
      sourceUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      sourceSubdomains: ['a', 'b', 'c'],
      bbox: [13.3, 52.5, 13.4, 52.55], // Very small area in Berlin
      minZoom: 11,
      maxZoom: 13,
      crs: 'EPSG:3857', // Web Mercator (default for OSM)
    });

    totalTiles.value = config.totalCount;
    console.log(`Starting download of ${totalTiles.value} tiles...`);

    // Track current zoom level during iteration
    let currentZoom = config.minZoom;
    let tilesInCurrentZoom = 0;
    const tilesPerZoom = config.tileRanges.map(r => r.count);

    // Use the async generator pattern
    for await (const blob of downloadTiles(config, { maxParallelDownloads: 6 })) {
      try {
        downloadedTiles.value++;

        // Determine zoom level based on tile count
        while (tilesInCurrentZoom >= tilesPerZoom[currentZoom - config.minZoom] && currentZoom <= config.maxZoom) {
          currentZoom++;
          tilesInCurrentZoom = 0;
        }
        tilesInCurrentZoom++;

        // Track total bytes
        totalBytesDownloaded.value += blob.size;

        // Create blob URL for preview
        const blobUrl = URL.createObjectURL(blob);

        // Add to the correct zoom level
        if (!tilesByZoom.value.has(currentZoom)) {
          tilesByZoom.value.set(currentZoom, []);
        }
        tilesByZoom.value.get(currentZoom)!.push(blobUrl);

        console.log(`Downloaded tile ${downloadedTiles.value}/${totalTiles.value} (zoom ${currentZoom}, ${blob.size} bytes)`);
      } catch (err) {
        failedTiles.value++;
        console.error('Tile download failed:', err);
      }
    }

    console.log('Download complete!', {
      total: totalTiles.value,
      downloaded: downloadedTiles.value,
      failed: failedTiles.value
    });

  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error';
    console.error('Download error:', err);
  } finally {
    isDownloading.value = false;
  }
}

function reset() {
  // Clean up blob URLs to prevent memory leaks
  tilesByZoom.value.forEach(urls => {
    urls.forEach(url => URL.revokeObjectURL(url));
  });
  tilesByZoom.value.clear();

  totalTiles.value = 0;
  downloadedTiles.value = 0;
  failedTiles.value = 0;
  totalBytesDownloaded.value = 0;
  error.value = null;
}
</script>

<template>
  <Card class="max-w-xl mx-auto">
    <CardHeader>
      <CardTitle>Simple Tile Downloader</CardTitle>
      <CardDescription>
        Demonstrates the raw async generator pattern from newTileDownloader.ts
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <!-- Status -->
      <div class="p-4 bg-muted rounded-lg">
        <p class="text-sm font-medium mb-2">{{ statusMessage }}</p>
        <div class="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p class="text-muted-foreground">Total</p>
            <p class="text-xl font-bold">{{ totalTiles }}</p>
          </div>
          <div>
            <p class="text-muted-foreground">Downloaded</p>
            <p class="text-xl font-bold text-green-600">{{ downloadedTiles }}</p>
          </div>
          <div>
            <p class="text-muted-foreground">Failed</p>
            <p class="text-xl font-bold text-red-600">{{ failedTiles }}</p>
          </div>
        </div>
      </div>

      <!-- Progress Bar -->
      <div v-if="totalTiles > 0" class="space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium">Progress</span>
          <span class="font-mono">{{ progressPercent.toFixed(1) }}%</span>
        </div>
        <Progress :model-value="progressPercent" />

        <!-- Size Estimate -->
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <span>Download size</span>
          <span class="font-mono">
            {{ formatBytes(totalBytesDownloaded) }} / ~{{ formatBytes(estimatedTotalSize) }}
          </span>
        </div>
      </div>

      <!-- Error Display -->
      <div
        v-if="error"
        class="p-4 bg-red-50 border border-red-200 rounded-lg"
      >
        <p class="text-sm text-red-900 font-medium">Error</p>
        <p class="text-sm text-red-700">{{ error }}</p>
      </div>

      <!-- Controls -->
      <div class="flex gap-2">
        <Button
          @click="startDownload"
          :disabled="isDownloading"
          class="flex-1"
        >
          {{ isDownloading ? 'Downloading...' : 'Start Download' }}
        </Button>
        <Button
          @click="reset"
          :disabled="isDownloading"
          variant="outline"
        >
          Reset
        </Button>
      </div>

      <!-- Info -->
      <div class="text-xs text-muted-foreground space-y-1 pt-4 border-t">
        <p>
          <strong>Note:</strong> This component uses the async generator pattern directly from
          <code class="px-1 py-0.5 bg-muted rounded">newTileDownloader.ts</code>
        </p>
        <p>
          Downloads tiles for a small area in Berlin (zoom 12-14) without storing them.
          Check the browser console for detailed logs.
        </p>
      </div>
    </CardContent>
  </Card>

  <!-- Tile Previews -->
  <Card v-if="tilesByZoom.size > 0" class="max-w-4xl mx-auto mt-6">
    <CardHeader>
      <CardTitle>Downloaded Tiles</CardTitle>
      <CardDescription>
        Live preview grouped by zoom level
      </CardDescription>
    </CardHeader>
    <CardContent class="max-h-96 overflow-y-auto">
      <div
        v-for="[zoom, urls] in Array.from(tilesByZoom.entries()).sort((a, b) => a[0] - b[0])"
        :key="zoom"
        class="mb-6 last:mb-0"
      >
        <h3 class="text-sm font-semibold mb-2 sticky top-0 bg-white z-10 py-1">
          Zoom {{ zoom }} ({{ urls.length }} tiles)
        </h3>
        <div class="grid grid-cols-8 gap-1">
          <img
            v-for="(url, index) in urls"
            :key="index"
            :src="url"
            :alt="`Tile z${zoom} #${index + 1}`"
            class="w-full aspect-square object-cover rounded border border-gray-200"
          />
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<style scoped>
code {
  font-family: ui-monospace, monospace;
  font-size: 0.875em;
}
</style>
