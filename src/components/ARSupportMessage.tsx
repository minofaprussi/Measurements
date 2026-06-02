import { ShieldAlert } from "lucide-react";
import type { XRSupportState } from "@/types/measurement";

export default function ARSupportMessage({
  support,
  onFallback
}: {
  support: XRSupportState;
  onFallback: () => void;
}) {
  if (!support.checked || support.supported) return null;

  return (
    <section className="border border-[var(--oxblood)]/25 bg-[#fffaf2]/85 p-5">
      <div className="mb-3 flex items-center gap-3">
        <ShieldAlert className="size-5 text-[var(--oxblood)]" />
        <h2 className="text-lg font-semibold">AR not supported</h2>
      </div>
      <p className="text-sm leading-6 text-black/65">{support.message}</p>
      <button
        type="button"
        onClick={onFallback}
        className="mt-4 w-full bg-[var(--charcoal)] px-4 py-3 font-semibold text-white sm:w-auto"
      >
        Use Image Measurement Instead
      </button>
    </section>
  );
}

