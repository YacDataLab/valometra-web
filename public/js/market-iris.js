import { median } from './format.js';
import { irisAtPoint } from './iris.js';

export const IRIS_TOWN = '38185';
export const MIN_IRIS_SALES = 10;

export function createIrisSummary(contours) {
  const assignments = new WeakMap();
  return rows => {
    const prices = new Map();
    for (const row of rows) {
      if (
        row.code !== IRIS_TOWN ||
        !Number.isFinite(row.lon) ||
        !Number.isFinite(row.lat) ||
        !Number.isFinite(row.price) ||
        !Number.isFinite(row.surface) ||
        row.price <= 0 ||
        row.surface <= 0
      )
        continue;
      if (!assignments.has(row)) assignments.set(row, irisAtPoint([row.lon, row.lat], contours));
      const code = assignments.get(row);
      if (!code) continue;
      if (!prices.has(code)) prices.set(code, []);
      prices.get(code).push(row.price / row.surface);
    }
    return new Map(
      [...prices].map(([code, values]) => [
        code,
        { count: values.length, median: values.length >= MIN_IRIS_SALES ? median(values) : null },
      ]),
    );
  };
}
