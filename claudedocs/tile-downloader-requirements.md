# Tile Downloader Service - Requirements Document

## 1. Overview

### 1.1 Purpose
The Tile Downloader Service (`tileDownloader.ts`) is a standalone TypeScript service that downloads XYZ/TMS/WMTS map tiles from tile servers for offline map usage in Progressive Web Applications. It provides a reliable, controlled, and efficient mechanism for bulk tile downloads with comprehensive error handling and progress monitoring.

### 1.2 Scope
- **In Scope**: Tile download coordination, retry logic, progress tracking, error handling, CRS detection, deduplication, Service Worker integration
- **Out of Scope**: IndexedDB storage implementation (handled by consumer), UI components, authentication mechanisms, tile rendering

### 1.3 Primary Use Case
Pre-download offline maps for PWA applications with support for:
- OpenStreetMap (OSM)
- GeoServer
- QGIS Server
- Satellite imagery services

### 1.4 Scale Requirements
- Support downloads ranging from 100 to 10,000+ tiles
- Handle multi-zoom level operations (e.g., zoom 5-18)
- Operate within browser storage constraints

---

## 2. Technical Requirements

### 2.1 Runtime Environment
- **Platform**: Browser (main thread and Service Worker)
- **TypeScript**: ES2020+ with strict mode
- **Dependencies**:
  - OpenLayers 10+ (tile grid calculations, projection handling)
  - Native Fetch API
  - Web Workers / Service Workers API

### 2.2 OpenLayers Integration
- Use OpenLayers tile grid calculations (do not reinvent)
- Import from: `ol/proj`, `ol/tilegrid`, `ol/extent`
- Compatible with `ol/source/XYZ`
- Support OpenLayers projection system

### 2.3 File Structure
**Single File Service**: All functionality contained in `src/services/tileDownloader.ts`

---

## 3. Functional Requirements

### 3.1 Tile URL Template Support

#### 3.1.1 Placeholder System
Support tile URL templates with the following placeholders:
- `{x}`: Tile X coordinate (required)
- `{y}`: Tile Y coordinate (required)
- `{z}`: Zoom level (required)
- `{s}`: Subdomain rotation (optional)

**Examples**:
```
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
https://tile.server.com/{z}/{x}/{y}.png
https://geoserver.example.com/geoserver/gwc/service/wmts?layer=layer&tilematrixset=EPSG:3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}
```

#### 3.1.2 URL Validation
- **Function**: `validateTileURL(url: string, hasSubdomains: boolean): URLValidation`
- **Validation Rules**:
  - Must contain `{x}`, `{y}`, `{z}` placeholders
  - If `hasSubdomains` is true, must contain `{s}`
  - Warn if URL contains unsupported placeholders
  - Validate URL structure (protocol, domain)
- **Return**: Validation result with warnings for user feedback

#### 3.1.3 Subdomain Rotation
- **Default Subdomains**: `['a', 'b', 'c']` if URL contains `{s}` but none provided
- **Strategy**: Round-robin rotation across all provided subdomains
- **Implementation**: `SubdomainRotator` class

---

### 3.2 Spatial Parameters

#### 3.2.1 Bounding Box Input
- **Format**: `[minLon, minLat, maxLon, maxLat]` (decimal degrees)
- **CRS**: Input assumed to be EPSG:4326 (WGS84), converted to target CRS internally
- **Edge Cases**: Handle antimeridian crossing, polar regions

#### 3.2.2 Zoom Levels
- **Input**: `minZoom` and `maxZoom` (inclusive range)
- **Range**: Typically 0-20, but no hard limits
- **Calculation**: Generate tile ranges for each zoom level in range

---

### 3.3 Coordinate Reference Systems (CRS)

#### 3.3.1 Default CRS
- **Primary**: EPSG:3857 (Web Mercator)
- **Fallback**: EPSG:4326 (WGS84)

#### 3.3.2 CRS Detection via GetCapabilities
- **Function**: `getSupportedCRS(url: string, type?: 'wms'|'wmts'): Promise<CRSCapabilities>`
- **Behavior**:
  - Parse WMS or WMTS GetCapabilities XML
  - Extract supported CRS list from service metadata
  - Auto-detect service type from URL if not specified
  - Prefer EPSG:3857 if available in supported list
  - **Caching**: Cache parsed capabilities to avoid repeated XML parsing
- **Fallback**: If GetCapabilities fails, assume EPSG:3857

#### 3.3.3 Supported Service Types
- **WMS**: Parse WMS GetCapabilities (versions 1.1.1, 1.3.0)
- **WMTS**: Parse WMTS GetCapabilities (version 1.0.0)
- **Auto-detection**: Detect service type from URL keywords

