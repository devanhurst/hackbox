import type { AdminRoom } from "~/types";

export function fmt(ts: number | null | undefined): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

export function fmtTime(ts: number | null | undefined): string {
  return ts ? new Date(ts).toLocaleTimeString() : "—";
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
