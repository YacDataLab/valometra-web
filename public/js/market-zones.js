import { measure, median, scaleDomain } from './format.js';

export const MIN_ZONE_SALES = 10;
export const ZONE_BANDS = 5;

const hasLocation = row =>
  Number.isFinite(row.lat) &&
  Number.isFinite(row.lon) &&
  Math.abs(row.lat) <= 90 &&
  Math.abs(row.lon) <= 180;

const extent = rows => [
  Math.min(...rows.map(row => row.lon)),
  Math.min(...rows.map(row => row.lat)),
  Math.max(...rows.map(row => row.lon)),
  Math.max(...rows.map(row => row.lat)),
];

function splitZone(rows, bounds, zones, key) {
  // Split along the longest side, keeping coincident parcels in the same zone.
  const width = (bounds[2] - bounds[0]) * Math.cos(((bounds[1] + bounds[3]) * Math.PI) / 360);
  const axes = width >= bounds[3] - bounds[1] ? [0, 1] : [1, 0];
  if (rows.length >= MIN_ZONE_SALES * 4) {
    for (const axis of axes) {
      const coordinate = row => (axis === 0 ? row.lon : row.lat);
      const ordered = [...rows].sort((a, b) => coordinate(a) - coordinate(b));
      let split = 0;
      const middle = ordered.length / 2;
      for (let i = MIN_ZONE_SALES; i <= ordered.length - MIN_ZONE_SALES; i++) {
        if (
          coordinate(ordered[i - 1]) < coordinate(ordered[i]) &&
          (!split || Math.abs(i - middle) < Math.abs(split - middle))
        )
          split = i;
      }
      if (!split) continue;
      const edge = (coordinate(ordered[split - 1]) + coordinate(ordered[split])) / 2;
      const lower = [...bounds],
        upper = [...bounds];
      lower[axis + 2] = edge;
      upper[axis] = edge;
      splitZone(ordered.slice(0, split), lower, zones, key);
      splitZone(ordered.slice(split), upper, zones, key);
      return;
    }
  }
  zones.push({
    bounds,
    values: rows.map(row => measure(row, key)),
  });
}

// A shared edge of positive length is required. A corner touch is not enough.
function areNeighbors([west, south, east, north], [otherWest, otherSouth, otherEast, otherNorth]) {
  return (
    ((east === otherWest || west === otherEast) &&
      Math.max(south, otherSouth) < Math.min(north, otherNorth)) ||
    ((north === otherSouth || south === otherNorth) &&
      Math.max(west, otherWest) < Math.min(east, otherEast))
  );
}

function mergeZones(cells, bands) {
  const remaining = new Set(cells);
  const zones = [];
  for (const origin of cells) {
    if (!remaining.delete(origin)) continue;
    const group = [origin];
    for (const cell of group) {
      for (const candidate of remaining) {
        if (origin.band !== candidate.band || !areNeighbors(cell.bounds, candidate.bounds))
          continue;
        remaining.delete(candidate);
        group.push(candidate);
      }
    }
    const values = group.flatMap(cell => cell.values);
    zones.push({
      name: `Zone ${zones.length + 1}`,
      rectangles: group.map(cell => cell.bounds),
      band: origin.band,
      count: values.length,
      median: origin.band === null ? null : median(values),
    });
  }
  return { zones, bands };
}

export function groupMarketZones(rows, key) {
  const sales = rows.filter(row => {
    const value = measure(row, key);
    return hasLocation(row) && Number.isFinite(value) && value > 0;
  });
  if (!sales.length) return { zones: [], bands: [] };
  const padding = 0.002;
  const bounds = extent(sales).map((value, i) => value + (i < 2 ? -padding : padding));
  const cells = [];
  splitZone(sales, bounds, cells, key);

  const medians = cells
    .filter(cell => cell.values.length >= MIN_ZONE_SALES)
    .map(cell => median(cell.values));
  const domain = scaleDomain(medians);
  const bands =
    domain && domain.lo !== domain.hi
      ? Array.from(
          { length: ZONE_BANDS - 1 },
          (_, i) => domain.lo + ((domain.hi - domain.lo) * (i + 1)) / ZONE_BANDS,
        )
      : [];
  for (const cell of cells) {
    const value = median(cell.values);
    cell.band =
      cell.values.length < MIN_ZONE_SALES ? null : bands.filter(limit => value >= limit).length;
  }
  return mergeZones(cells, bands);
}
