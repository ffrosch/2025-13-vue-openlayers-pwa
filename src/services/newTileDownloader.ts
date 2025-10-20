import { createXYZ } from "ol/tilegrid";
import { get as getProjection, transformExtent } from "ol/proj";
import { containsExtent } from "ol/extent";

/** Must be WGS84 */
type Bbox = [number, number, number, number];

export interface TileRange {
  zoom: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  count: number;
}

interface TileSourceConfig {
  sourceName: string;
  sourceUrl: string;
  sourceSubdomains: string[];
  /** Must be WGS84 */
  bbox: Bbox;
  minZoom: number;
  maxZoom: number;
}

interface TargetArea extends TileSourceConfig {
  crs: string;
}

export interface TileRangeCollection extends TileSourceConfig {
  totalCount: number;
  tileRanges: TileRange[];
}

export function createTileRangeCollection(
  targetArea: TargetArea
): TileRangeCollection {
  const extent = getProjection(targetArea.crs)?.getExtent();

  if (!extent) {
    throw new Error(`Couldn't get the extent for ${targetArea.crs}`);
  } else if (!containsExtent(extent, targetArea.bbox)) {
    throw new Error(
      `The supplied bounding box exceeds the extent of ${targetArea.crs}`
    );
  }

  if (targetArea.sourceUrl.includes("{s}") && !targetArea.sourceSubdomains) {
    throw new Error(
      `Missing Subdomains argument for url ${targetArea.sourceUrl}`
    );
  }

  const tileGrid = createXYZ({
    extent: getProjection(targetArea.crs)?.getExtent(),
    maxZoom: targetArea.maxZoom,
    minZoom: targetArea.minZoom,
  });

  const tileRanges: TileRange[] = [];
  for (let zoom = targetArea.minZoom; zoom <= targetArea.maxZoom; zoom++) {
    const { minX, maxX, minY, maxY } = tileGrid.getTileRangeForExtentAndZ(
      transformExtent(targetArea.bbox, "EPSG:4326", targetArea.crs),
      zoom
    );
    const count = (maxX - minX + 1) * (maxY - minY + 1);
    tileRanges.push({ zoom, minX, maxX, minY, maxY, count });
  }
  const totalCount = tileRanges
    .map((range) => range.count)
    .reduce((previousCount, currentCount) => previousCount + currentCount);

  return {
    totalCount,
    tileRanges,
    bbox: targetArea.bbox,
    minZoom: targetArea.minZoom,
    maxZoom: targetArea.maxZoom,
    sourceName: targetArea.sourceName,
    sourceUrl: targetArea.sourceUrl,
    sourceSubdomains: targetArea.sourceSubdomains,
  };
}

export async function downloadTile(url: string): Promise<Blob> {
  return fetch(url)
    .then((response) => {
      if (response.ok) {
        return response.blob();
      } else {
        return Promise.reject(
          new Error(
            `GET ${response.url} failed with ${response.status} ${response.statusText}`
          )
        );
      }
    })
    .then((blob) => {
      // Verify it's an image
      if (!blob.type.startsWith("image/")) {
        return Promise.reject(new Error("Response is not an image"));
      } else {
        return blob;
      }
    });
}

export async function* downloadTiles(
  tileRangeCollection: TileRangeCollection,
  options: { maxParallelDownloads: number } = { maxParallelDownloads: 6 }
): AsyncGenerator<Blob, void, unknown> {
  const { tileRanges, sourceUrl, sourceSubdomains } = tileRangeCollection;
  const pendingDownloads = new Set<Promise<Blob>>();

  function* generateTileURLs() {
    let currentSubdomainIndex = 0;

    for (let i = 0; i < tileRanges.length; i++) {
      const { minX, maxX, minY, maxY, zoom } = tileRanges[i] as TileRange;
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          currentSubdomainIndex =
            (currentSubdomainIndex + 1) % sourceSubdomains?.length;

          let url = sourceUrl
            .replace("{x}", x.toString())
            .replace("{y}", y.toString())
            // TMS has origin at bottom-left, need to invert
            .replace("{-y}", (Math.pow(2, zoom) - 1 - y).toString())
            .replace("{z}", zoom.toString())
            .replace("{s}", sourceSubdomains[currentSubdomainIndex] ?? "");

          yield url;
        }
      }
    }
  }

  for (const url of generateTileURLs()) {
    const tile = downloadTile(url);
    pendingDownloads.add(tile);
    tile.then(() => pendingDownloads.delete(tile));

    while (pendingDownloads.size >= options.maxParallelDownloads) {
      yield Promise.race(pendingDownloads);
    }
  }

  while (pendingDownloads.size > 0) {
    yield Promise.race(pendingDownloads);
  }
}
