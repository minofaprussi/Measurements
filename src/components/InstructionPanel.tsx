import { Move, ScanLine } from "lucide-react";

export default function InstructionPanel({
  message,
  trackingPoor
}: {
  message: string;
  trackingPoor: boolean;
}) {
  return (
    <section className="border border-black/10 bg-[var(--charcoal)] p-5 text-white">
      <div className="mb-4 flex items-center gap-3">
        <ScanLine className="size-5 text-[var(--brass)]" />
        <h2 className="text-lg font-semibold">AR Guide</h2>
      </div>
      <p className="text-2xl font-semibold">{message}</p>
      <div className="mt-4 grid gap-2 text-sm leading-6 text-white/70">
        <p>Move your phone slowly to detect a surface.</p>
        <p>Tap the first point.</p>
        <p>Tap the second point.</p>
        <p>Keep phone steady for better accuracy.</p>
      </div>
      {trackingPoor ? (
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--brass)]">
          <Move className="size-4" />
          Surface not detected. Move phone slowly.
        </div>
      ) : null}
    </section>
  );
}

