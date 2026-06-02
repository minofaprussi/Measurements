import type { MeasurementResult } from "@/types/measurement";

export default function ResultPanel({ result }: { result: MeasurementResult | null }) {
  return (
    <section className="grid gap-3 border border-black/10 bg-[#fffaf2]/85 p-5 sm:grid-cols-3">
      <Metric label="Centimeters" value={result ? `${result.centimeters.toFixed(1)} cm` : "--"} />
      <Metric label="Inches" value={result ? `${result.inches.toFixed(2)} in` : "--"} />
      <Metric label="Feet" value={result ? `${result.feet.toFixed(3)} ft` : "--"} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--brass)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--charcoal)]">{value}</p>
    </div>
  );
}

