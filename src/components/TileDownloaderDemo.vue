<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useTileDownloader } from '@/composables/useTileDownloader';
import { storeTileInIndexedDB, getStorageStats, loadCacheFromIndexedDB } from '@/utils/tileStorage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

const createTileDownloader = () => useTileDownloader({
  get mode() {
    return useWorker.value ? 'worker' : 'main';
  },
  onTileDownloaded: async (tile) => {
    console.log('Tile downloaded:', tile.z, tile.x, tile.y, tile.size);
    await storeTileInIndexedDB(tile);
    console.log('Tile stored in IndexedDB');
  },
  onProgress: (progress) => {
    console.log(`Progress: ${(progress.percentComplete * 100).toFixed(1)}%`);
  },
  onComplete: async (stats) => {
    console.log('Download complete!', stats);
    await updateStorageStats();
  },
  onError: (error) => {
    console.error('Download failed:', error);
  }
});

// Storage stats
const storageStats = ref<any>(null);

// Download configuration
const serviceName = ref('osm-demo');
const bbox = ref<[number, number, number, number]>([13.3, 52.5, 13.5, 52.6]); // Small area in Berlin
const minZoom = ref(12);
const maxZoom = ref(13);
const useWorker = ref(false);
watch(() => useWorker.value, () => {
  downloader.value = createTileDownloader();
});

// Tile downloader
const downloader = ref(createTileDownloader());

// Computed
const isActive = computed(() =>
  downloader.value.isDownloading || downloader.value.isPaused
);

const stateColor = computed(() => {
  switch (downloader.value.state) {
    case 'downloading': return 'bg-blue-500';
    case 'paused': return 'bg-yellow-500';
    case 'completed': return 'bg-green-500';
    case 'failed': return 'bg-red-500';
    case 'cancelled': return 'bg-gray-500';
    default: return 'bg-gray-300';
  }
});

const formattedSpeed = computed(() => {
  const speed = downloader.value.progress?.currentSpeed ?? 0;
  if (speed < 1024) return `${speed.toFixed(0)} B/s`;
  if (speed < 1024 * 1024) return `${(speed / 1024).toFixed(1)} KB/s`;
  return `${(speed / 1024 / 1024).toFixed(2)} MB/s`;
});

const formattedETA = computed(() => {
  const eta = downloader.value.progress?.eta ?? 0;
  if (eta < 60) return `${Math.floor(eta)}s`;
  const minutes = Math.floor(eta / 60);
  const seconds = Math.floor(eta % 60);
  return `${minutes}m ${seconds}s`;
});

const formattedEstimatedSize = computed(() => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB']

  let i = 0;
  let decimals = 2;
  let value = downloader.value.progress?.estimatedBytes ?? 0;

  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }

  return `${value.toFixed(decimals)} ${units[i]}`;
});

// Methods
async function updateStorageStats() {
  storageStats.value = await getStorageStats();
}

async function startDownload() {
  try {
    // Load existing tiles for deduplication
    const existingTiles = await loadCacheFromIndexedDB(serviceName.value);

    await downloader.value.start({
      serviceName: serviceName.value,
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      bbox: bbox.value,
      minZoom: minZoom.value,
      maxZoom: maxZoom.value,
      subdomains: ['a', 'b', 'c'],
      existingTiles,
      rateLimit: 2, // Be nice to OSM
      concurrency: 6
    });
  } catch (error) {
    console.error('Failed to start download:', error);
  }
}

// Initialize
onMounted(() => {
  updateStorageStats();
});
</script>

