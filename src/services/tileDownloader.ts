/**
 * Tile Downloader Service
 *
 * Downloads XYZ/TMS/WMTS map tiles from tile servers for offline use.
 * Supports multiple CRS, retry logic, progress tracking, and pause/resume/cancel controls.
 *
 * @module tileDownloader
 */

import { get as getProjection } from 'ol/proj';
import TileGrid from 'ol/tilegrid/TileGrid';
import { createXYZ } from 'ol/tilegrid';
import { getTopLeft, getWidth } from 'ol/extent';
import { fromLonLat, transformExtent } from 'ol/proj';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Configuration for tile download operation
 */
export interface TileDownloadConfig {
  /** Service identifier for organizing tiles */
  serviceName: string;

  /** Tile URL template with {x}, {y}, {z}, and optional {s} placeholders */
  url: string;

  /** Bounding box [minLon, minLat, maxLon, maxLat] in EPSG:4326 */
  bbox: [number, number, number, number];

  /** Minimum zoom level (inclusive) */
  minZoom: number;

  /** Maximum zoom level (inclusive) */
  maxZoom: number;

  /** Coordinate reference system (default: 'EPSG:3857') */
  crs?: string;

  /** Subdomain values for {s} placeholder (default: ['a','b','c'] if {s} present) */
  subdomains?: string[];

  /** Tile scheme (default: 'xyz') */
  tileScheme?: 'xyz' | 'tms' | 'wmts';

  /** Maximum concurrent downloads (default: 6, max: 6) */
  concurrency?: number;

  /** Rate limit in tiles per second */
  rateLimit?: number;

  /** Maximum retry attempts (default: 5) */
  retries?: number;

  /** Base delay for exponential backoff in ms (default: 1000) */
  retryBaseDelay?: number;

  /** Existing tiles to skip (deduplication) */
  existingTiles?: TileCache;

  /** GetCapabilities URL for CRS detection */
  capabilitiesUrl?: string;
}

/**
 * Cache structure for tile deduplication
 */
export interface TileCache {
  [serviceName: string]: {
    [z: string]: {
      [x: string]: {
        [y: string]: Blob | true;
      };
    };
  };
}

/**
 * Downloaded tile with metadata
 */
export interface TileBlob {
  serviceName: string;
  z: number;
  x: number;
  y: number;
  blob: Blob;
  size: number;
}

/**
 * Tile coordinate identifier
 */
export interface TileCoordinate {
  serviceName: string;
  z: number;
  x: number;
  y: number;
  url: string;
}

/**
 * Result of tile download operation
 */
export interface TileDownloadResult {
  /** Total number of tiles to download */
  totalTiles: number;

  /** Estimated total size in bytes */
  estimatedSize: number;

  /** Number of tiles per zoom level */
  tilesByZoom: Map<number, number>;

  /** Async iterable for streaming downloaded tiles */
  tiles: AsyncIterable<TileBlob>;

  /** Pause downloads */
  pause: () => void;

  /** Resume downloads */
  resume: () => void;

  /** Cancel downloads */
  cancel: () => void;

  /** Current progress snapshot */
  progress: LiveProgress;

  /** Final statistics (resolves when complete) */
  stats: Promise<DownloadStats>;
}

/**
 * Download state
 */
