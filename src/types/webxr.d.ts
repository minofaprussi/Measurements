interface Navigator {
  xr?: XRSystem;
}

interface XRSystem {
  isSessionSupported(mode: "immersive-ar" | string): Promise<boolean>;
  requestSession(mode: "immersive-ar" | string, options?: XRSessionInit): Promise<XRSession>;
}

interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: { root: Element };
}

interface XRSession extends EventTarget {
  renderState: { baseLayer?: XRWebGLLayer | null };
  requestReferenceSpace(type: "viewer" | "local" | "local-floor" | string): Promise<XRReferenceSpace>;
  requestHitTestSource?(options: { space: XRReferenceSpace }): Promise<XRHitTestSource>;
  updateRenderState(state: { baseLayer?: XRWebGLLayer }): Promise<void> | void;
  requestAnimationFrame(callback: XRFrameRequestCallback): number;
  end(): Promise<void>;
}

type XRFrameRequestCallback = (time: DOMHighResTimeStamp, frame: XRFrame) => void;

interface XRReferenceSpace {}

interface XRHitTestSource {
  cancel(): void;
}

interface XRFrame {
  session: XRSession;
  getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | null;
  getHitTestResults(hitTestSource: XRHitTestSource): XRHitTestResult[];
}

interface XRViewerPose {
  views: XRView[];
}

interface XRView {
  projectionMatrix: Float32Array;
  transform: { inverse: { matrix: Float32Array } };
}

interface XRHitTestResult {
  getPose(referenceSpace: XRReferenceSpace): XRPose | null;
}

interface XRPose {
  transform: {
    position: DOMPointReadOnly;
    matrix: Float32Array;
  };
}

interface XRInputSourceEvent extends Event {
  frame: XRFrame;
  inputSource: {
    targetRaySpace: XRReferenceSpace;
  };
}

declare const XRWebGLLayer: {
  new (session: XRSession, context: WebGLRenderingContext): XRWebGLLayer;
};

interface XRWebGLLayer {
  framebuffer: WebGLFramebuffer | null;
}

interface WebGLRenderingContext {
  makeXRCompatible?: () => Promise<void>;
}