<template>
  <div class="tile-downloader-demo space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Offline Map Tile Downloader</CardTitle>
        <CardDescription>
          Download OpenStreetMap tiles for offline use. Demonstrates pause/resume/cancel, progress tracking, and
          deduplication.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Configuration -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-sm font-medium">Min Zoom</label>
            <input
                v-model.number="minZoom"
                type="number"
                min="0"
                max="18"
                :disabled="isActive"
                class="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label class="text-sm font-medium">Max Zoom</label>
            <input
                v-model.number="maxZoom"
                type="number"
                min="0"
                max="18"
                :disabled="isActive"
                class="w-full px-3 py-2 border rounded-md"
            />
          </div>
        </div>

        <!-- Worker Mode Toggle -->
        <div class="flex items-center gap-2">
          <input
              id="worker-mode"
              v-model="useWorker"
              type="checkbox"
              :disabled="isActive"
              class="rounded"
          />
          <label
              for="worker-mode"
              class="text-sm font-medium"
          >
            Use Web Worker (background download)
          </label>
        </div>

        <!-- Download Info -->
        <div
            v-if="downloader.progress"
            class="space-y-2 p-4 bg-muted rounded-lg"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Status</span>
            <Badge :class="stateColor">{{ downloader.state }}</Badge>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span>Estimated Size</span>
            <span class="font-mono">{{ formattedEstimatedSize }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span>Total Tiles</span>
            <span class="font-mono">{{ downloader.progress.totalTiles }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span>Downloaded</span>
            <span class="font-mono">{{ downloader.progress?.downloaded ?? 0 }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span>Failed</span>
            <span class="font-mono text-red-600">{{ downloader.progress?.failed ?? 0 }}</span>
          </div>
        </div>

        <!-- Progress Bar -->
        <div
            v-if="downloader.progress"
            class="space-y-2"
        >
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium">Progress</span>
            <span class="font-mono">{{ downloader.progressPercent.toFixed(1) }}%</span>
          </div>
          <Progress :model-value="downloader.progressPercent" />

          <div class="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div>
              <span class="font-medium">Speed:</span>
              <span class="ml-2 font-mono">{{ formattedSpeed }}</span>
            </div>
            <div>
              <span class="font-medium">ETA:</span>
              <span class="ml-2 font-mono">{{ formattedETA }}</span>
            </div>
          </div>
        </div>

        <!-- Final Stats -->
        <div
            v-if="downloader.stats"
            class="space-y-2 p-4 bg-green-50 border border-green-200 rounded-lg"
        >
          <h4 class="font-semibold text-green-900">Download Complete</h4>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span class="text-green-700">Success Rate:</span>
              <span class="ml-2 font-mono font-semibold">
                {{ (downloader.stats.successRatio * 100).toFixed(1) }}%
              </span>
            </div>
            <div>
              <span class="text-green-700">Total Size:</span>
              <span class="ml-2 font-mono">
                {{ (downloader.stats.actualSize / 1024 / 1024).toFixed(2) }} MB
              </span>
            </div>
            <div>
              <span class="text-green-700">Download Time:</span>
              <span class="ml-2 font-mono">
                {{ (downloader.stats.downloadTime / 1000).toFixed(1) }}s
              </span>
            </div>
            <div>
              <span class="text-green-700">Avg Speed:</span>
              <span class="ml-2 font-mono">
                {{ (downloader.stats.averageSpeed / 1024).toFixed(1) }} KB/s
              </span>
            </div>
          </div>
        </div>

        <!-- Error -->
        <div
            v-if="downloader.error"
            class="p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <p class="text-sm text-red-900 font-medium">Error</p>
          <p class="text-sm text-red-700">{{ downloader.error }}</p>
        </div>

        <!-- Controls -->
        <div class="flex gap-2">
          <Button
              @click="startDownload"
              :disabled="isActive"
              class="flex-1"
          >
            Start Download
          </Button>
          <Button
              @click="downloader.pause()"
              :disabled="!downloader.isDownloading"
              variant="outline"
          >
            Pause
          </Button>
          <Button
              @click="downloader.resume()"
              :disabled="!downloader.isPaused"
              variant="outline"
          >
            Resume
          </Button>
          <Button
              @click="downloader.cancel()"
              :disabled="!isActive"
              variant="destructive"
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Storage Stats -->
    <Card v-if="storageStats">
      <CardHeader>
        <CardTitle>Storage Statistics</CardTitle>
        <CardDescription>Tiles stored in IndexedDB</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="p-4 bg-muted rounded-lg">
            <p class="text-sm text-muted-foreground">Total Tiles</p>
            <p class="text-2xl font-bold">{{ storageStats.totalTiles }}</p>
          </div>
          <div class="p-4 bg-muted rounded-lg">
            <p class="text-sm text-muted-foreground">Total Size</p>
            <p class="text-2xl font-bold">
              {{ (storageStats.totalSize / 1024 / 1024).toFixed(2) }} MB
            </p>
          </div>
        </div>

        <!-- Per-service stats -->
        <div
            v-if="Object.keys(storageStats.byService).length > 0"
            class="space-y-2"
        >
          <h4 class="text-sm font-medium">By Service</h4>
          <div
              v-for="(stats, service) in storageStats.byService"
              :key="service"
              class="flex items-center justify-between p-3 bg-muted rounded-lg"
          >
            <div>
              <p class="font-medium">{{ service }}</p>
              <p class="text-sm text-muted-foreground">{{ stats.tiles }} tiles</p>
            </div>
            <div class="text-right">
              <p class="font-mono">{{ (stats.size / 1024 / 1024).toFixed(2) }} MB</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<style scoped>
.tile-downloader-demo {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