export enum DownloadState {
  IDLE = 'idle',
  ESTIMATING = 'estimating',
  DOWNLOADING = 'downloading',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * Live progress information
 */
export interface LiveProgress {
  state: DownloadState;
  downloaded: number;
  failed: number;
  pending: number;
  retrying: number;
  totalTiles: number;
  downloadedBytes: number;
  estimatedBytes: number;
  percentComplete: number;
  currentSpeed: number;
  eta: number;
}

/**
 * Final download statistics
 */
export interface DownloadStats {
  successful: number;
  failed: number;
  successRatio: number;
  actualSize: number;
  downloadTime: number;
  averageSpeed: number;
  errors: TileError[];
  failedTiles: TileCoordinate[];
}

/**
 * Error types
 */
export type TileErrorType =
  | 'network'
  | 'http'
  | 'timeout'
  | 'cors'
  | 'parse'
  | 'cancelled'
  | 'unknown';

/**
 * Tile download error
 */
export interface TileError {
  tile: TileCoordinate;
  errorType: TileErrorType;
  httpStatus?: number;
  message: string;
  attempts: number;
  timestamp: number;
  retryable: boolean;
}

/**
 * Tile range for a zoom level
 */
export interface TileRange {
  z: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  count: number;
}

/**
 * URL validation result
 */
export interface URLValidation {
  valid: boolean;
  placeholders: string[];
  missing: string[];
  warnings: string[];
}

/**
 * CRS capabilities from GetCapabilities
 */
export interface CRSCapabilities {
  supportedCRS: string[];
  default: string;
  source: 'capabilities' | 'assumed';
}

/**
 * WMS GetCapabilities structure
 */
interface WMSCapabilities {
  version: string;
  supportedCRS: string[];
  layers: Array<{
    name: string;
    title: string;
    crs: string[];
    bbox: Record<string, [number, number, number, number]>;
  }>;
}

/**
 * WMTS GetCapabilities structure
 */
interface WMTSCapabilities {
  version: string;
  supportedCRS: string[];
  layers: Array<{
    identifier: string;
    title: string;
    tileMatrixSets: string[];
    formats: string[];
  }>;
  tileMatrixSets: Array<{
    identifier: string;
    crs: string;
    tileMatrices: Array<{
      identifier: string;
      scaleDenominator: number;
      topLeftCorner: [number, number];
      tileWidth: number;
      tileHeight: number;
      matrixWidth: number;
      matrixHeight: number;
    }>;
  }>;
}

// ============================================================================
// HTTP ERROR HANDLING
// ============================================================================

const HTTP_ERROR_HANDLING: Record<number, { retryable: boolean; message: string }> = {
  400: { retryable: false, message: 'Bad request - check URL template' },
  401: { retryable: false, message: 'Unauthorized - authentication required' },
  403: { retryable: false, message: 'Forbidden - access denied' },
  404: { retryable: false, message: 'Tile not found - may be outside coverage' },
  410: { retryable: false, message: 'Tile permanently unavailable' },
  429: { retryable: true, message: 'Rate limit exceeded - will retry' },
  500: { retryable: true, message: 'Server error - will retry' },
  502: { retryable: true, message: 'Bad gateway - will retry' },
  503: { retryable: true, message: 'Service unavailable - will retry' },
  504: { retryable: true, message: 'Gateway timeout - will retry' },
};

const NON_RETRYABLE_HTTP_CODES = [400, 401, 403, 404, 410];

// ============================================================================
// GETCAPABILITIES CACHE
// ============================================================================

const capabilitiesCache = new Map<string, CRSCapabilities>();

// ============================================================================
// URL TEMPLATE PROCESSING
// ============================================================================

/**
 * Parsed URL template structure
 */
interface ParsedTemplate {
  template: string;
  hasX: boolean;
  hasY: boolean;
  hasZ: boolean;
  hasSubdomain: boolean;
}

/**
 * Parse URL template and identify placeholders
 */
function parseURLTemplate(url: string): ParsedTemplate {
  return {
    template: url,
    hasX: url.includes('{x}'),
    hasY: url.includes('{y}'),
    hasZ: url.includes('{z}'),
    hasSubdomain: url.includes('{s}')
  };
}

/**
 * Build tile URL from template and coordinates
 */
function buildTileURL(
  template: string,
  x: number,
  y: number,
  z: number,
  subdomain?: string
): string {
  let url = template
    .replace('{x}', x.toString())
    .replace('{y}', y.toString())
    .replace('{z}', z.toString());

  if (subdomain) {
    url = url.replace('{s}', subdomain);
  }

  return url;
}

/**
 * Validate tile URL template
 */
export function validateTileURL(url: string, hasSubdomains: boolean): URLValidation {
  const parsed = parseURLTemplate(url);
  const placeholders: string[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];

  if (parsed.hasX) placeholders.push('x');
  if (parsed.hasY) placeholders.push('y');
  if (parsed.hasZ) placeholders.push('z');
  if (parsed.hasSubdomain) placeholders.push('s');

  if (!parsed.hasX) missing.push('x');
  if (!parsed.hasY) missing.push('y');
  if (!parsed.hasZ) missing.push('z');

  if (hasSubdomains && !parsed.hasSubdomain) {
    warnings.push('Subdomains provided but {s} placeholder not found in URL');
  }

  if (!hasSubdomains && parsed.hasSubdomain) {
    warnings.push('URL contains {s} placeholder but no subdomains provided - will use defaults [a,b,c]');
  }

  try {
    new URL(url.replace('{s}', 'a').replace('{x}', '0').replace('{y}', '0').replace('{z}', '0'));
  } catch {
    warnings.push('URL may not be valid - check protocol and domain');
  }

  return {
    valid: missing.length === 0,
    placeholders,
    missing,
    warnings
  };
}

/**
 * Subdomain rotator for round-robin selection
 */
class SubdomainRotator {
  private subdomains: string[];
  private index = 0;

  constructor(subdomains: string[]) {
    this.subdomains = subdomains.length > 0 ? subdomains : ['a', 'b', 'c'];
  }

  next(): string {
    const subdomain = this.subdomains[this.index];
    this.index = (this.index + 1) % this.subdomains.length;
    return subdomain;
  }

  hasSubdomains(): boolean {
    return this.subdomains.length > 0;
  }
}

// ============================================================================
// TILE GRID CALCULATIONS
// ============================================================================

/**
 * Create tile grid for given CRS and scheme
 */
function createTileGrid(crs: string, tileScheme: 'xyz' | 'tms' | 'wmts'): TileGrid {
  const projection = getProjection(crs);

  if (!projection) {
    throw new Error(`Unknown projection: ${crs}`);
  }

  // For Web Mercator and similar, use standard XYZ grid
  if (tileScheme === 'xyz' || tileScheme === 'tms') {
    return createXYZ({
      extent: projection.getExtent(),
      tileSize: 256
    });
  }

  // WMTS uses same grid as XYZ
  return createXYZ({
    extent: projection.getExtent(),
    tileSize: 256
  });
}

/**
 * Convert Y coordinate for TMS (inverted Y-axis)
 */
function convertYCoordinate(y: number, z: number, tileScheme: 'xyz' | 'tms' | 'wmts'): number {
  if (tileScheme === 'tms') {
    // TMS has origin at bottom-left, need to invert
    const numTiles = Math.pow(2, z);
    return numTiles - 1 - y;
  }
  return y;
}

/**
 * Calculate tile ranges for all zoom levels
 */
function bboxToTileRanges(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
  tileGrid: TileGrid,
  crs: string,
  tileScheme: 'xyz' | 'tms' | 'wmts'
): TileRange[] {
  // Transform bbox from EPSG:4326 to target CRS
  const transformedExtent = transformExtent(bbox, 'EPSG:4326', crs);

  const ranges: TileRange[] = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const tileRange = tileGrid.getTileRangeForExtentAndZ(transformedExtent, z);

    const minX = tileRange.minX;
    const maxX = tileRange.maxX;
    const minY = tileRange.minY;
    const maxY = tileRange.maxY;

    const count = (maxX - minX + 1) * (maxY - minY + 1);

    ranges.push({
      z,
      minX,
      maxX,
      minY,
      maxY,
      count
    });
  }

