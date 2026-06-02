"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Camera, RefreshCw, X } from "lucide-react";
import * as THREE from "three";
import ARSupportMessage from "@/components/ARSupportMessage";
import InstructionPanel from "@/components/InstructionPanel";
import ResultPanel from "@/components/ResultPanel";
import { createMeasurementResult, distanceMeters, vecFromDOMPoint } from "@/lib/measurement";
import { getXRSupportState } from "@/lib/xrSupport";
import type { MeasurementPoint, MeasurementResult, Vec3, XRSupportState } from "@/types/measurement";

const checkingSupport: XRSupportState = {
  checked: false,
  supported: false,
  message: "Checking AR support..."
};

export default function ARMeasurement() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const reticleRef = useRef<THREE.Mesh | null>(null);
  const controllerRef = useRef<THREE.Group | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const hitTestRequestedRef = useRef(false);
  const latestHitPoseRef = useRef<DOMPointReadOnly | null>(null);
  const pointsRef = useRef<MeasurementPoint[]>([]);
  const markerGroupRef = useRef<THREE.Group | null>(null);
  const lineRef = useRef<THREE.Line | null>(null);

  const [support, setSupport] = useState<XRSupportState>(checkingSupport);
  const [fallback, setFallback] = useState(false);
  const [isARActive, setIsARActive] = useState(false);
  const [trackingPoor, setTrackingPoor] = useState(false);
  const [instruction, setInstruction] = useState("Move your phone slowly to detect a surface.");
  const [status, setStatus] = useState("Checking AR support...");
  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [result, setResult] = useState<MeasurementResult | null>(null);

  const canStart = support.checked && support.supported && !isARActive;

  useEffect(() => {
    let mounted = true;
    getXRSupportState().then((state) => {
      if (!mounted) return;
      setSupport(state);
      setStatus(state.message);
    });

    return () => {
      mounted = false;
      cleanupRenderer();
    };
  }, []);

  const selectedPointLabel = useMemo(() => {
    if (points.length === 0) return "No point selected";
    if (points.length === 1) return "First point selected";
    return "Measurement complete";
  }, [points.length]);

  async function startAR() {
    if (typeof navigator === "undefined" || !navigator.xr || !containerRef.current) {
      setFallback(true);
      return;
    }

    try {
      setStatus("Requesting camera and AR session...");
      const session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay", "local-floor"],
        domOverlay: { root: document.body }
      });

      const { renderer, scene, camera, reticle, markerGroup, controller } = createScene(containerRef.current);
      rendererRef.current = renderer;
      sceneRef.current = scene;
      cameraRef.current = camera;
      reticleRef.current = reticle;
      markerGroupRef.current = markerGroup;
      controllerRef.current = controller;

      renderer.xr.setReferenceSpaceType("local");
      await renderer.xr.setSession(session);
      controller.addEventListener("select", handleSelect);
      session.addEventListener("end", handleSessionEnd);
      renderer.setAnimationLoop(renderARFrame);

      resetMeasurement(false);
      setIsARActive(true);
      setInstruction("Move your phone slowly to detect a surface.");
      setStatus("Surface not detected. Move phone slowly.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start AR measurement.");
      cleanupRenderer();
      setIsARActive(false);
    }
  }

  function renderARFrame(_timestamp: number, frame?: XRFrame) {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const reticle = reticleRef.current;
    if (!renderer || !scene || !camera || !reticle) return;

    if (frame) {
      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = renderer.xr.getSession();

      if (session && referenceSpace && !hitTestRequestedRef.current) {
        session.requestReferenceSpace("viewer").then((viewerSpace) => {
          session.requestHitTestSource?.({ space: viewerSpace }).then((source) => {
            hitTestSourceRef.current = source;
          });
        });
        session.addEventListener("end", () => {
          hitTestRequestedRef.current = false;
          hitTestSourceRef.current?.cancel();
          hitTestSourceRef.current = null;
        });
        hitTestRequestedRef.current = true;
      }

      if (referenceSpace && hitTestSourceRef.current) {
        const hits = frame.getHitTestResults(hitTestSourceRef.current);
        const hit = hits[0];
        if (hit) {
          const pose = hit.getPose(referenceSpace);
          if (pose) {
            reticle.visible = true;
            reticle.matrix.fromArray(pose.transform.matrix);
            latestHitPoseRef.current = pose.transform.position;
            setTrackingPoor(false);
            setStatus(pointsRef.current.length === 0 ? "Tap the first point." : "Tap the second point.");
            setInstruction(pointsRef.current.length === 0 ? "Tap the first point." : "Tap the second point.");
          }
        } else {
          reticle.visible = false;
          latestHitPoseRef.current = null;
          setTrackingPoor(true);
          setStatus("Surface not detected. Move phone slowly.");
          setInstruction("Move your phone slowly to detect a surface.");
        }
      }
    }

    renderer.render(scene, camera);
  }

  function handleSelect() {
    const hitPoint = latestHitPoseRef.current;
    if (!hitPoint) {
      setStatus("Surface not detected. Move phone slowly.");
      setTrackingPoor(true);
      return;
    }

    const position = vecFromDOMPoint(hitPoint);
    const nextPoint: MeasurementPoint = {
      id: pointsRef.current.length === 0 ? "start" : "end",
      position,
      createdAt: Date.now()
    };

    const nextPoints = pointsRef.current.length >= 2 ? [nextPoint] : [...pointsRef.current, nextPoint];
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
    drawMarkers(nextPoints);

    if (nextPoints.length === 1) {
      setResult(null);
      setStatus("Tap second point to complete measurement.");
      setInstruction("Tap the second point.");
      return;
    }

    const meters = distanceMeters(nextPoints[0].position, nextPoints[1].position);
    setResult(createMeasurementResult(meters));
    drawLine(nextPoints[0].position, nextPoints[1].position);
    setStatus("Measurement complete.");
    setInstruction("Keep phone steady for better accuracy.");
  }

  function resetMeasurement(updateStatus = true) {
    pointsRef.current = [];
    setPoints([]);
    setResult(null);
    markerGroupRef.current?.clear();
    if (lineRef.current) {
      sceneRef.current?.remove(lineRef.current);
      lineRef.current.geometry.dispose();
      const material = lineRef.current.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
      lineRef.current = null;
    }
    if (updateStatus) {
      setStatus(isARActive ? "Tap the first point." : "Ready to start AR measurement.");
      setInstruction(isARActive ? "Tap the first point." : "Move your phone slowly to detect a surface.");
    }
  }

  function exitAR() {
    rendererRef.current?.xr.getSession()?.end();
    cleanupRenderer();
    setIsARActive(false);
    setStatus("AR session ended.");
    setInstruction("Move your phone slowly to detect a surface.");
  }

  function handleSessionEnd() {
    cleanupRenderer();
    setIsARActive(false);
    setTrackingPoor(false);
  }

  function drawMarkers(nextPoints: MeasurementPoint[]) {
    const group = markerGroupRef.current;
    if (!group) return;
    group.clear();
    nextPoints.forEach((point) => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 24, 24),
        new THREE.MeshBasicMaterial({ color: point.id === "start" ? 0xa77d38 : 0x681e25 })
      );
      marker.position.set(point.position.x, point.position.y, point.position.z);
      group.add(marker);
    });
  }

  function drawLine(start: Vec3, end: Vec3) {
    const scene = sceneRef.current;
    if (!scene) return;
    if (lineRef.current) {
      scene.remove(lineRef.current);
      lineRef.current.geometry.dispose();
    }

    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(end.x, end.y, end.z)
    ]);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 4 });
    const line = new THREE.Line(geometry, material);
    lineRef.current = line;
    scene.add(line);
  }

  function cleanupRenderer() {
    hitTestSourceRef.current?.cancel();
    hitTestSourceRef.current = null;
    hitTestRequestedRef.current = false;
    latestHitPoseRef.current = null;
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
    }
    rendererRef.current = null;
    sceneRef.current = null;
    cameraRef.current = null;
    reticleRef.current = null;
    controllerRef.current = null;
    markerGroupRef.current = null;
    lineRef.current = null;
  }

  if (fallback) {
    return <ImageMeasurementPlaceholder onBack={() => setFallback(false)} />;
  }

  return (
    <main className="app-shell min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-40px)] max-w-6xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col gap-5">
          <header className="border-b border-black/10 pb-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brass)]">WebXR Measurement</p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--charcoal)] sm:text-5xl">AR Measurement</h1>
            <p className="mt-3 text-sm leading-6 text-black/65">
              Measure real-world distance by tapping two valid WebXR hit-test points. This app does not estimate from normal camera pixels.
            </p>
          </header>

          <ARSupportMessage support={support} onFallback={() => setFallback(true)} />
          <InstructionPanel message={instruction} trackingPoor={trackingPoor} />
          <ResultPanel result={result} />

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={startAR}
              disabled={!canStart}
              className="flex items-center justify-center gap-2 bg-[var(--oxblood)] px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              <Camera className="size-4" />
              Start AR Measurement
            </button>
            <button
              type="button"
              onClick={() => resetMeasurement()}
              className="flex items-center justify-center gap-2 border border-black/15 bg-[#fffaf2]/80 px-4 py-3 font-semibold"
            >
              <RefreshCw className="size-4" />
              Reset Measurement
            </button>
            <button
              type="button"
              onClick={exitAR}
              disabled={!isARActive}
              className="flex items-center justify-center gap-2 border border-black/15 bg-[#fffaf2]/80 px-4 py-3 font-semibold disabled:opacity-50"
            >
              <X className="size-4" />
              Exit AR
            </button>
          </div>
        </div>

        <section className="relative min-h-[520px] overflow-hidden border border-black/10 bg-black">
          <div ref={containerRef} className="absolute inset-0" />
          {!isARActive ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
              <div>
                <Camera className="mx-auto mb-4 size-12 text-[var(--brass)]" />
                <h2 className="text-2xl font-semibold">Ready for WebXR AR</h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">{status}</p>
              </div>
            </div>
          ) : null}
          <div className="absolute left-4 top-4 rounded bg-black/65 px-3 py-2 text-sm font-semibold text-white">
            {status}
          </div>
          <div className="absolute bottom-4 left-4 rounded bg-black/65 px-3 py-2 text-sm text-white">
            {selectedPointLabel}
          </div>
        </section>
      </section>
    </main>
  );
}

function ImageMeasurementPlaceholder({ onBack }: { onBack: () => void }) {
  return (
    <main className="app-shell grid min-h-screen place-items-center px-4 py-8">
      <section className="w-full max-w-xl border border-black/10 bg-[#fffaf2]/90 p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brass)]">Fallback</p>
        <h1 className="mt-2 text-3xl font-semibold">Image Measurement</h1>
        <p className="mt-4 text-sm leading-6 text-black/65">
          Image measurement with A4/card reference will be added next.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 inline-flex items-center gap-2 bg-[var(--charcoal)] px-4 py-3 font-semibold text-white"
        >
          Back to AR
          <ArrowRight className="size-4" />
        </button>
      </section>
    </main>
  );
}

function createScene(container: HTMLDivElement) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, container.clientWidth / Math.max(container.clientHeight, 1), 0.01, 20);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.055, 0.07, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xa77d38 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const markerGroup = new THREE.Group();
  scene.add(markerGroup);

  const controller = renderer.xr.getController(0);
  scene.add(controller);

  return { renderer, scene, camera, reticle, markerGroup, controller };
}

