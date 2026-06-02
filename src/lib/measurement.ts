import type { MeasurementResult, Vec3 } from "@/types/measurement";

export function distanceMeters(pointA: Vec3, pointB: Vec3) {
  return Math.sqrt(
    (pointB.x - pointA.x) ** 2 +
      (pointB.y - pointA.y) ** 2 +
      (pointB.z - pointA.z) ** 2
  );
}

export function metersToCm(value: number) {
  return value * 100;
}

export function metersToInches(value: number) {
  return value * 39.3701;
}

export function metersToFeet(value: number) {
  return value * 3.28084;
}

export function createMeasurementResult(meters: number): MeasurementResult {
  return {
    meters,
    centimeters: metersToCm(meters),
    inches: metersToInches(meters),
    feet: metersToFeet(meters)
  };
}

export function vecFromDOMPoint(point: DOMPointReadOnly): Vec3 {
  return {
    x: point.x,
    y: point.y,
    z: point.z
  };
}