  return ranges;
}

/**
 * Generate all tile coordinates from ranges
 */
function generateTileCoordinates(
  range: TileRange,
  serviceName: string,
  urlTemplate: string,
  subdomainRotator: SubdomainRotator,
  tileScheme: 'xyz' | 'tms' | 'wmts'
): TileCoordinate[] {
  const tiles: TileCoordinate[] = [];

  for (let x = range.minX; x <= range.maxX; x++) {
    for (let y = range.minY; y <= range.maxY; y++) {
      const actualY = convertYCoordinate(y, range.z, tileScheme);
      const subdomain = subdomainRotator.hasSubdomains() ? subdomainRotator.next() : undefined;
      const url = buildTileURL(urlTemplate, x, actualY, range.z, subdomain);

      tiles.push({
        serviceName,
        z: range.z,
        x,
        y: actualY,
        url
      });
    }
  }

  return tiles;
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

/**
 * Check if tile exists in cache
 */
function checkTileExists(tile: TileCoordinate, cache?: TileCache): boolean {
  if (!cache) return false;
  return cache?.[tile.serviceName]?.[tile.z]?.[tile.x]?.[tile.y] !== undefined;
}

/**
 * Filter out existing tiles
 */
function filterExistingTiles(tiles: TileCoordinate[], cache?: TileCache): TileCoordinate[] {
  if (!cache) return tiles;
  return tiles.filter(tile => !checkTileExists(tile, cache));
}

// ============================================================================
// SIZE ESTIMATION
// ============================================================================

/**
 * Select random sample tiles from range
 */
function selectSampleTiles(range: TileRange, count: number = 3): Array<{ x: number; y: number }> {
  const samples: Array<{ x: number; y: number }> = [];
  const availableX = range.maxX - range.minX + 1;
  const availableY = range.maxY - range.minY + 1;

  // If range is smaller than sample count, sample all tiles
  const sampleCount = Math.min(count, availableX * availableY);

  for (let i = 0; i < sampleCount; i++) {
    const x = range.minX + Math.floor(Math.random() * availableX);
    const y = range.minY + Math.floor(Math.random() * availableY);
    samples.push({ x, y });
  }

  return samples;
}

/**
 * Download single sample tile
 */
async function downloadSampleTile(url: string, timeout: number = 5000): Promise<{ blob: Blob; size: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    return { blob, size: blob.size };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sample tile sizes for all zoom levels
 */
async function sampleTileSizes(
  urlTemplate: string,
  ranges: TileRange[],
  subdomainRotator: SubdomainRotator,
  tileScheme: 'xyz' | 'tms' | 'wmts'
): Promise<Map<number, number>> {
  const sizeByZoom = new Map<number, number>();

  for (const range of ranges) {
    const samples = selectSampleTiles(range, 3);
    const sizes: number[] = [];

    for (const sample of samples) {
      try {
        const actualY = convertYCoordinate(sample.y, range.z, tileScheme);
        const subdomain = subdomainRotator.hasSubdomains() ? subdomainRotator.next() : undefined;
        const url = buildTileURL(urlTemplate, sample.x, actualY, range.z, subdomain);

        const { size } = await downloadSampleTile(url);
        sizes.push(size);
      } catch (error) {
        console.warn(`Failed to sample tile at z=${range.z}:`, error);
      }
    }

    if (sizes.length > 0) {
      // Calculate median
      sizes.sort((a, b) => a - b);
      const median = sizes[Math.floor(sizes.length / 2)] as number;
      sizeByZoom.set(range.z, median);
    } else {
      // Fallback: estimate 15KB per tile
      sizeByZoom.set(range.z, 15 * 1024);
    }
  }

  return sizeByZoom;
}

/**
 * Estimate total download size
 */
async function estimateTileSize(
  urlTemplate: string,
  ranges: TileRange[],
  subdomainRotator: SubdomainRotator,
  tileScheme: 'xyz' | 'tms' | 'wmts'
): Promise<{ estimatedSize: number; sizeByZoom: Map<number, number> }> {
  const sizeByZoom = await sampleTileSizes(urlTemplate, ranges, subdomainRotator, tileScheme);

  let estimatedSize = 0;
  for (const range of ranges) {
    const tileSize = sizeByZoom.get(range.z) ?? 15 * 1024;
    estimatedSize += tileSize * range.count;
  }

  return { estimatedSize, sizeByZoom };
}

// ============================================================================
// GETCAPABILITIES PARSING
// ============================================================================

/**
 * Normalize CRS identifier
 */
function normalizeCRS(crs: string): string {
  // Handle various formats: EPSG:3857, urn:ogc:def:crs:EPSG::3857, etc.
  const match = crs.match(/EPSG[:\s]*(\d+)/i);
  return match ? `EPSG:${match[1]}` : crs;
}

/**
 * Detect service type from URL
 */
function detectServiceType(url: string): 'wms' | 'wmts' | 'unknown' {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('wms')) return 'wms';
  if (urlLower.includes('wmts')) return 'wmts';
  return 'unknown';
}

/**
 * Parse WMS GetCapabilities response
 */
async function parseWMSCapabilities(url: string): Promise<WMSCapabilities> {
  const capUrl = new URL(url);
  capUrl.searchParams.set('SERVICE', 'WMS');
  capUrl.searchParams.set('REQUEST', 'GetCapabilities');
  capUrl.searchParams.set('VERSION', '1.3.0');

  const response = await fetch(capUrl.toString());
  const xml = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const version = doc.querySelector('WMS_Capabilities, WMT_MS_Capabilities')?.getAttribute('version') ?? '1.3.0';

  const supportedCRS = new Set<string>();
  const layers: WMSCapabilities['layers'] = [];

  doc.querySelectorAll('Layer').forEach(layerEl => {
    const name = layerEl.querySelector('Name')?.textContent ?? '';
    const title = layerEl.querySelector('Title')?.textContent ?? '';

    const crsElements = version.startsWith('1.3')
      ? layerEl.querySelectorAll('CRS')
      : layerEl.querySelectorAll('SRS');

    const layerCRS = Array.from(crsElements).map(el => normalizeCRS(el.textContent ?? ''));
    layerCRS.forEach(crs => supportedCRS.add(crs));

    const bbox: Record<string, [number, number, number, number]> = {};
    layerEl.querySelectorAll('BoundingBox').forEach(bboxEl => {
      const crs = normalizeCRS(bboxEl.getAttribute('CRS') || bboxEl.getAttribute('SRS') || 'EPSG:4326');
      const minx = parseFloat(bboxEl.getAttribute('minx') ?? '0');
      const miny = parseFloat(bboxEl.getAttribute('miny') ?? '0');
      const maxx = parseFloat(bboxEl.getAttribute('maxx') ?? '0');
      const maxy = parseFloat(bboxEl.getAttribute('maxy') ?? '0');
      bbox[crs] = [minx, miny, maxx, maxy];
    });

    if (name) {
      layers.push({ name, title, crs: layerCRS, bbox });
    }
  });

  return {
    version,
    supportedCRS: Array.from(supportedCRS),
    layers
  };
}

/**
 * Parse WMTS GetCapabilities response
 */
async function parseWMTSCapabilities(url: string): Promise<WMTSCapabilities> {
  const capUrl = new URL(url);
  capUrl.searchParams.set('SERVICE', 'WMTS');
  capUrl.searchParams.set('REQUEST', 'GetCapabilities');
  capUrl.searchParams.set('VERSION', '1.0.0');

  const response = await fetch(capUrl.toString());
  const xml = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const version = doc.querySelector('Capabilities')?.getAttribute('version') ?? '1.0.0';

  const layers: WMTSCapabilities['layers'] = [];
  doc.querySelectorAll('Layer').forEach(layerEl => {
    const identifier = layerEl.querySelector('Identifier')?.textContent ?? '';
    const title = layerEl.querySelector('Title')?.textContent ?? '';
    const tileMatrixSets = Array.from(
      layerEl.querySelectorAll('TileMatrixSetLink > TileMatrixSet')
    ).map(el => el.textContent ?? '');
    const formats = Array.from(
      layerEl.querySelectorAll('Format')
    ).map(el => el.textContent ?? '');

    if (identifier) {
      layers.push({ identifier, title, tileMatrixSets, formats });
    }
  });

  const tileMatrixSets: WMTSCapabilities['tileMatrixSets'] = [];
  const supportedCRS = new Set<string>();

  doc.querySelectorAll('TileMatrixSet').forEach(setEl => {
    const identifier = setEl.querySelector('Identifier')?.textContent ?? '';
    const crs = normalizeCRS(setEl.querySelector('SupportedCRS')?.textContent ?? 'EPSG:3857');
    supportedCRS.add(crs);

    const tileMatrices = Array.from(setEl.querySelectorAll('TileMatrix')).map(tmEl => ({
      identifier: tmEl.querySelector('Identifier')?.textContent ?? '',
      scaleDenominator: parseFloat(tmEl.querySelector('ScaleDenominator')?.textContent ?? '0'),
      topLeftCorner: tmEl.querySelector('TopLeftCorner')?.textContent
        ?.split(' ').map(parseFloat) as [number, number] ?? [0, 0],
      tileWidth: parseInt(tmEl.querySelector('TileWidth')?.textContent ?? '256'),
      tileHeight: parseInt(tmEl.querySelector('TileHeight')?.textContent ?? '256'),
      matrixWidth: parseInt(tmEl.querySelector('MatrixWidth')?.textContent ?? '1'),
      matrixHeight: parseInt(tmEl.querySelector('MatrixHeight')?.textContent ?? '1')
    }));

    if (identifier) {
      tileMatrixSets.push({ identifier, crs, tileMatrices });
    }
  });

  return {
    version,
    supportedCRS: Array.from(supportedCRS),
    layers,
    tileMatrixSets
  };
}

/**
 * Get supported CRS from GetCapabilities (with caching)
 */
export async function getSupportedCRS(
  capabilitiesUrl: string,
  serviceType?: 'wms' | 'wmts'
): Promise<CRSCapabilities> {
  // Check cache first
  const cacheKey = `${serviceType ?? 'auto'}:${capabilitiesUrl}`;
  if (capabilitiesCache.has(cacheKey)) {
    return capabilitiesCache.get(cacheKey)!;
  }

  try {
    const detectedType = serviceType ?? detectServiceType(capabilitiesUrl);

    let supportedCRS: string[];

    if (detectedType === 'wms') {
      const caps = await parseWMSCapabilities(capabilitiesUrl);
      supportedCRS = caps.supportedCRS;
    } else if (detectedType === 'wmts') {
      const caps = await parseWMTSCapabilities(capabilitiesUrl);
      supportedCRS = caps.supportedCRS;
    } else {
      // Try both
      try {
        const wmsCaps = await parseWMSCapabilities(capabilitiesUrl);
        supportedCRS = wmsCaps.supportedCRS;
      } catch {
        const wmtsCaps = await parseWMTSCapabilities(capabilitiesUrl);
        supportedCRS = wmtsCaps.supportedCRS;
      }
    }

    const defaultCRS = supportedCRS.includes('EPSG:3857')
      ? 'EPSG:3857'
      : supportedCRS.includes('EPSG:4326')
        ? 'EPSG:4326'
        : supportedCRS[0];

    const result: CRSCapabilities = {
      supportedCRS,
      default: defaultCRS,
      source: 'capabilities'
    };

    // Cache the result
    capabilitiesCache.set(cacheKey, result);

    return result;

  } catch (error) {
    console.warn('Failed to fetch capabilities, assuming Web Mercator:', error);

    const fallback: CRSCapabilities = {
      supportedCRS: ['EPSG:3857', 'EPSG:4326'],
      default: 'EPSG:3857',
      source: 'assumed'
    };

    capabilitiesCache.set(cacheKey, fallback);

    return fallback;
  }
}

// ============================================================================
// ERROR HANDLING & RETRY LOGIC
// ============================================================================

/**
 * Classify error type
 */
function classifyError(error: unknown, response?: Response): Omit<TileError, 'tile' | 'attempts' | 'timestamp'> {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      errorType: 'network',
      message: 'Network failure - no response received',
      retryable: true
    };
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      errorType: 'timeout',
      message: 'Request timed out after 10 seconds',
      retryable: true
    };
  }

  if (response && !response.ok) {
    const config = HTTP_ERROR_HANDLING[response.status];
    return {
      errorType: 'http',
      httpStatus: response.status,
      message: config?.message ?? `HTTP ${response.status}`,
      retryable: config?.retryable ?? true
    };
  }

  if (error instanceof Error && error.message.includes('CORS')) {
    return {
      errorType: 'cors',
      message: 'CORS policy violation',
      retryable: false
    };
  }

  return {
    errorType: 'unknown',
    message: error instanceof Error ? error.message : 'Unknown error',
    retryable: true
  };
}