---

### 3.4 Tile Scheme Support

#### 3.4.1 Priority Order
1. **XYZ** (highest priority) - Standard web mapping scheme
2. **TMS** (secondary) - Y-axis inverted
3. **WMTS** (secondary) - OGC standard

#### 3.4.2 Y-Coordinate Handling
- **XYZ**: Y-axis origin at top (standard)
- **TMS**: Y-axis origin at bottom (requires inversion)
- **Function**: `convertYCoordinate(y, z, scheme): number`

---

### 3.5 Download Management

#### 3.5.1 Concurrency Control
- **Default**: 6 simultaneous downloads
- **Maximum**: 6 (hard limit to avoid overwhelming servers)
- **Implementation**: `DownloadQueue` class

#### 3.5.2 Rate Limiting
- **Optional**: Configurable tiles per second limit
- **Algorithm**: Token bucket for smooth rate limiting
- **Implementation**: `RateLimiter` class
- **Purpose**: Respect tile server policies (e.g., OSM: ~2 tiles/sec recommended)

#### 3.5.3 Timeout
- **Duration**: 10 seconds per tile download
- **Implementation**: `AbortController` with timeout

---

### 3.6 Tile Deduplication

#### 3.6.1 Input Parameter
- **Type**: `TileCache` object matching return structure
- **Structure**: `serviceName > z > x > y > Blob | true`
- **Behavior**: Skip tiles that exist in provided cache

#### 3.6.2 Check Logic
```typescript
function checkTileExists(tile: TileCoordinate, cache?: TileCache): boolean {
  return cache?.[tile.serviceName]?.[tile.z]?.[tile.x]?.[tile.y] !== undefined;
}
```

---

### 3.7 Size Estimation

#### 3.7.1 Sampling Strategy
- **Method**: Sample 3 random tiles per zoom level
- **Calculation**: Use median of sample sizes (more robust than mean)
- **Function**: `estimateTileSize(url, ranges, subdomains): Promise<SizeEstimate>`

#### 3.7.2 Sample Selection
- **Strategy**: Random tile selection from each zoom level's tile range
- **Count**: 3 tiles per zoom level
- **Function**: `selectSampleTiles(range: TileRange, count: number): Array<{x, y}>`

#### 3.7.3 Return Format
```typescript
{
  estimatedSize: number;           // Total bytes
  sizeByZoom: Map<number, number>; // Per-zoom median sizes
}
```

---

### 3.8 Error Handling

#### 3.8.1 Error Classification
| Error Type | Retryable | Description |
|------------|-----------|-------------|
| `network` | Yes | Network failure, no response |
| `http` | Depends | HTTP error response (see below) |
| `timeout` | Yes | Request exceeded 10-second timeout |
| `cors` | No | CORS policy violation |
| `parse` | No | Response is not a valid image blob |
| `cancelled` | No | User cancelled download |
| `unknown` | Yes | Unexpected error |

#### 3.8.2 HTTP Status Code Handling
| Status | Retryable | Max Retries | Description |
|--------|-----------|-------------|-------------|
| 400 | No | 0 | Bad request - URL template error |
| 401 | No | 0 | Unauthorized - auth required |
| 403 | No | 0 | Forbidden - access denied |
| 404 | No | 0 | Tile not found - outside coverage |
| 410 | No | 0 | Permanently unavailable |
| 429 | Yes | 3 | Rate limit exceeded |
| 500 | Yes | 5 | Server error |
| 502 | Yes | 5 | Bad gateway |
| 503 | Yes | 5 | Service unavailable |
| 504 | Yes | 5 | Gateway timeout |

#### 3.8.3 Retry Strategy
- **Max Retries**: 5 (default, configurable)
- **Backoff Algorithm**: Exponential - `baseDelay * Math.pow(2, attempt)`
- **Base Delay**: 1000ms (default, configurable)
- **Example Sequence**: 1s → 2s → 4s → 8s → 16s
- **Implementation**: `RetryController` class

#### 3.8.4 Partial Failure Threshold
- **Threshold**: 25% failure rate
- **Behavior**: Abort entire download if >25% of tiles fail
- **Check Frequency**: After minimum 10 tiles attempted (avoid false positives)
- **Implementation**: `FailureMonitor` class

#### 3.8.5 Error Reporting
- **Per-Tile**: Each failed tile recorded with full error details
- **Final Statistics**: Complete error list in `DownloadStats.errors`
- **Failed Tiles**: List of failed tile coordinates in `DownloadStats.failedTiles`

---

### 3.9 Progress Tracking

