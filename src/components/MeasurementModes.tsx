"use client";

import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Ruler } from "lucide-react";
import ProductionARMeasurement from "@/components/ARMeasurement";

type Mode = "ar" | "image";
type Point = { x: number; y: number };
type DistanceResult = { meters: number; cm: number; inches: number; feet: number };
type Accuracy = "High" | "Medium" | "Low";

type ReferenceKey = "a4" | "creditCard" | "ruler" | "custom";

const references: Record<ReferenceKey, { label: string; widthCm: number; heightCm: number }> = {
  a4: { label: "A4 sheet", widthCm: 21, heightCm: 29.7 },
  creditCard: { label: "Credit card", widthCm: 8.56, heightCm: 5.398 },
  ruler: { label: "Ruler", widthCm: 30, heightCm: 2.5 },
  custom: { label: "Custom size", widthCm: 10, heightCm: 10 }
};

const initialCorners: Point[] = [
  { x: 26, y: 24 },
  { x: 74, y: 24 },
  { x: 74, y: 66 },
  { x: 26, y: 66 }
];

const initialMeasurePoints: Point[] = [
  { x: 36, y: 78 },
  { x: 64, y: 78 }
];

export default function MeasurementModes() {
  const [mode, setMode] = useState<Mode>("ar");

  return (
    <main className="app-shell min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brass)]">Measurement modes</p>
            <h1 className="mt-1 text-3xl font-semibold text-[var(--charcoal)]">Tailor Measurement Workspace</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">
              Measurements require either AR depth/raycast data or a calibrated reference object. Normal photos without a reference are not used for sizing.
            </p>
          </div>
          <div className="grid grid-cols-2 border border-black/10 bg-[#fffaf2]/80">
            <button type="button" onClick={() => setMode("ar")} className={`px-4 py-3 text-sm font-semibold ${mode === "ar" ? "bg-[var(--charcoal)] text-white" : ""}`}>
              AR
            </button>
            <button type="button" onClick={() => setMode("image")} className={`px-4 py-3 text-sm font-semibold ${mode === "image" ? "bg-[var(--charcoal)] text-white" : ""}`}>
              Calibrated Image
            </button>
          </div>
        </header>

        {mode === "ar" ? <ProductionARMeasurement /> : <CalibratedImageMeasurement />}
      </section>
    </main>
  );
}