/**
 * Retry controller with exponential backoff
 */
class RetryController {
  constructor(
    private maxRetries: number,
    private baseDelay: number
  ) {}

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    tile: TileCoordinate
  ): Promise<{ success: true; result: T } | { success: false; error: TileError }> {
    let lastError: Omit<TileError, 'tile' | 'attempts' | 'timestamp'> | null = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const result = await fn();
        return { success: true, result };
      } catch (error) {
        const errorInfo = classifyError(error);
        lastError = errorInfo;

        if (!errorInfo.retryable || attempt >= this.maxRetries) {
          break;
        }

        const delay = this.getBackoffDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));

        attempt++;
      }
    }

    return {
      success: false,
      error: {
        ...lastError!,
        tile,
        attempts: attempt,
        timestamp: Date.now()
      }
    };
  }

  private getBackoffDelay(attempt: number): number {
    return this.baseDelay * Math.pow(2, attempt);
  }
}

// ============================================================================
// DOWNLOAD QUEUE & RATE LIMITING
// ============================================================================

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
  private lastAcquire: number = Date.now();

  constructor(private tilesPerSecond: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    const minInterval = 1000 / this.tilesPerSecond;
    const elapsed = now - this.lastAcquire;

    if (elapsed < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - elapsed));
    }

    this.lastAcquire = Date.now();
  }
}