#### 3.9.1 Real-Time Progress
```typescript
interface LiveProgress {
  state: DownloadState;           // Current state
  downloaded: number;             // Successfully downloaded count
  failed: number;                 // Failed download count
  pending: number;                // Remaining tiles
  retrying: number;               // Currently retrying count
  totalTiles: number;             // Total tiles to download
  downloadedBytes: number;        // Actual downloaded size
  estimatedBytes: number;         // Estimated total size
  percentComplete: number;        // 0.0 - 1.0
  currentSpeed: number;           // Bytes per second
  eta: number;                    // Seconds remaining (estimate)
}
```

#### 3.9.2 Access Pattern
- **Read-Only Snapshot**: `progress` property returns current state snapshot
- **No Callbacks**: Consumer polls snapshot as needed
- **Thread-Safe**: Atomic updates via `ProgressTracker` class

---

### 3.10 Download Control

#### 3.10.1 State Machine
```
IDLE → ESTIMATING → DOWNLOADING ⇄ PAUSED
                     ↓
                   COMPLETED / FAILED / CANCELLED
```

#### 3.10.2 Control Methods

**Pause**
- **Behavior**: Stop dequeuing new downloads
- **In-Flight**: Allow current downloads to complete
- **State**: DOWNLOADING → PAUSED
- **Implementation**: `DownloadController.pause()`

**Resume**
- **Behavior**: Resume dequeuing from where left off
- **State**: PAUSED → DOWNLOADING
- **Implementation**: `DownloadController.resume()`

**Cancel**
- **Behavior**: Abort all in-flight requests immediately
- **State**: Any → CANCELLED
- **Cleanup**: AbortController.abort() on all active fetches
- **Implementation**: `DownloadController.cancel()`

#### 3.10.3 AsyncIterable Behavior
- **Pause**: Iterator waits until resumed
- **Cancel**: Iterator terminates immediately
- **Memory**: Stream tiles to consumer, do not accumulate

---

### 3.11 Return Format

#### 3.11.1 Tile Blob Structure
```typescript
interface TileBlob {
  serviceName: string;  // User-provided service identifier
  z: number;            // Zoom level
  x: number;            // X coordinate
  y: number;            // Y coordinate
  blob: Blob;           // Image data
  size: number;         // Blob size in bytes
}
```

**Nested Object Path**: `serviceName:z:x:y:blob`

#### 3.11.2 Download Result
```typescript
interface TileDownloadResult {
  // Pre-download information
  totalTiles: number;
  estimatedSize: number;
  tilesByZoom: Map<number, number>;

  // Streaming iterator
  tiles: AsyncIterable<TileBlob>;

  // Control functions
  pause: () => void;
  resume: () => void;
  cancel: () => void;

  // Live progress (snapshot)
  progress: LiveProgress;

  // Final statistics (promise)
  stats: Promise<DownloadStats>;
}
```

#### 3.11.3 Final Statistics
```typescript
interface DownloadStats {
  successful: number;         // Count of successful downloads
  failed: number;             // Count of failed downloads
  successRatio: number;       // 0.0 - 1.0
  actualSize: number;         // Total bytes downloaded
  downloadTime: number;       // Total milliseconds
  averageSpeed: number;       // Bytes per second
  errors: TileError[];        // Detailed error list
  failedTiles: TileCoordinate[];  // Failed tile coordinates
}
```

---

## 4. Service Worker Integration

### 4.1 Architecture
- **Dual Implementation**: Main thread + Service Worker versions
- **Background Downloads**: Service Worker handles downloads in background
- **Reliability**: Survive page refreshes and tab closures

### 4.2 Communication Protocol
```typescript
// Main thread → Service Worker
postMessage({
  type: 'START_DOWNLOAD',
  config: TileDownloadConfig
});

// Service Worker → Main thread
postMessage({
  type: 'PROGRESS_UPDATE',
  progress: LiveProgress
});

postMessage({
  type: 'TILE_DOWNLOADED',
  tile: TileBlob
});

postMessage({
  type: 'DOWNLOAD_COMPLETE',
  stats: DownloadStats
});
```

### 4.3 Service Worker Features
- **Background Sync**: Use Background Sync API for reliability
- **Persistence**: Store download state to survive SW restart
- **Notification**: Optional progress notifications
- **Priority**: Low-priority background fetches

### 4.4 Implementation Files
- `src/services/tileDownloader.ts` - Main thread implementation
- `src/workers/tileDownloaderWorker.ts` - Service Worker implementation
- Shared core logic between both implementations

---

## 5. API Specification

### 5.1 Main Function

