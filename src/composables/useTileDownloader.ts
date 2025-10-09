/**
 * Vue 3 Composable for Tile Downloader
 *
 * Provides reactive tile download functionality with worker support.
 *
 * @module useTileDownloader
 */

import { ref, computed, onUnmounted, type Ref } from 'vue';
import type {
  TileDownloadConfig,
  TileBlob,
  LiveProgress,
  DownloadStats,
  DownloadState,
  TileDownloadResult
} from '@/services/tileDownloader';
import type { WorkerCommand, WorkerResponse } from '@/workers/tileDownloaderWorker';

/**
 * Download modes
 */
export type DownloadMode = 'main' | 'worker';

/**
 * Composable options
 */
export interface UseTileDownloaderOptions {
  /** Download mode (default: 'main') */
  mode?: DownloadMode;

  /** Callback for each downloaded tile */
  onTileDownloaded?: (tile: TileBlob) => void | Promise<void>;

  /** Callback for progress updates */
  onProgress?: (progress: LiveProgress) => void;

  /** Callback for download completion */
  onComplete?: (stats: DownloadStats) => void;

  /** Callback for errors */
  onError?: (error: Error) => void;
}

/**
 * Composable return type
 */
export interface UseTileDownloaderReturn {
  /** Start download */
  start: (config: TileDownloadConfig) => Promise<void>;

  /** Pause download */
  pause: () => void;

  /** Resume download */
  resume: () => void;

  /** Cancel download */
  cancel: () => void;

  /** Current download state */
  state: Ref<DownloadState>;

  /** Current progress */
  progress: Ref<LiveProgress | null>;

  /** Final statistics (available after completion) */
  stats: Ref<DownloadStats | null>;

  /** Downloaded tiles count */
  downloadedCount: Ref<number>;

  /** Failed tiles count */
  failedCount: Ref<number>;

  /** Download progress percentage (0-100) */
  progressPercent: Ref<number>;

  /** Current download speed (bytes/sec) */
  downloadSpeed: Ref<number>;

  /** Estimated time remaining (seconds) */
  eta: Ref<number>;

  /** Whether download is active */
  isDownloading: Ref<boolean>;

  /** Whether download is paused */
  isPaused: Ref<boolean>;

  /** Whether download is complete */
  isComplete: Ref<boolean>;

  /** Error message if any */
  error: Ref<string | null>;
}

/**
 * Use Tile Downloader composable
 *
 * @param options - Composable options
 * @returns Tile downloader API
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useTileDownloader } from '@/composables/useTileDownloader';
 *
 * const downloader = useTileDownloader({
 *   mode: 'worker',
 *   onTileDownloaded: async (tile) => {
 *     await storeTileInIndexedDB(tile);
 *   },
 *   onProgress: (progress) => {
 *     console.log(`Progress: ${progress.percentComplete * 100}%`);
 *   }
 * });
 *
 * async function downloadOSM() {
 *   await downloader.start({
 *     serviceName: 'osm',
 *     url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
 *     bbox: [13.0, 52.3, 13.8, 52.7],
 *     minZoom: 10,
 *     maxZoom: 14
 *   });
 * }
 * </script>
 * ```
 */
