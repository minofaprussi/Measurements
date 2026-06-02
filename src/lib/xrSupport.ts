import type { XRDebugInfo, XRSupportState } from "@/types/measurement";

export function detectPlatform(userAgent: string): XRDebugInfo["platform"] {
  const ua = userAgent.toLowerCase();
  const isAndroid = ua.includes("android");
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isChrome = /chrome|crios/.test(ua) && !ua.includes("edg") && !ua.includes("opr") && !ua.includes("samsungbrowser");

  if (isIOS) return "ios";
  if (isAndroid && isChrome) return "android_chrome";
  if (isAndroid) return "android_non_chrome";
  if (/macintosh|windows|linux/.test(ua)) return "desktop";
  return "unknown";
}

function baseDebug(): XRDebugInfo {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return {
    userAgent,
    isSecureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    navigatorXrExists: typeof navigator !== "undefined" && Boolean(navigator.xr),
    immersiveArSupported: null,
    platform: detectPlatform(userAgent)
  };
}

export async function getXRSupportState(): Promise<XRSupportState> {
  const debug = baseDebug();

  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      checked: true,
      supported: false,
      status: "unsupported_browser",
      message: "This browser does not support WebXR AR.",
      debug
    };
  }

  if (!debug.isSecureContext) {
    return {
      checked: true,
      supported: false,
      status: "insecure_context",
      message: "AR requires HTTPS. Please use the deployed Vercel URL.",
      debug
    };
  }

  if (debug.platform === "ios") {
    return {
      checked: true,
      supported: false,
      status: "unsupported_ios",
      message: "AR measurement is not supported on iPhone browser yet. Please use Image Measurement with A4/card reference.",
      debug
    };
  }

  if (debug.platform === "android_non_chrome") {
    return {
      checked: true,
      supported: false,
      status: "unsupported_browser",
      message: "Please open this app in Android Chrome for AR measurement.",
      debug
    };
  }

  if (debug.platform !== "android_chrome") {
    return {
      checked: true,
      supported: false,
      status: "unsupported_browser",
      message: "AR measurement works best on Android Chrome. Your current browser/device does not support WebXR AR.",
      debug
    };
  }

  if (!navigator.xr) {
    return {
      checked: true,
      supported: false,
      status: "no_navigator_xr",
      message: "This browser does not support WebXR AR.",
      debug
    };
  }

  try {
    const supported = await navigator.xr.isSessionSupported("immersive-ar");
    const nextDebug = { ...debug, immersiveArSupported: supported };
    return supported
      ? {
          checked: true,
          supported: true,
          status: "supported",
          message: "WebXR AR is supported.",
          debug: nextDebug
        }
      : {
          checked: true,
          supported: false,
          status: "immersive_ar_not_supported",
          message: "This browser does not support WebXR AR.",
          debug: nextDebug
        };
  } catch (error) {
    return {
      checked: true,
      supported: false,
      status: "immersive_ar_not_supported",
      message: "This browser does not support WebXR AR.",
      debug: {
        ...debug,
        immersiveArSupported: false,
        lastXRErrorMessage: error instanceof Error ? error.message : "Unknown support check error"
      }
    };
  }
}