```typescript
async function downloadTiles(config: TileDownloadConfig): Promise<TileDownloadResult>
```

**Parameters**:
```typescript
interface TileDownloadConfig {
  // Service identification
  serviceName: string;
  url: string;

  // Spatial parameters
  bbox: [minLon: number, minLat: number, maxLon: number, maxLat: number];
  minZoom: number;
  maxZoom: number;

  // Optional parameters
  crs?: string;                   // Default: 'EPSG:3857'
  subdomains?: string[];          // Default: ['a','b','c'] if {s} present
  tileScheme?: 'xyz' | 'tms' | 'wmts';  // Default: 'xyz'

  // Download behavior
  concurrency?: number;           // Default: 6, max: 6
  rateLimit?: number;             // Tiles/second, default: none
  retries?: number;               // Default: 5
  retryBaseDelay?: number;        // Default: 1000ms

  // Deduplication
  existingTiles?: TileCache;

  // WMS/WMTS parameters
  capabilitiesUrl?: string;       // For CRS detection
}
```

### 5.2 Helper Functions

```typescript
// CRS Detection
async function getSupportedCRS(
  capabilitiesUrl: string,
  serviceType?: 'wms' | 'wmts'
): Promise<CRSCapabilities>

// URL Validation
function validateTileURL(
  url: string,
  hasSubdomains: boolean
): URLValidation

// Tile Calculations (internal)
function calculateTileRanges(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
  crs: string,
  tileScheme: 'xyz' | 'tms' | 'wmts'
): TileRange[]
```

---

## 6. Implementation Details

### 6.1 Helper Classes & Functions

#### 6.1.1 Core Classes
- `DownloadController` - State management (pause/resume/cancel)
- `DownloadQueue` - Concurrency and rate limiting
- `ProgressTracker` - Real-time progress monitoring
- `FailureMonitor` - Failure threshold tracking
- `RetryController` - Exponential backoff retry logic
- `RateLimiter` - Token bucket rate limiting
- `SubdomainRotator` - Round-robin subdomain selection

#### 6.1.2 Tile Grid Integration
```typescript
import { get as getProjection } from 'ol/proj';
import TileGrid from 'ol/tilegrid/TileGrid';
import { createXYZ } from 'ol/tilegrid';
import { getTopLeft, getWidth } from 'ol/extent';
import { fromLonLat } from 'ol/proj';

function createTileGrid(crs: string, scheme: 'xyz'|'tms'|'wmts'): TileGrid
function bboxToTileRanges(...): TileRange[]
```

#### 6.1.3 GetCapabilities Parsing
```typescript
async function parseWMSCapabilities(url: string): Promise<WMSCapabilities>
async function parseWMTSCapabilities(url: string): Promise<WMTSCapabilities>
function detectServiceType(url: string): 'wms'|'wmts'|'unknown'
function normalizeCRS(crs: string): string  // Handle various CRS formats
```

### 6.2 Implementation Sequence

#### Phase 1: Core Download Logic
1. URL template parsing & validation
2. Bbox → Tile range calculation (single CRS)
3. Basic download with retries
4. AsyncIterable tile stream

#### Phase 2: Error Handling & Stats
5. Comprehensive error classification
6. Success/failure tracking
7. Size estimation & actual size calculation

#### Phase 3: Advanced Features
8. Multi-CRS support + GetCapabilities
9. Subdomain rotation
10. Capabilities caching

#### Phase 4: Service Worker
11. Service Worker implementation
12. Background Sync integration
13. State persistence

---

## 7. Usage Examples

### 7.1 Basic OSM Download

```typescript
import { downloadTiles } from '@/services/tileDownloader';

const result = await downloadTiles({
  serviceName: 'osm',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  bbox: [13.0, 52.3, 13.8, 52.7],  // Berlin
  minZoom: 10,
  maxZoom: 14,
  subdomains: ['a', 'b', 'c'],
  rateLimit: 2  // Be nice to OSM
});

console.log(`Downloading ${result.totalTiles} tiles (~${result.estimatedSize / 1024 / 1024}MB)`);

// Stream tiles and store
for await (const tile of result.tiles) {
  await storeInIndexedDB(tile);
  console.log(`Progress: ${result.progress.percentComplete * 100}%`);
}

const stats = await result.stats;
console.log(`Success: ${stats.successRatio * 100}%`);
```

### 7.2 GeoServer with GetCapabilities