function CalibratedImageMeasurement() {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [reference, setReference] = useState<ReferenceKey>("a4");
  const [custom, setCustom] = useState({ widthCm: 10, heightCm: 10 });
  const [corners, setCorners] = useState<Point[]>(initialCorners);
  const [measurePoints, setMeasurePoints] = useState<Point[]>(initialMeasurePoints);
  const [drag, setDrag] = useState<{ type: "corner" | "measure"; index: number } | null>(null);
  const [blurScore, setBlurScore] = useState<number | null>(null);

  const referenceSize = reference === "custom" ? { label: "Custom size", ...custom } : references[reference];
  const calibration = useMemo(() => calculateCalibration(corners, referenceSize.widthCm, referenceSize.heightCm), [corners, referenceSize.widthCm, referenceSize.heightCm]);
  const measurement = imageUrl ? calculateImageMeasurement(measurePoints, calibration.pixelsPerCm) : null;
  const warnings = imageUrl ? imageWarnings(calibration, blurScore) : [];
  const accuracy = imageUrl ? accuracyLevel(warnings, calibration) : null;

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const nextUrl = URL.createObjectURL(file);
    setImageUrl(nextUrl);
    setCorners(initialCorners);
    setMeasurePoints(initialMeasurePoints);
    window.setTimeout(() => {
      const image = imageRef.current;
      if (image) setBlurScore(detectBlur(image));
    }, 100);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
    };
    if (drag.type === "corner") {
      setCorners((current) => current.map((item, index) => (index === drag.index ? point : item)));
    } else {
      setMeasurePoints((current) => current.map((item, index) => (index === drag.index ? point : item)));
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-4">
        <div className="border border-black/10 bg-[#fffaf2]/80 p-5">
          <div className="mb-4 flex items-center gap-3">
            <Camera className="size-5 text-[var(--brass)]" />
            <h2 className="text-xl font-semibold">Mode 2: Calibrated Image Measurement</h2>
          </div>
          <ol className="space-y-2 text-sm leading-6 text-black/65">
            <li>1. Place an A4 sheet, credit card, ruler, or custom object on the same plane as the item.</li>
            <li>2. Photograph straight-on with the reference object large and sharp.</li>
            <li>3. Drag the four brass handles to the exact reference corners.</li>
            <li>4. Drag the two dark handles to measure a line or object span.</li>
          </ol>
        </div>

        <div className="border border-black/10 bg-[#fffaf2]/80 p-5">
          <label>
            <span className="label">Reference Object</span>
            <select className="field" value={reference} onChange={(event) => setReference(event.target.value as ReferenceKey)}>
              {Object.entries(references).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </label>
          {reference === "custom" ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <NumberField label="Width (cm)" value={custom.widthCm} onChange={(value) => setCustom((current) => ({ ...current, widthCm: value }))} />
              <NumberField label="Height (cm)" value={custom.heightCm} onChange={(value) => setCustom((current) => ({ ...current, heightCm: value }))} />
            </div>
          ) : null}
          <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4 w-full bg-[var(--oxblood)] px-4 py-3 font-semibold text-white">
            Upload Calibrated Photo
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleImage} />
        </div>

        <div className="border border-black/10 bg-[var(--charcoal)] p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brass)]">Accuracy</p>
          <p className="mt-2 text-2xl font-semibold">{accuracy ?? "Waiting for reference"}</p>
          <div className="mt-3 space-y-2 text-sm text-white/70">
            {warnings.length ? warnings.map((item) => <p key={item}>{item}</p>) : <p>Reference calibrated. Drag handles for manual correction.</p>}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div
          className="relative min-h-[480px] touch-none overflow-hidden border border-black/10 bg-[#fffaf2]/70"
          onPointerMove={onPointerMove}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        >
          {imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imageRef} src={imageUrl} alt="Calibrated measurement" className="h-full min-h-[480px] w-full object-contain" />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points={corners.map((point) => `${point.x},${point.y}`).join(" ")} fill="rgba(167,125,56,0.18)" stroke="#a77d38" strokeWidth="0.45" />
                <line x1={measurePoints[0].x} y1={measurePoints[0].y} x2={measurePoints[1].x} y2={measurePoints[1].y} stroke="#171412" strokeWidth="0.55" />
              </svg>
              {corners.map((point, index) => (
                <Handle key={`corner-${index}`} point={point} label={`${index + 1}`} color="bg-[var(--brass)]" onPointerDown={() => setDrag({ type: "corner", index })} />
              ))}
              {measurePoints.map((point, index) => (
                <Handle key={`measure-${index}`} point={point} label={index === 0 ? "A" : "B"} color="bg-[var(--charcoal)]" onPointerDown={() => setDrag({ type: "measure", index })} />
              ))}
            </>
          ) : (
            <div className="grid min-h-[480px] place-items-center p-8 text-center text-black/55">
              <div>
                <Ruler className="mx-auto mb-3 size-9 text-[var(--brass)]" />
                <p className="font-semibold text-black/70">Upload a photo with a known reference object.</p>
                <p className="mt-2 text-sm">The app will not measure a normal uncalibrated image.</p>
              </div>
            </div>
          )}
        </div>
        <ResultPanel result={measurement ? { meters: measurement.cm / 100, cm: measurement.cm, inches: measurement.inches, feet: measurement.feet } : null} />
      </div>
    </section>
  );
}

function ResultPanel({ result }: { result: DistanceResult | null }) {
  return (
    <div className="grid gap-3 border border-black/10 bg-[#fffaf2]/80 p-5 sm:grid-cols-3">
      <Metric label="Centimeters" value={result ? `${result.cm.toFixed(1)} cm` : "--"} />
      <Metric label="Inches" value={result ? `${result.inches.toFixed(2)} in` : "--"} />
      <Metric label="Feet" value={result ? `${result.feet.toFixed(3)} ft` : "--"} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--brass)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span className="label">{label}</span>
      <input className="field" type="number" step="0.1" min="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Handle({ point, label, color, onPointerDown }: { point: Point; label: string; color: string; onPointerDown: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      className={`absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ${color} text-xs font-bold text-white shadow`}
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
    >
      {label}
    </button>
  );
}

