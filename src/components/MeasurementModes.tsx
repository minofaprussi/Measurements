"use client";

import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Crosshair, RefreshCw, Ruler, ShieldAlert } from "lucide-react";

type Mode = "ar" | "image";
type Point = { x: number; y: number };
type DistanceResult = { meters: number; cm: number; inches: number; feet: number };
type Accuracy = "High" | "Medium" | "Low";
type GuideStep = "Move slowly" | "Detecting surface" | "Tap start point" | "Tap end point";
type XRSessionLike = any;
type XRReferenceSpaceLike = any;
type XRHitTestSourceLike = any;
type XRFrameLike = any;
type XRViewerPoseLike = any;
type XRHitTestResultLike = any;
type XRInputSourceEventLike = any;
type XRSystemLike = any;

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

        {mode === "ar" ? <ARMeasurement /> : <CalibratedImageMeasurement />}
      </section>
    </main>
  );
}

function ARMeasurement() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<XRSessionLike | null>(null);
  const referenceSpaceRef = useRef<XRReferenceSpaceLike | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSourceLike | null>(null);
  const rendererRef = useRef<{ gl: WebGLRenderingContext; program: WebGLProgram } | null>(null);
  const pointsRef = useRef<DOMPointReadOnly[]>([]);
  const [supported, setSupported] = useState(false);
  const [running, setRunning] = useState(false);
  const [guide, setGuide] = useState<GuideStep>("Move slowly");
  const [warning, setWarning] = useState("Start AR and move slowly so ARCore/ARKit can detect a horizontal or vertical plane.");
  const [result, setResult] = useState<DistanceResult | null>(null);
  const [pointCount, setPointCount] = useState(0);
  const [trackingPoor, setTrackingPoor] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (typeof navigator !== "undefined" && "xr" in navigator) {
      (navigator as Navigator & { xr?: { isSessionSupported: (mode: string) => Promise<boolean> } }).xr
        ?.isSessionSupported("immersive-ar")
        .then((value) => {
          if (mounted) setSupported(value);
        })
        .catch(() => {
          if (mounted) setSupported(false);
        });
    }
    return () => {
      mounted = false;
    };
  }, []);

  async function startAR() {
    if (typeof navigator === "undefined" || !("xr" in navigator)) {
      setWarning("AR is not available in this browser. Use Chrome on Android with ARCore, or an ARKit/WebXR-capable browser on iOS.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const xr = (navigator as Navigator & { xr: XRSystemLike }).xr;
      const session = await xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay", "plane-detection", "local-floor"],
        domOverlay: { root: document.body }
      });
      sessionRef.current = session;
      const gl = canvas.getContext("webgl", { xrCompatible: true } as WebGLContextAttributes) as (WebGLRenderingContext & { makeXRCompatible?: () => Promise<void> }) | null;
      if (!gl) throw new Error("WebGL is required for AR.");
      await gl.makeXRCompatible?.();
      const program = createDotProgram(gl);
      rendererRef.current = { gl, program };
      await session.updateRenderState({ baseLayer: new (window as unknown as { XRWebGLLayer: any }).XRWebGLLayer(session, gl) });
      const referenceSpace = await session.requestReferenceSpace("local-floor").catch(() => session.requestReferenceSpace("local"));
      referenceSpaceRef.current = referenceSpace;
      const viewerSpace = await session.requestReferenceSpace("viewer");
      hitTestSourceRef.current = await session.requestHitTestSource?.({ space: viewerSpace }) ?? null;
      if (!hitTestSourceRef.current) throw new Error("AR hit-test is not available.");

      session.addEventListener("select", handleSelect);
      session.addEventListener("end", () => {
        hitTestSourceRef.current?.cancel();
        hitTestSourceRef.current = null;
        sessionRef.current = null;
        setRunning(false);
        setGuide("Move slowly");
      });
      setRunning(true);
      setGuide("Detecting surface");
      setWarning("Move slowly. Measurement is blocked until the tap raycast hits a valid plane.");
      session.requestAnimationFrame(onXRFrame);
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "Could not start AR.");
    }
  }

  function onXRFrame(_time: DOMHighResTimeStamp, frame: XRFrameLike) {
    const session = sessionRef.current;
    const referenceSpace = referenceSpaceRef.current;
    const hitTestSource = hitTestSourceRef.current;
    if (!session || !referenceSpace || !hitTestSource) return;

    const pose = frame.getViewerPose(referenceSpace);
    const hits = frame.getHitTestResults(hitTestSource);
    const poor = !pose || hits.length === 0;
    setTrackingPoor(poor);
    setGuide(hits.length ? (pointsRef.current.length ? "Tap end point" : "Tap start point") : "Detecting surface");
    setWarning(poor ? "Tracking quality is poor. Move slowly and point at a clear horizontal or vertical surface." : "Plane detected. Tap start point, then tap end point.");
    drawFrame(frame, pose, hits);
    session.requestAnimationFrame(onXRFrame);
  }

  function drawFrame(frame: XRFrameLike, pose: XRViewerPoseLike | null, hits: XRHitTestResultLike[]) {
    const session = sessionRef.current;
    const renderer = rendererRef.current;
    const referenceSpace = referenceSpaceRef.current;
    if (!session || !renderer || !referenceSpace || !pose) return;
    const { gl, program } = renderer;
    const baseLayer = session.renderState.baseLayer;
    if (!baseLayer) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const hitPose = hits[0]?.getPose(referenceSpace);
    if (!hitPose) return;
    const view = pose.views[0];
    const viewport = baseLayer.getViewport(view);
    if (!viewport) return;
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    drawPoint(gl, program, hitPose.transform.position, view.projectionMatrix, view.transform.inverse.matrix);
  }

  function handleSelect(event: XRInputSourceEventLike) {
    const frame = event.frame;
    const referenceSpace = referenceSpaceRef.current;
    if (!referenceSpace) return;
    const inputPose = frame.getPose(event.inputSource.targetRaySpace, referenceSpace);
    if (!inputPose) {
      setWarning("Tracking quality is poor. Retake the tap after moving slowly.");
      return;
    }
    const hitSource = hitTestSourceRef.current;
    if (!hitSource) {
      setWarning("No valid plane raycast is available.");
      return;
    }
    const hit = frame.getHitTestResults(hitSource)[0];
    const hitPose = hit?.getPose(referenceSpace);
    if (!hitPose) {
      setWarning("No valid plane hit. Measurement blocked until a horizontal or vertical plane is detected.");
      return;
    }

    const next = [...pointsRef.current, hitPose.transform.position].slice(-2);
    pointsRef.current = next;
    setPointCount(next.length);
    setGuide(next.length === 1 ? "Tap end point" : "Tap start point");
    if (next.length === 2) {
      const meters = distance3d(next[0], next[1]);
      setResult({ meters, cm: meters * 100, inches: meters * 39.3701, feet: meters * 3.28084 });
      setWarning("Measurement captured from valid AR plane hit-test points.");
    }
  }

  function resetMeasurement() {
    pointsRef.current = [];
    setPointCount(0);
    setResult(null);
    setGuide(running ? "Tap start point" : "Move slowly");
    setWarning(running ? "Measurement reset. Tap a valid plane to start again." : "Start AR and move slowly to detect a surface.");
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4">
        <div className="border border-black/10 bg-[#fffaf2]/80 p-5">
          <div className="mb-4 flex items-center gap-3">
            <Crosshair className="size-5 text-[var(--brass)]" />
            <h2 className="text-xl font-semibold">Mode 1: AR Measurement</h2>
          </div>
          <ol className="space-y-2 text-sm leading-6 text-black/65">
            <li>1. Use an ARCore Android browser or ARKit/WebXR-capable iOS browser.</li>
            <li>2. Move slowly until a horizontal or vertical plane is detected.</li>
            <li>3. Tap the start point, then tap the end point.</li>
            <li>4. If tracking quality is poor, retake the measurement.</li>
          </ol>
        </div>
        <div className="border border-black/10 bg-[var(--charcoal)] p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brass)]">Guide</p>
          <p className="mt-2 text-2xl font-semibold">{guide}</p>
          <p className="mt-3 text-sm leading-6 text-white/70">{warning}</p>
          <p className="mt-2 text-sm text-white/60">Selected points: {pointCount}/2</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative min-h-[440px] overflow-hidden border border-black/10 bg-black">
          <canvas ref={canvasRef} className="h-full min-h-[440px] w-full" />
          <div className="absolute left-4 top-4 rounded bg-black/60 px-3 py-2 text-sm font-semibold text-white">
            {trackingPoor ? "Tracking poor" : running ? "Tracking active" : supported ? "AR ready" : "AR support unknown"}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={startAR} disabled={!supported || running} className="bg-[var(--oxblood)] px-4 py-3 font-semibold text-white disabled:opacity-50">
            Start AR
          </button>
          <button type="button" onClick={resetMeasurement} className="flex items-center justify-center gap-2 border border-black/15 px-4 py-3 font-semibold">
            <RefreshCw className="size-4" />
            Reset
          </button>
          <button type="button" onClick={() => sessionRef.current?.end()} disabled={!running} className="border border-black/15 px-4 py-3 font-semibold disabled:opacity-50">
            Stop AR
          </button>
        </div>
        <ResultPanel result={result} />
      </div>
    </section>
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