/**
 * Download queue with concurrency and rate limiting
 */
class DownloadQueue {
  private queue: TileCoordinate[] = [];
  private paused: boolean = false;
  private rateLimiter: RateLimiter | null = null;

  constructor(
    public readonly concurrency: number,
    rateLimit?: number
  ) {
    if (rateLimit) {
      this.rateLimiter = new RateLimiter(rateLimit);
    }
  }

  enqueue(tile: TileCoordinate): void {
    this.queue.push(tile);
  }

  async dequeue(): Promise<TileCoordinate | null> {
    // Wait while paused
    while (this.paused) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return this.queue.shift() ?? null;
  }

  async acquireRateLimit(): Promise<void> {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  clear(): void {
    this.queue = [];
  }

  get pending(): number {
    return this.queue.length;
  }
}

// ============================================================================
// CONTROL FLOW (PAUSE/RESUME/CANCEL)
// ============================================================================

/**
 * Download controller for pause/resume/cancel
 */
class DownloadController {
  private state: DownloadState = DownloadState.IDLE;
  private abortController: AbortController = new AbortController();
  private listeners: Map<string, Set<() => void>> = new Map();

  pause(): void {
    if (this.state !== DownloadState.DOWNLOADING) {
      throw new Error(`Cannot pause from state: ${this.state}`);
    }
    this.state = DownloadState.PAUSED;
    this.emit('pause');
  }

  resume(): void {
    if (this.state !== DownloadState.PAUSED) {
      throw new Error(`Cannot resume from state: ${this.state}`);
    }
    this.state = DownloadState.DOWNLOADING;
    this.emit('resume');
  }

  cancel(): void {
    if (this.state === DownloadState.COMPLETED || this.state === DownloadState.CANCELLED) {
      return;
    }

    this.state = DownloadState.CANCELLED;
    this.abortController.abort();
    this.emit('cancel');
  }

  setState(state: DownloadState): void {
    this.state = state;
    this.emit('stateChange');
  }