export function useTileDownloader(options: UseTileDownloaderOptions = {}): UseTileDownloaderReturn {
  const mode = options.mode ?? 'main';

  // State
  const state = ref<DownloadState>('idle');
  const progress = ref<LiveProgress | null>(null);
  const stats = ref<DownloadStats | null>(null);
  const error = ref<string | null>(null);

  // Worker state
  let worker: Worker | null = null;
  let downloadId: string | null = null;

  // Main thread state
  let downloadResult: TileDownloadResult;
  let progressInterval: number | null = null;

  // Computed
  const downloadedCount = computed(() => progress.value?.downloaded ?? 0);
  const failedCount = computed(() => progress.value?.failed ?? 0);
  const progressPercent = computed(() => (progress.value?.percentComplete ?? 0) * 100);
  const downloadSpeed = computed(() => progress.value?.currentSpeed ?? 0);
  const eta = computed(() => progress.value?.eta ?? 0);

  const isDownloading = computed(() => state.value === 'downloading');
  const isPaused = computed(() => state.value === 'paused');
  const isComplete = computed(() => state.value === 'completed');

  /**
   * Start download in main thread
   */
  async function startMainThread(config: TileDownloadConfig): Promise<void> {
    const { downloadTiles } = await import('../services/tileDownloader');

    try {
      state.value = 'estimating';
      error.value = null;

      downloadResult = await downloadTiles(config);

      state.value = 'downloading';

      // Start progress monitoring
      progressInterval = window.setInterval(() => {
        const currentProgress = downloadResult.progress;
        console.log('[Composable] Progress update:', currentProgress);
        progress.value = currentProgress;
        if (options.onProgress) {
          options.onProgress(currentProgress);
        }
      }, 1000);

      // Process tiles
      console.log('[Composable] Starting tile iteration...');
      let tileCount = 0;
      for await (const tile of downloadResult.tiles) {
        tileCount++;
        console.log(`[Composable] Received tile #${tileCount}:`, tile.serviceName, tile.z, tile.x, tile.y);
        if (options.onTileDownloaded) {
          await options.onTileDownloaded(tile);
        }
      }
      console.log(`[Composable] Tile iteration complete. Total tiles received: ${tileCount}`);

      // Get final stats
      const finalStats = await downloadResult.stats;
      stats.value = finalStats;
      progress.value = downloadResult.progress;

      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      state.value = 'completed';

      if (options.onComplete) {
        options.onComplete(finalStats);
      }

    } catch (err) {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      state.value = 'failed';
      error.value = err instanceof Error ? err.message : 'Download failed';

      if (options.onError) {
        options.onError(err instanceof Error ? err : new Error('Download failed'));
      }

      throw err;
    }
  }

  /**
   * Start download in worker thread
   */
  async function startWorkerThread(config: TileDownloadConfig): Promise<void> {
    // Create worker
    worker = new Worker(new URL('../workers/tileDownloaderWorker.ts', import.meta.url), {
      type: 'module'
    });

    downloadId = `download-${Date.now()}`;

    return new Promise((resolve, reject) => {
      if (!worker || !downloadId) {
        reject(new Error('Worker initialization failed'));
        return;
      }

      // Handle worker messages
      worker.onmessage = async (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;

        if (response.id !== downloadId) return;
        
        switch (response.type) {
          case 'DOWNLOAD_STARTED':
            state.value = 'downloading';
            break;

          case 'PROGRESS_UPDATE':
            progress.value = response.progress;
            if (options.onProgress) {
              options.onProgress(response.progress);
            }
            break;

          case 'TILE_DOWNLOADED':
            if (options.onTileDownloaded) {
              await options.onTileDownloaded(response.tile);
            }
            break;

          case 'DOWNLOAD_COMPLETE':
            stats.value = response.stats;
            state.value = 'completed';

            if (options.onComplete) {
              options.onComplete(response.stats);
            }

            resolve();
            break;

          case 'DOWNLOAD_ERROR':
            state.value = 'failed';
            error.value = response.error;

            const err = new Error(response.error);
            if (options.onError) {
              options.onError(err);
            }

            reject(err);
            break;

          case 'DOWNLOAD_CANCELLED':
            state.value = 'cancelled';
            resolve();
            break;
        }
      };

      worker.onerror = (event) => {
        state.value = 'failed';
        error.value = event.message;

        const err = new Error(event.message);
        if (options.onError) {
          options.onError(err);
        }

        reject(err);
      };

      // Start download
      state.value = 'estimating';
      error.value = null;

      worker.postMessage({
        type: 'START_DOWNLOAD',
        id: downloadId,
        config: JSON.parse(JSON.stringify(config))
      } as WorkerCommand);
    });
  }

  /**
   * Start download
   */
  async function start(config: TileDownloadConfig): Promise<void> {
    if (mode === 'worker') {
      console.log("[useTileDownloader] Starting as Background Worker")
      return startWorkerThread(config);
    } else {
      console.log("[useTileDownloader] Starting in the main thread")
      return startMainThread(config);
    }
  }

  /**
   * Pause download
   */
  function pause(): void {
    if (mode === 'worker' && worker && downloadId) {
      worker.postMessage({
        type: 'PAUSE_DOWNLOAD',
        id: downloadId
      } as WorkerCommand);
    } else if (downloadResult) {
      downloadResult.pause();
    }
    state.value = 'paused';
  }

  /**
   * Resume download
   */
  function resume(): void {
    if (mode === 'worker' && worker && downloadId) {
      worker.postMessage({
        type: 'RESUME_DOWNLOAD',
        id: downloadId
      } as WorkerCommand);
    } else if (downloadResult) {
      downloadResult.resume();
    }
    state.value = 'downloading';
  }

  /**
   * Cancel download
   */
  function cancel(): void {
    if (mode === 'worker' && worker && downloadId) {
      worker.postMessage({
        type: 'CANCEL_DOWNLOAD',
        id: downloadId
      } as WorkerCommand);

      worker.terminate();
      worker = null;
      downloadId = null;
    } else if (downloadResult) {
      downloadResult.cancel();

      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    }

    state.value = 'cancelled';
  }

  // Cleanup on unmount
  onUnmounted(() => {
    if (worker) {
      cancel();
    }

    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  });

  return {
    start,
    pause,
    resume,
    cancel,
    state,
    progress,
    stats,
    downloadedCount,
    failedCount,
    progressPercent,
    downloadSpeed,
    eta,
    isDownloading,
    isPaused,
    isComplete,
    error
  };
}
