function polygons(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function footprintBounds(geometry) {
  const parts = polygons(geometry);
  if (!parts.length) return null;
  const points = parts.flat(2);
  if (!points.length || !points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)))
    return null;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
  }
  return bounds[0] < bounds[2] && bounds[1] < bounds[3] ? bounds : null;
}

function relation(ring, [minX, minY, maxX, maxY]) {
  const x = (minX + maxX) / 2;
  const y = (minY + maxY) / 2;
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1];
    const [bx, by] = ring[i];
    // The bounding boxes can overlap without the edges touching.
    // In that case we conservatively classify the footprint as ambiguous.
    if (
      Math.max(ax, bx) >= minX &&
      Math.min(ax, bx) <= maxX &&
      Math.max(ay, by) >= minY &&
      Math.min(ay, by) <= maxY
    )
      return 'boundary';
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside ? 'inside' : 'outside';
}

// Accept a footprint only when its entire bounding box fits inside one IRIS.
export function historicalIris(geometry, contours) {
  if (
    geometry?.crs?.properties?.name !== 'EPSG:2154' ||
    contours?.crs?.properties?.name !== 'urn:ogc:def:crs:EPSG::2154'
  )
    return null;
  const bounds = footprintBounds(geometry);
  if (!bounds || !Array.isArray(contours.features)) return null;
  let result = null;
  for (const feature of contours.features) {
    for (const [exterior, ...holes] of polygons(feature.geometry)) {
      if (!exterior) continue;
      const outer = relation(exterior, bounds);
      if (outer === 'boundary') return null;
      if (outer !== 'inside') continue;
      const inner = holes.map(ring => relation(ring, bounds));
      if (inner.includes('boundary')) return null;
      if (inner.includes('inside')) continue;
      const code = feature.properties?.CODE_IRIS;
      if (result !== null || !/^38185[0-9]{4}$/.test(code ?? '')) return null;
      result = code;
    }
  }
  return result;
}
