import type { XRSupportState } from "@/types/measurement";

const unsupportedMessage =
  "AR measurement works best on Android Chrome. Your current browser/device does not support WebXR AR.";

export async function getXRSupportState(): Promise<XRSupportState> {
  if (typeof navigator === "undefined" || !navigator.xr) {
    return {
      checked: true,
      supported: false,
      message: unsupportedMessage
    };
  }

  try {
    const supported = await navigator.xr.isSessionSupported("immersive-ar");
    return supported
      ? {
          checked: true,
          supported: true,
          message: "WebXR AR is supported."
        }
      : {
          checked: true,
          supported: false,
          message: unsupportedMessage
        };
  } catch {
    return {
      checked: true,
      supported: false,
      message: unsupportedMessage
    };
  }
}

