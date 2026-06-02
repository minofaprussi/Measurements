export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type MeasurementPoint = {
  id: "start" | "end";
  position: Vec3;
  createdAt: number;
};

export type MeasurementResult = {
  meters: number;
  centimeters: number;
  inches: number;
  feet: number;
};

export type XRSupportStatus =
  | "checking"
  | "supported"
  | "unsupported_ios"
  | "unsupported_browser"
  | "insecure_context"
  | "no_navigator_xr"
  | "immersive_ar_not_supported";

export type XRDebugInfo = {
  userAgent: string;
  isSecureContext: boolean;
  navigatorXrExists: boolean;
  immersiveArSupported: boolean | null;
  platform: "android_chrome" | "android_non_chrome" | "ios" | "desktop" | "unknown";
  lastXRErrorMessage?: string;
};

export type XRSupportState =
  | {
      checked: false;
      supported: false;
      status: "checking";
      message: "Checking AR support...";
      debug: XRDebugInfo;
    }
  | {
      checked: true;
      supported: true;
      status: "supported";
      message: "WebXR AR is supported.";
      debug: XRDebugInfo;
    }
  | {
      checked: true;
      supported: false;
      status: Exclude<XRSupportStatus, "checking" | "supported">;
      message: string;
      debug: XRDebugInfo;
    };
