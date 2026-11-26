function polygons(geometry) {
  if (!Array.isArray(geometry?.coordinates)) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function validRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const [x, y] = ring[0] ?? [];
  const [lastX, lastY] = ring.at(-1) ?? [];
  return (
    x === lastX &&
    y === lastY &&
    ring.every(
      point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]),
    )
  );
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1];
    const [bx, by] = ring[i];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
}

function orientation([ax, ay], [bx, by], [cx, cy]) {
  return Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
}

function segmentsMeet(a, b, c, d) {
  for (const axis of [0, 1]) {
    if (
      Math.max(a[axis], b[axis]) < Math.min(c[axis], d[axis]) ||
      Math.max(c[axis], d[axis]) < Math.min(a[axis], b[axis])
    )
      return false;
  }
  return (
    orientation(a, b, c) * orientation(a, b, d) <= 0 &&
    orientation(c, d, a) * orientation(c, d, b) <= 0
  );
}

function ringsMeet(a, b) {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segmentsMeet(a[i - 1], a[i], b[j - 1], b[j])) return true;
    }
  }
  return false;
}

function strictlyContains(building, district) {
  const [exterior, ...holes] = district;
  const [footprint, ...courtyards] = building;
  if (!pointInRing(footprint[0], exterior) || holes.some(hole => pointInRing(footprint[0], hole)))
    return false;
  if (building.some(ring => district.some(boundary => ringsMeet(ring, boundary)))) return false;
  // An enclave wholly surrounded by the building will not cross its edges.
  return !holes.some(
    hole =>
      pointInRing(hole[0], footprint) &&
      !courtyards.some(courtyard => pointInRing(hole[0], courtyard)),
  );
}

// All footprint polygons must lie strictly within a single IRIS feature.
export function historicalIris(geometry, contours) {
  if (
    geometry?.crs?.properties?.name !== 'EPSG:2154' ||
    contours?.crs?.properties?.name !== 'urn:ogc:def:crs:EPSG::2154'
  )
    return null;
  const footprint = polygons(geometry);
  if (
    !Array.isArray(contours.features) ||
    !footprint.length ||
    footprint.some(part => !Array.isArray(part) || !part.length || !part.every(validRing))
  )
    return null;
  let result = null;
  for (const feature of contours.features) {
    const districts = polygons(feature.geometry);
    if (
      !footprint.every(part =>
        districts.some(
          district =>
            district.length && district.every(validRing) && strictlyContains(part, district),
        ),
      )
    )
      continue;
    const code = feature.properties?.CODE_IRIS;
    if (result !== null || !/^38185[0-9]{4}$/.test(code ?? '')) return null;
    result = code;
  }
  return result;
}

// Recherche d’un point strictement à l’intérieur d’un seul IRIS sur la carte.
export function irisAtPoint(point, contours) {
  let result = null;
  for (const feature of contours.features) {
    for (const [exterior, ...holes] of polygons(feature.geometry)) {
      if (!pointInRing(point, exterior) || holes.some(hole => pointInRing(point, hole))) continue;
      const onBoundary = [exterior, ...holes].some(ring =>
        ring.slice(1).some((end, i) => segmentsMeet(point, point, ring[i], end)),
      );
      if (onBoundary || result !== null) return null;
      result = feature.properties.CODE_IRIS;
    }
  }
  return result;
}