function calculateCalibration(corners: Point[], widthCm: number, heightCm: number) {
  const top = distance2d(corners[0], corners[1]);
  const right = distance2d(corners[1], corners[2]);
  const bottom = distance2d(corners[2], corners[3]);
  const left = distance2d(corners[3], corners[0]);
  const pxPerCmWidth = ((top + bottom) / 2) / Math.max(widthCm, 0.1);
  const pxPerCmHeight = ((left + right) / 2) / Math.max(heightCm, 0.1);
  const pixelsPerCm = (pxPerCmWidth + pxPerCmHeight) / 2;
  const area = polygonArea(corners);
  const aspect = ((top + bottom) / 2) / Math.max((left + right) / 2, 0.1);
  const expectedAspect = widthCm / Math.max(heightCm, 0.1);
  const aspectError = Math.abs(aspect - expectedAspect) / expectedAspect;
  return { pixelsPerCm, area, aspectError };
}

function calculateImageMeasurement(points: Point[], pixelsPerCm: number) {
  if (!pixelsPerCm || pixelsPerCm <= 0) return null;
  const cm = distance2d(points[0], points[1]) / pixelsPerCm;
  return { cm, inches: cm / 2.54, feet: cm / 30.48 };
}

function imageWarnings(calibration: ReturnType<typeof calculateCalibration>, blurScore: number | null) {
  const warnings: string[] = [];
  if (blurScore !== null && blurScore < 80) warnings.push("Blur detected. Retake with a sharper photo.");
  if (calibration.aspectError > 0.28) warnings.push("Steep-angle warning. Photograph the reference more straight-on.");
  if (calibration.area < 180) warnings.push("Small-reference warning. Move closer so the reference object covers more of the image.");
  return warnings;
}

function accuracyLevel(warnings: string[], calibration: ReturnType<typeof calculateCalibration>): Accuracy {
  if (!warnings.length && calibration.aspectError < 0.12 && calibration.area >= 420) return "High";
  if (warnings.length <= 1 && calibration.aspectError < 0.3 && calibration.area >= 180) return "Medium";
  return "Low";
}

function detectBlur(image: HTMLImageElement) {
  if (typeof document === "undefined") return 0;
  const canvas = document.createElement("canvas");
  const width = 240;
  const height = Math.max(1, Math.round((image.naturalHeight / Math.max(image.naturalWidth, 1)) * width));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return 0;
  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = gray(data, y * width + x);
      const value = gray(data, (y - 1) * width + x) + gray(data, (y + 1) * width + x) + gray(data, y * width + x - 1) + gray(data, y * width + x + 1) - center * 4;
      sum += value;
      sumSq += value * value;
      count += 1;
    }
  }
  canvas.width = 0;
  canvas.height = 0;
  const mean = sum / Math.max(count, 1);
  return sumSq / Math.max(count, 1) - mean * mean;
}

function gray(data: Uint8ClampedArray, pixel: number) {
  const index = pixel * 4;
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function distance2d(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3d(a: DOMPointReadOnly, b: DOMPointReadOnly) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function polygonArea(points: Point[]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createDotProgram(gl: WebGLRenderingContext) {
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) throw new Error("Could not initialize AR renderer.");
  gl.shaderSource(vertex, "attribute vec3 position; uniform mat4 projection; uniform mat4 view; void main(){ gl_Position = projection * view * vec4(position, 1.0); gl_PointSize = 22.0; }");
  gl.shaderSource(fragment, "precision mediump float; void main(){ gl_FragColor = vec4(0.65, 0.49, 0.22, 1.0); }");
  gl.compileShader(vertex);
  gl.compileShader(fragment);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return program;
}

function drawPoint(gl: WebGLRenderingContext, program: WebGLProgram, point: DOMPointReadOnly, projection: Float32Array, view: Float32Array) {
  const buffer = gl.createBuffer();
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([point.x, point.y, point.z]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "projection"), false, projection);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "view"), false, view);
  gl.drawArrays(gl.POINTS, 0, 1);
  gl.deleteBuffer(buffer);
}
