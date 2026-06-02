# AR Measurement Web App

Production-ready WebXR AR measurement app for Vercel. It uses Next.js, TypeScript, Tailwind CSS, Three.js, and WebXR immersive-ar hit-test.

## Features

- Clean responsive landing screen.
- WebXR support check with `navigator.xr`.
- Immersive AR session startup when supported.
- WebXR hit-test surface detection.
- Reticle marker for valid real-world surface hits.
- Tap first point and second point.
- Calculates real-world 3D distance from world coordinates.
- Shows centimeters, inches, and feet.
- Draws selected point markers and line between points with Three.js.
- Reset Measurement and Exit AR controls.
- Fallback message and placeholder image measurement path when WebXR AR is unavailable.
- Does not estimate measurement from normal camera pixels.

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Run locally:

```bash
pnpm dev
```

3. Build for production:

```bash
pnpm run build
```

## Vercel Deployment

- Import the repository in Vercel.
- Use the default Next.js build command.
- WebXR immersive AR generally requires HTTPS and a supported mobile browser.
- AR measurement works best on Android Chrome with ARCore support.
- iOS support depends on WebXR/ARKit-capable browser availability.
