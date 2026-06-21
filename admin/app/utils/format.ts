import type { AdminRoom } from "~/types";

export function fmt(ts: number | null | undefined): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

// Clock time (HH:MM:SS) for the dense monitor feed, where the date is noise.
export function fmtTime(ts: number | null | undefined): string {
  return ts ? new Date(ts).toLocaleTimeString() : "—";
}

// Status pill: ended (history) / gone (live record but DO absent) / host
// connected / no host. Mirrors the original admin's statusBadge logic.
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

// Ended/Expires column: end time + reason for history, else the DO expiry (or
// "never" when persistent).
export function endLabel(r: AdminRoom): string {
  if (r.endedAt != null) return `${fmt(r.endedAt)} (${r.endReason || "ended"})`;
  return r.persistent ? "never" : fmt(r.expiresAt);
}

export function alarmLabel(r: AdminRoom): string {
  if (r.endedAt != null) return "—";
  return r.expiresAt ? `${fmt(r.expiresAt)} (scheduled)` : "none scheduled";
}

// A room is revivable when it is not currently live.
export function isLive(r: AdminRoom): boolean {
  return r.endedAt == null && r.live !== false;
}