  getState(): DownloadState {
    return this.state;
  }

  shouldContinue(): boolean {
    return this.state === DownloadState.DOWNLOADING;
  }

  isPaused(): boolean {
    return this.state === DownloadState.PAUSED;
  }

  isCancelled(): boolean {
    return this.state === DownloadState.CANCELLED;
  }

  on(event: 'pause' | 'resume' | 'cancel' | 'stateChange', callback: () => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: () => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string): void {
    this.listeners.get(event)?.forEach(cb => cb());
    if (event !== 'stateChange') {
      this.listeners.get('stateChange')?.forEach(cb => cb());
    }
  }

  getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Progress tracker with real-time metrics
 */
class ProgressTracker {
  private progress: LiveProgress;
  private startTime: number;
  private lastUpdateTime: number;
  private downloadedSinceLastUpdate: number = 0;

  constructor(totalTiles: number, estimatedBytes: number) {
    this.progress = {
      state: DownloadState.DOWNLOADING,
      downloaded: 0,
      failed: 0,
      pending: totalTiles,
      retrying: 0,
      totalTiles,
      downloadedBytes: 0,
      estimatedBytes,
      percentComplete: 0,
      currentSpeed: 0,
      eta: 0
    };
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
  }

  recordSuccess(sizeBytes: number): void {
    this.progress.downloaded++;
    this.progress.pending--;
    this.progress.downloadedBytes += sizeBytes;
    this.downloadedSinceLastUpdate += sizeBytes;
    this.updateMetrics();
  }

  recordFailure(): void {
    this.progress.failed++;
    this.progress.pending--;
    this.updateMetrics();
  }

  setState(state: DownloadState): void {
    this.progress.state = state;
  }

  private updateMetrics(): void {
    const now = Date.now();
    const timeSinceUpdate = (now - this.lastUpdateTime) / 1000;

    // Calculate current speed (smoothed)
    if (timeSinceUpdate > 0.5) {
      this.progress.currentSpeed = this.downloadedSinceLastUpdate / timeSinceUpdate;
      this.downloadedSinceLastUpdate = 0;
      this.lastUpdateTime = now;
    }

    // Calculate percent complete
    this.progress.percentComplete =
      (this.progress.downloaded + this.progress.failed) / this.progress.totalTiles;

    // Estimate time remaining
    if (this.progress.currentSpeed > 0) {
      const remaining = this.progress.estimatedBytes - this.progress.downloadedBytes;
      this.progress.eta = remaining / this.progress.currentSpeed;
    }
  }

  getSnapshot(): LiveProgress {
    return { ...this.progress };
  }
}

// ============================================================================
// FAILURE MONITORING
// ============================================================================

/**
 * Failure monitor for abort threshold
 */
class FailureMonitor {
  private total: number = 0;
  private failed: number = 0;

  constructor(private threshold: number) {}

  recordAttempt(success: boolean): void {
    this.total++;
    if (!success) this.failed++;
  }

  get failureRatio(): number {
    return this.total > 0 ? this.failed / this.total : 0;
  }

  shouldAbort(): boolean {
    if (this.total < 10) return false;
    return this.failureRatio > this.threshold;
  }
}

// ============================================================================
// TILE DOWNLOAD
// ============================================================================

/**
 * Download single tile
 */
async function downloadTile(url: string, abortSignal: AbortSignal): Promise<Blob> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  // Combine timeout and external abort signals
  const combinedSignal = abortSignal.aborted ? abortSignal : controller.signal;

