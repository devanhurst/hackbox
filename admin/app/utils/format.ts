import type { AdminRoom } from "~/types";

export function fmt(ts: number | null | undefined): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

// The activity log wants every distinguishing digit: the full date plus a
// millisecond-precise time, so closely-spaced frames stay orderable by eye.
export function fmtTimestamp(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  });
}

export function statusInfo(r: AdminRoom): {
  label: string;
  color: "success" | "warning" | "neutral";
} {
  if (r.endedAt != null) return { label: "ended", color: "warning" };
  if (r.live === false) return { label: "gone", color: "neutral" };
  return r.hasHost
    ? { label: "host connected", color: "success" }
    : { label: "no host", color: "neutral" };
}

export function endLabel(r: AdminRoom): string {
  if (r.endedAt != null) return `${fmt(r.endedAt)} (${r.endReason || "ended"})`;
  return r.persistent ? "never" : fmt(r.expiresAt);
}

export function alarmLabel(r: AdminRoom): string {
  if (r.endedAt != null) return "—";
  return r.expiresAt ? `${fmt(r.expiresAt)} (scheduled)` : "none scheduled";
}

export function isLive(r: AdminRoom): boolean {
  return r.endedAt == null && r.live !== false;
}