```typescript
const result = await downloadTiles({
  serviceName: 'geoserver-layer',
  url: 'https://geoserver.example.com/geoserver/gwc/service/wmts?...',
  bbox: [10.0, 50.0, 15.0, 55.0],
  minZoom: 8,
  maxZoom: 12,
  capabilitiesUrl: 'https://geoserver.example.com/geoserver/wms?SERVICE=WMS&REQUEST=GetCapabilities',
  tileScheme: 'wmts'
});
```

### 7.3 With Deduplication

```typescript
// Load existing tiles from IndexedDB
const existingTiles = await loadCacheFromIndexedDB();

const result = await downloadTiles({
  serviceName: 'satellite',
  url: 'https://satellite.example.com/{z}/{x}/{y}.jpg',
  bbox: [5.0, 45.0, 10.0, 50.0],
  minZoom: 5,
  maxZoom: 10,
  existingTiles  // Skip already downloaded tiles
});
```

### 7.4 With Control

```typescript
const result = await downloadTiles({ /* config */ });

// User clicks pause button
document.getElementById('pause').onclick = () => result.pause();
document.getElementById('resume').onclick = () => result.resume();
document.getElementById('cancel').onclick = () => result.cancel();

// Monitor progress
setInterval(() => {
  console.log(result.progress);
}, 1000);
```

---

## 8. Testing Requirements

### 8.1 Unit Tests
- URL template parsing and validation
- Tile coordinate calculations
- Error classification logic
- Retry backoff calculations
- CRS normalization

### 8.2 Integration Tests
- GetCapabilities parsing (WMS, WMTS)
- Tile range calculation with OpenLayers
- AsyncIterator behavior
- Control flow (pause/resume/cancel)

### 8.3 End-to-End Tests
- Complete download workflow
- Failure threshold triggering
- Deduplication logic
- Service Worker communication

### 8.4 Mock Scenarios
- HTTP error responses (404, 500, 503)
- Network failures
- Timeouts
- Rate limiting (429)
- CORS errors

---

## 9. Performance Targets

### 9.1 Throughput
- **Concurrent Downloads**: 6 simultaneous
- **Tile Download**: <500ms per tile (network dependent)
- **Progress Updates**: <100ms overhead

### 9.2 Memory
- **Streaming**: No tile accumulation in memory
- **Peak Usage**: <50MB for 10,000 tile download

### 9.3 Reliability
- **Success Rate**: >90% in normal network conditions
- **Error Recovery**: Automatic retry on transient failures
- **Graceful Degradation**: Continue on partial failures

---

## 10. Dependencies

### 10.1 Required
- **OpenLayers**: ^10.0.0 (tile grid, projections)
- **TypeScript**: ^5.0.0
- **Browser APIs**: Fetch, AbortController, Web Workers

### 10.2 Optional
- **Background Sync API**: For Service Worker reliability
- **Notification API**: For background download notifications

---

## 11. Constraints & Limitations

### 11.1 Technical Constraints
- Browser storage quotas (typically 50-100GB)
- CORS policies (requires CORS-enabled tile servers)
- Rate limiting (respect server policies)
- No authentication handling (must be pre-configured in URL)

### 11.2 Known Limitations
- No automatic tile expiration/refresh
- No bandwidth estimation
- No network type detection (Wi-Fi vs cellular)
- No automatic quality adjustment

---

## 12. Future Enhancements (Out of Scope)

- Bandwidth estimation and adaptive quality
- Automatic retry scheduling for failed tiles
- Delta updates (download only changed tiles)
- Tile compression/decompression
- Multi-server fallback support
- Authentication token handling
- Custom projection support beyond OpenLayers

---

## 13. Success Criteria

### 13.1 Functional
- ✅ Download tiles from OSM, GeoServer, QGIS Server
- ✅ Handle 10,000+ tile downloads reliably
- ✅ Support XYZ, TMS, WMTS tile schemes
- ✅ Accurate CRS detection via GetCapabilities
- ✅ Deduplication prevents redundant downloads
- ✅ Pause/resume/cancel controls work correctly

### 13.2 Quality
- ✅ >90% success rate in normal conditions
- ✅ Comprehensive error handling and reporting
- ✅ No memory leaks during large downloads
- ✅ Background downloads survive page refreshes

### 13.3 Developer Experience
- ✅ Clear TypeScript interfaces
- ✅ Intuitive API design
- ✅ Comprehensive inline documentation
- ✅ Working usage examples

---

## Document Metadata

- **Version**: 1.0
- **Date**: 2025-10-09
- **Author**: Requirements specification from brainstorming session
- **Status**: Ready for Implementation
- **Related Files**:
  - Implementation: `src/services/tileDownloader.ts`
  - Worker: `src/workers/tileDownloaderWorker.ts`
  - Tests: `tests/tileDownloader.test.ts`
