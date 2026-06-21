<script setup lang="ts">
import type { AdminMember, AdminMessage, MessagesResponse } from "~/types";

const props = defineProps<{
  roomId: string;
  live: boolean;
  active: boolean;
  members?: AdminMember[];
}>();

const apiUrl = useApi();
const toast = useToast();

const messages = ref<AdminMessage[]>([]);
const liveCursor = ref(-1);
const loadingInitial = ref(false);
const loadingOlder = ref(false);
const noMoreHistory = ref(false);
const paused = ref(false);

const nameById = computed(() => {
  const map = new Map<string, string>();
  for (const m of props.members ?? []) map.set(m.userId, m.userName || m.userId);
  return map;
});
function who(id: string | null): string {
  if (!id) return "—";
  return nameById.value.get(id) ?? id;
}

const canLoadOlder = computed(
  () => !noMoreHistory.value && (messages.value.length === 0 || messages.value[0]!.seq > 0),
);

const PAGE = 200;

const url = (qs: string) => apiUrl(`room/${encodeURIComponent(props.roomId)}/messages?${qs}`);

async function loadInitial() {
  loadingInitial.value = true;
  messages.value = [];
  liveCursor.value = -1;
  noMoreHistory.value = false;
  try {
    const data = await $fetch<MessagesResponse>(
      props.live ? url("since=-1") : url(`before=${Number.MAX_SAFE_INTEGER}`),
    );
    messages.value = data.messages ?? [];
    liveCursor.value = highestSeq(data);
  } catch {
    toast.add({ title: "Failed to load activity", color: "error" });
  } finally {
    loadingInitial.value = false;
  }
}

async function poll() {
  if (!props.live || paused.value) return;
  try {
    const data = await $fetch<MessagesResponse>(url(`since=${liveCursor.value}`));
    const fresh = (data.messages ?? []).filter((m) => m.seq > liveCursor.value);
    if (fresh.length) {
      messages.value = [...messages.value, ...fresh];
      liveCursor.value = fresh[fresh.length - 1]!.seq;
      scheduleAutoScroll();
    }
  } catch {
    /* transient; next tick retries */
  }
}

async function loadOlder() {
  if (loadingOlder.value || !canLoadOlder.value) return;
  loadingOlder.value = true;
  const before = messages.value.length ? messages.value[0]!.seq : Number.MAX_SAFE_INTEGER;
  try {
    const data = await $fetch<MessagesResponse>(url(`before=${before}&limit=${PAGE}`));
    const older = data.messages ?? [];
    if (older.length === 0) noMoreHistory.value = true;
    else messages.value = [...older, ...messages.value];
    if (older.length < PAGE) noMoreHistory.value = true;
  } catch {
    toast.add({ title: "Failed to load older messages", color: "error" });
  } finally {
    loadingOlder.value = false;
  }
}

function highestSeq(data: MessagesResponse): number {
  const msgs = data.messages ?? [];
  if (msgs.length) return msgs[msgs.length - 1]!.seq;
  if (typeof data.nextSeq === "number") return data.nextSeq - 1;
  return -1;
}

