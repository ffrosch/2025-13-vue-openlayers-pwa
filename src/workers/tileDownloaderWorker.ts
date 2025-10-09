/**
 * Tile Downloader Service Worker
 *
 * Background tile download implementation for reliable offline map preparation.
 * Runs in Service Worker context for downloads that survive page refreshes.
 *
 * @module tileDownloaderWorker
 */

import type {
  TileDownloadConfig,
  TileDownloadResult,
  TileBlob,
  DownloadState,
  LiveProgress,
  DownloadStats
} from '../services/tileDownloader';

// ============================================================================
// MESSAGE TYPES
// ============================================================================

/**
 * Messages from main thread to worker
 */
export type WorkerCommand =
  | { type: 'START_DOWNLOAD'; id: string; config: TileDownloadConfig }
  | { type: 'PAUSE_DOWNLOAD'; id: string }
  | { type: 'RESUME_DOWNLOAD'; id: string }
  | { type: 'CANCEL_DOWNLOAD'; id: string }
  | { type: 'GET_PROGRESS'; id: string };

/**
 * Messages from worker to main thread
 */
export type WorkerResponse =
  | { type: 'DOWNLOAD_STARTED'; id: string; totalTiles: number; estimatedSize: number }
  | { type: 'PROGRESS_UPDATE'; id: string; progress: LiveProgress }
  | { type: 'TILE_DOWNLOADED'; id: string; tile: TileBlob }
  | { type: 'DOWNLOAD_COMPLETE'; id: string; stats: DownloadStats }
  | { type: 'DOWNLOAD_ERROR'; id: string; error: string }
  | { type: 'DOWNLOAD_CANCELLED'; id: string };

// ============================================================================
// WORKER STATE
// ============================================================================

/**
 * Active download tracking
 */
interface ActiveDownload {
  id: string;
  config: TileDownloadConfig;
  result: TileDownloadResult | null;
  abortController: AbortController;
  lastProgress: LiveProgress | null;
}

const activeDownloads = new Map<string, ActiveDownload>();

// ============================================================================
// SERVICE WORKER DOWNLOAD WRAPPER
// ============================================================================

/**
 * Start download in Service Worker context
 */
async function startDownload(id: string, config: TileDownloadConfig): Promise<void> {
  // Dynamic import to avoid loading in main thread
  const { downloadTiles } = await import('../services/tileDownloader');

  try {
    const result = await downloadTiles(config);

    // Store active download
    const download: ActiveDownload = {
      id,
      config,
      result,
      abortController: new AbortController(),
      lastProgress: result.progress
    };
    activeDownloads.set(id, download);

    // Notify main thread
    postMessage({
      type: 'DOWNLOAD_STARTED',
      id,
      totalTiles: result.totalTiles,
      estimatedSize: result.estimatedSize
    } as WorkerResponse);

    // Start consuming tiles
    const progressInterval = setInterval(() => {
      const currentProgress = result.progress;
      download.lastProgress = currentProgress;

      postMessage({
        type: 'PROGRESS_UPDATE',
        id,
        progress: currentProgress
      } as WorkerResponse);
    }, 1000); // Update progress every second

    // Process tiles
    try {
      for await (const tile of result.tiles) {
        // Send tile to main thread for storage
        postMessage({
          type: 'TILE_DOWNLOADED',
          id,
          tile
        } as WorkerResponse);
      }

      // Get final stats
      const stats = await result.stats;

      clearInterval(progressInterval);
      activeDownloads.delete(id);

      postMessage({
        type: 'DOWNLOAD_COMPLETE',
        id,
        stats
      } as WorkerResponse);

    } catch (error) {
      clearInterval(progressInterval);
      activeDownloads.delete(id);

      postMessage({
        type: 'DOWNLOAD_ERROR',
        id,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as WorkerResponse);
    }

  } catch (error) {
    activeDownloads.delete(id);

    postMessage({
      type: 'DOWNLOAD_ERROR',
      id,
      error: error instanceof Error ? error.message : 'Failed to initialize download'
    } as WorkerResponse);
  }
}

/**
 * Pause active download
 */
function pauseDownload(id: string): void {
  const download = activeDownloads.get(id);
  if (download?.result) {
    download.result.pause();
  }
}

/**
 * Resume paused download
 */
function resumeDownload(id: string): void {
  const download = activeDownloads.get(id);
  if (download?.result) {
    download.result.resume();
  }
}

/**
 * Cancel active download
 */
function cancelDownload(id: string): void {
  const download = activeDownloads.get(id);
  if (download?.result) {
    download.result.cancel();
    activeDownloads.delete(id);

    postMessage({
      type: 'DOWNLOAD_CANCELLED',
      id
    } as WorkerResponse);
  }
}

/**
 * Get current progress
 */
function getProgress(id: string): void {
  const download = activeDownloads.get(id);
  if (download?.lastProgress) {
    postMessage({
      type: 'PROGRESS_UPDATE',
      id,
      progress: download.lastProgress
    } as WorkerResponse);
  }
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

/**
 * Handle messages from main thread
 */
self.addEventListener('message', (event: MessageEvent<WorkerCommand>) => {
  const command = event.data;

  switch (command.type) {
    case 'START_DOWNLOAD':
      startDownload(command.id, command.config);
      break;

    case 'PAUSE_DOWNLOAD':
      pauseDownload(command.id);
      break;

    case 'RESUME_DOWNLOAD':
      resumeDownload(command.id);
      break;

    case 'CANCEL_DOWNLOAD':
      cancelDownload(command.id);
      break;

    case 'GET_PROGRESS':
      getProgress(command.id);
      break;
  }
});

// ============================================================================
// BACKGROUND SYNC INTEGRATION (Optional)
// ============================================================================

/**
 * Register background sync for failed downloads
 */
// ERROR: self.registration does not exist!
// if ('sync' in self.registration) {
//   self.addEventListener('sync', (event: any) => {
//     if (event.tag.startsWith('tile-download-retry-')) {
//       const downloadId = event.tag.replace('tile-download-retry-', '');

//       event.waitUntil(
//         (async () => {
//           // Retrieve stored download config from IndexedDB
//           // and retry the download
//           console.log(`Background sync retry for download: ${downloadId}`);
//         })()
//       );
//     }
//   });
// }

// Export for TypeScript
export {};