  try {
    const response = await fetch(url, { signal: combinedSignal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();

    // Verify it's an image
    if (!blob.type.startsWith('image/')) {
      throw new Error('Response is not an image');
    }

    return blob;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Download tile with retry logic
 */
async function downloadTileWithRetry(
  tile: TileCoordinate,
  retryController: RetryController,
  abortSignal: AbortSignal
): Promise<TileBlob | null> {
  console.log(`[downloadTileWithRetry] Starting: ${tile.serviceName}:${tile.z}:${tile.x}:${tile.y}, url=${tile.url}`);

  const result = await retryController.executeWithRetry(
    () => downloadTile(tile.url, abortSignal),
    tile
  );

  if (result.success) {
    console.log(`[downloadTileWithRetry] SUCCESS: ${tile.serviceName}:${tile.z}:${tile.x}:${tile.y}, size=${result.result.size}`);
    return {
      serviceName: tile.serviceName,
      z: tile.z,
      x: tile.x,
      y: tile.y,
      blob: result.result,
      size: result.result.size
    };
  }

  console.error(`[downloadTileWithRetry] FAILED: ${tile.serviceName}:${tile.z}:${tile.x}:${tile.y}, error=`, result.error);
  return null;
}

// ============================================================================
// ASYNC TILE ITERATOR
// ============================================================================

/**
 * Create async iterator for streaming tile downloads
 */
async function* createTileIterator(
  tiles: TileCoordinate[],
  controller: DownloadController,
  queue: DownloadQueue,
  retryController: RetryController,
  progressTracker: ProgressTracker,
  failureMonitor: FailureMonitor
): AsyncGenerator<TileBlob, void, undefined> {
  console.log(`[Iterator] GENERATOR FUNCTION CALLED with ${tiles.length} tiles`);

  // Add all tiles to queue
  for (const tile of tiles) {
    queue.enqueue(tile);
  }

  console.log(`[Iterator] All tiles enqueued, queue.pending=${queue.pending}`);

  const activeDownloads = new Set<Promise<TileBlob | null>>();
  const completedDownloads = new Set<Promise<TileBlob | null>>();
  const errors: TileError[] = [];
  const failedTiles: TileCoordinate[] = [];

  controller.setState(DownloadState.DOWNLOADING);

  while (queue.pending > 0 || activeDownloads.size > 0) {
    // Handle pause state
    while (controller.isPaused()) {
      queue.pause();
      progressTracker.setState(DownloadState.PAUSED);

      await new Promise<void>(resolve => {
        const resumeHandler = () => {
          controller.off('resume', resumeHandler);
          resolve();
        };
        controller.on('resume', resumeHandler);
      });

      queue.resume();
      progressTracker.setState(DownloadState.DOWNLOADING);
    }

    // Handle cancellation
    if (controller.isCancelled()) {
      queue.clear();
      progressTracker.setState(DownloadState.CANCELLED);
      return;
    }

    // Check failure threshold
    if (failureMonitor.shouldAbort()) {
      controller.cancel();
      progressTracker.setState(DownloadState.FAILED);
      throw new Error(`Download aborted: failure rate exceeded 25% (${failureMonitor.failureRatio * 100}%)`);
    }

    // Start new downloads up to concurrency limit
    if (activeDownloads.size < queue.concurrency && queue.pending > 0) {
      const tile = await queue.dequeue();
      if (!tile) break;

      console.log(`[Iterator] Starting download: ${tile.serviceName}:${tile.z}:${tile.x}:${tile.y}, active=${activeDownloads.size}, pending=${queue.pending}`);

      // Capture tile in a closure to avoid variable reuse bug
      const downloadPromise = ((currentTile) => {
        return (async () => {
          // Apply rate limiting before download
          await queue.acquireRateLimit();

          return await downloadTileWithRetry(currentTile, retryController, controller.getAbortSignal());
        })()
          .then(result => {
            activeDownloads.delete(downloadPromise);
            console.log(`[Iterator] Download completed (success): ${currentTile.serviceName}:${currentTile.z}:${currentTile.x}:${currentTile.y}, active=${activeDownloads.size}`);
            return result;
          })
          .catch(error => {
            activeDownloads.delete(downloadPromise);
            console.error(`Failed to download tile ${currentTile.serviceName}:${currentTile.z}:${currentTile.x}:${currentTile.y}:`, error);
            return null;
          });
      })(tile);

      activeDownloads.add(downloadPromise);
    }

    console.log("[Iterator] While-Queue")

    // Wait for any download to complete
    if (activeDownloads.size > 0) {
      // Filter out already completed promises to avoid re-yielding
      const pendingDownloads = Array.from(activeDownloads).filter(p => !completedDownloads.has(p));

      if (pendingDownloads.length > 0) {
        console.log(`[Iterator] Waiting for race with ${pendingDownloads.length} pending downloads (${activeDownloads.size} active, ${completedDownloads.size} completed)`);
        const completedPromise = await Promise.race(pendingDownloads.map(p => p.then(result => ({ promise: p, result }))));

        // Mark this promise as completed to avoid re-yielding
        completedDownloads.add(completedPromise.promise);

        if (completedPromise.result) {
          console.log(`[Iterator] Yielding tile: ${completedPromise.result.serviceName}:${completedPromise.result.z}:${completedPromise.result.x}:${completedPromise.result.y}, size=${completedPromise.result.size}`);
          progressTracker.recordSuccess(completedPromise.result.size);
          failureMonitor.recordAttempt(true);
          yield completedPromise.result;
          console.log(`[Iterator] Tile yielded successfully, active=${activeDownloads.size}, completed=${completedDownloads.size}`);
        } else {
          console.log(`[Iterator] Download failed (null result)`);
          progressTracker.recordFailure();
          failureMonitor.recordAttempt(false);
        }
      }
    }
  }

  controller.setState(DownloadState.COMPLETED);
  progressTracker.setState(DownloadState.COMPLETED);
}

/**
 * Collect final download statistics
 */
async function collectStats(
  iterator: AsyncIterable<TileBlob>,
  progressTracker: ProgressTracker,
  errors: TileError[],
  failedTiles: TileCoordinate[],
  startTime: number
): Promise<DownloadStats> {
  // Wait for iterator to complete
  for await (const _ of iterator) {
    // Iterator consumption handled by user
  }

  const progress = progressTracker.getSnapshot();
  const downloadTime = Date.now() - startTime;

  return {
    successful: progress.downloaded,
    failed: progress.failed,
    successRatio: progress.totalTiles > 0 ? progress.downloaded / progress.totalTiles : 0,
    actualSize: progress.downloadedBytes,
    downloadTime,
    averageSpeed: downloadTime > 0 ? progress.downloadedBytes / (downloadTime / 1000) : 0,
    errors,
    failedTiles
  };
}

// ============================================================================
// MAIN DOWNLOAD FUNCTION
// ============================================================================

/**
 * Download tiles from a tile server
 *
 * @param config - Download configuration
 * @returns Download result with async iterable and controls
 *
 * @example
 * ```typescript
 * const result = await downloadTiles({
 *   serviceName: 'osm',
 *   url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
 *   bbox: [13.0, 52.3, 13.8, 52.7], // Berlin
 *   minZoom: 10,
 *   maxZoom: 14,
 *   subdomains: ['a', 'b', 'c']
 * });
 *
 * for await (const tile of result.tiles) {
 *   // Store tile
 *   await storeInIndexedDB(tile);
 * }
 *
 * const stats = await result.stats;
 * console.log(`Success rate: ${stats.successRatio * 100}%`);
 * ```
 */
export async function downloadTiles(config: TileDownloadConfig): Promise<TileDownloadResult> {
  // 1. VALIDATION
  const urlValidation = validateTileURL(config.url, !!config.subdomains?.length);
  if (!urlValidation.valid) {
    throw new Error(`Invalid tile URL: ${urlValidation.missing.join(', ')} placeholders missing`);
  }

  if (urlValidation.warnings.length > 0) {
    console.warn('URL validation warnings:', urlValidation.warnings);
  }

  // 2. CRS & TILE GRID SETUP
  let crs = config.crs ?? 'EPSG:3857';
  if (config.capabilitiesUrl) {
    const crsCaps = await getSupportedCRS(config.capabilitiesUrl);
    crs = crsCaps.default;
  }

  const tileScheme = config.tileScheme ?? 'xyz';
  const tileGrid = createTileGrid(crs, tileScheme);

  // 3. TILE RANGE CALCULATION
  const ranges = bboxToTileRanges(
    config.bbox,
    config.minZoom,
    config.maxZoom,
    tileGrid,
    crs,
    tileScheme
  );

  // 4. SUBDOMAIN ROTATOR
  const parsed = parseURLTemplate(config.url);
  const subdomains = parsed.hasSubdomain
    ? (config.subdomains ?? ['a', 'b', 'c'])
    : [];
  const subdomainRotator = new SubdomainRotator(subdomains);

  // 5. SIZE ESTIMATION
  const sizeEstimate = await estimateTileSize(
    config.url,
    ranges,
    subdomainRotator,
    tileScheme
  );

  // 6. GENERATE TILE COORDINATES
  const allTiles: TileCoordinate[] = [];
  for (const range of ranges) {
    const tiles = generateTileCoordinates(range, config.serviceName, config.url, subdomainRotator, tileScheme);
    allTiles.push(...tiles);
  }
  console.log(`[downloadTiles] Generated ${allTiles.length} total tiles across ${ranges.length} zoom levels`);

  // 7. DEDUPLICATION
  const tilesToDownload = filterExistingTiles(allTiles, config.existingTiles);
  const totalTiles = tilesToDownload.length;
  console.log(`[downloadTiles] After deduplication: ${totalTiles} tiles to download (${allTiles.length - totalTiles} already exist)`);

  if (totalTiles === 0) {
    // All tiles already exist
    return {
      totalTiles: 0,
      estimatedSize: 0,
      tilesByZoom: new Map(),
      tiles: (async function* () {})(),
      pause: () => {},
      resume: () => {},
      cancel: () => {},
      progress: {
        state: DownloadState.COMPLETED,
        downloaded: 0,
        failed: 0,
        pending: 0,
        retrying: 0,
        totalTiles: 0,
        downloadedBytes: 0,
        estimatedBytes: 0,
        percentComplete: 1,
        currentSpeed: 0,
        eta: 0
      },
      stats: Promise.resolve({
        successful: 0,
        failed: 0,
        successRatio: 1,
        actualSize: 0,
        downloadTime: 0,
        averageSpeed: 0,
        errors: [],
        failedTiles: []
      })
    };
  }

  // 8. CALCULATE TILES BY ZOOM
  const tilesByZoom = new Map<number, number>();
  for (const range of ranges) {
    tilesByZoom.set(range.z, range.count);
  }

  // 9. INITIALIZE CONTROLLERS
  const downloadController = new DownloadController();
  const progressTracker = new ProgressTracker(totalTiles, sizeEstimate.estimatedSize);
  const failureMonitor = new FailureMonitor(0.25); // 25% threshold
  const retryController = new RetryController(
    config.retries ?? 5,
    config.retryBaseDelay ?? 1000
  );
  const queue = new DownloadQueue(
    Math.min(config.concurrency ?? 6, 6),
    config.rateLimit
  );

  // 10. CREATE ITERATOR
  const errors: TileError[] = [];
  const failedTiles: TileCoordinate[] = [];
  const startTime = Date.now();

  const iterator = createTileIterator(
    tilesToDownload,
    downloadController,
    queue,
    retryController,
    progressTracker,
    failureMonitor
  );

  // 11. STATS PROMISE (will resolve when download completes)
  // Note: We don't consume the iterator here - that's the caller's responsibility
  // We just wait for the download to complete and return stats
  const statsPromise = new Promise<DownloadStats>((resolve) => {
    // Listen for completion events
    const checkCompletion = setInterval(() => {
      const state = downloadController.getState();
      if (state === DownloadState.COMPLETED || state === DownloadState.CANCELLED || state === DownloadState.FAILED) {
        clearInterval(checkCompletion);

        const progress = progressTracker.getSnapshot();
        const downloadTime = Date.now() - startTime;

        resolve({
          successful: progress.downloaded,
          failed: progress.failed,
          successRatio: progress.totalTiles > 0 ? progress.downloaded / progress.totalTiles : 0,
          actualSize: progress.downloadedBytes,
          downloadTime,
          averageSpeed: downloadTime > 0 ? progress.downloadedBytes / (downloadTime / 1000) : 0,
          errors,
          failedTiles
        });
      }
    }, 100);
  });

  // 12. RETURN RESULT
  return {
    totalTiles,
    estimatedSize: sizeEstimate.estimatedSize,
    tilesByZoom,
    tiles: iterator,
    pause: () => downloadController.pause(),
    resume: () => downloadController.resume(),
    cancel: () => downloadController.cancel(),
    get progress() {
      return progressTracker.getSnapshot();
    },
    stats: statsPromise
  };
}