// Auto-scroll to newest, but only when the user is already near the bottom, so
// reading history isn't yanked away.
const feed = ref<HTMLElement | null>(null);
function scheduleAutoScroll() {
  const el = feed.value;
  if (!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  if (nearBottom) nextTick(() => (el.scrollTop = el.scrollHeight));
}

function preview(m: AdminMessage): string {
  const p = m.payload as Record<string, unknown> | null;
  if (p && typeof p === "object" && "truncated" in p) return `⚠ truncated (${p.bytes} bytes)`;
  if (m.type === "state.member") {
    const ui = (p as { ui?: { header?: { text?: string }; main?: { components?: unknown[] } } })
      ?.ui;
    const header = ui?.header?.text ? `"${ui.header.text}"` : "";
    const count = ui?.main?.components?.length ?? 0;
    return `${header} ${count} component${count === 1 ? "" : "s"}`.trim();
  }
  const value = (p as { value?: unknown })?.value;
  const json = JSON.stringify(value ?? p);
  return json && json.length > 160 ? json.slice(0, 160) + "…" : (json ?? "");
}

function full(m: AdminMessage): string {
  return JSON.stringify(m.payload, null, 2);
}

const expanded = ref<Set<number>>(new Set());
function toggle(seq: number) {
  const next = new Set(expanded.value);
  if (next.has(seq)) next.delete(seq);
  else next.add(seq);
  expanded.value = next;
}

let timer: ReturnType<typeof setInterval> | null = null;
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}
function syncTimer() {
  stopTimer();
  if (props.active && props.live && !paused.value) timer = setInterval(poll, 1500);
}

watch(
  () => [props.active, props.roomId] as const,
  ([active]) => {
    if (active) {
      loadInitial().then(syncTimer);
    } else {
      stopTimer();
    }
  },
  { immediate: true },
);
watch(paused, syncTimer);
onBeforeUnmount(stopTimer);

const dirMeta = {
  member_to_host: { icon: "i-lucide-arrow-up", color: "text-primary-400", label: "player→host" },
  host_to_member: { icon: "i-lucide-arrow-down", color: "text-emerald-400", label: "host→player" },
} as const;
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="text-xs uppercase tracking-wide text-primary-400">
        Activity
        <span class="text-muted normal-case">({{ messages.length }} loaded)</span>
      </h3>
      <div class="flex items-center gap-2">
        <UBadge v-if="live" :color="paused ? 'neutral' : 'success'" variant="subtle" size="sm">
          {{ paused ? "paused" : "live" }}
        </UBadge>
        <UBadge v-else color="warning" variant="subtle" size="sm">history</UBadge>
        <UButton
          v-if="live"
          size="xs"
          color="neutral"
          variant="ghost"
          :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
          @click="paused = !paused"
        />
      </div>
    </div>

    <div ref="feed" class="h-80 overflow-auto rounded-md border border-default bg-elevated/50 p-2">
      <div v-if="loadingInitial" class="text-muted p-2 text-sm">Loading activity…</div>
      <div v-else-if="messages.length === 0" class="text-muted p-2 text-sm">No activity yet.</div>
      <template v-else>
        <div class="mb-2 flex justify-center">
          <UButton
            v-if="canLoadOlder"
            size="xs"
            color="neutral"
            variant="subtle"
            :loading="loadingOlder"
            @click="loadOlder"
          >
            Load older
          </UButton>
          <span v-else class="text-muted text-xs">— start of history —</span>
        </div>

        <ul class="space-y-1 font-mono text-xs">
          <li
            v-for="m in messages"
            :key="m.seq"
            class="rounded px-1.5 py-1 hover:bg-elevated"
            @click="toggle(m.seq)"
          >
            <div class="flex items-center gap-2">
              <span class="text-muted tabular-nums">{{ fmtTime(m.timestamp) }}</span>
              <UIcon
                :name="dirMeta[m.direction].icon"
                :class="dirMeta[m.direction].color"
                class="shrink-0"
              />
              <UBadge color="neutral" variant="subtle" size="sm">{{ m.type }}</UBadge>
              <span class="text-default">
                {{ m.direction === "member_to_host" ? who(m.from) : who(m.to) }}
              </span>
              <span v-if="m.event" class="text-primary-300">· {{ m.event }}</span>
              <span class="text-muted truncate">{{ preview(m) }}</span>
            </div>
            <pre
              v-if="expanded.has(m.seq)"
              class="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-default p-2 text-muted"
              >{{ full(m) }}</pre
            >
          </li>
        </ul>
      </template>
    </div>
    <p class="text-muted text-xs">Click a row to expand its payload.</p>
  </div>
</template>
