import { geoMercator, geoPath, type GeoPath, type GeoPermissibleObjects } from "d3-geo";
import type { ProvincesGeoJSON } from "./types";

// Fixed decimal precision on every emitted coordinate -- without this, tiny float
// serialization differences between server and client renders (last-digit noise from
// the same math, e.g. 315.9990945012788 vs ...789) trip a React hydration mismatch.
const COORDINATE_PRECISION = 2;

export function buildProjection(geojson: ProvincesGeoJSON, width: number, height: number) {
  const projection = geoMercator().fitSize([width, height], geojson as unknown as GeoPermissibleObjects);
  const path: GeoPath = geoPath(projection).digits(COORDINATE_PRECISION);
  return { projection, path };
}

export function round(n: number): number {
  return Math.round(n * 10 ** COORDINATE_PRECISION) / 10 ** COORDINATE_PRECISION;
}

/** Deterministic spiral layout so repeated renders (and SSR->CSR hydration) never jitter. */
export function spiralOffset(index: number, baseRadiusPx: number): [number, number] {
  const goldenAngle = 137.5 * (Math.PI / 180);
  const angle = index * goldenAngle;
  const radius = baseRadiusPx * Math.sqrt(index + 1);
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}
