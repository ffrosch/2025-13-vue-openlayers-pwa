/**
 * Tile Storage Utilities
 *
 * IndexedDB storage for offline map tiles
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { TileBlob, TileCache } from '../services/tileDownloader';

const DB_NAME = 'tile-storage';
const STORE_NAME = 'tiles';
const DB_VERSION = 1;

export interface TileRecord {
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
