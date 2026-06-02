"use client";

import dynamic from "next/dynamic";

const ARMeasurement = dynamic(() => import("@/components/ARMeasurement"), {
  ssr: false
});

export default function Home() {
  return <ARMeasurement />;
}
