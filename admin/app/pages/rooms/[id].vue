<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn } from "@nuxt/ui";
import type { AdminMember, AdminRoom, LivePresence, RoomResponse } from "~/types";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const actions = useRoomActions();
const apiUrl = useApi();

const roomId = computed(() => String(route.params.id));

const room = ref<AdminRoom | null>(null);
const loading = ref(false);

useHead({
  title: () => (room.value ? `Room ${room.value.code} · hackbox admin` : "Room · hackbox admin"),
});

const UButton = resolveComponent("UButton");

function sortIcon(dir: false | "asc" | "desc"): string {
  if (dir === "asc") return "i-lucide-arrow-up-narrow-wide";
  if (dir === "desc") return "i-lucide-arrow-down-wide-narrow";
  return "i-lucide-arrow-up-down";
}

// Online-first (desc puts `true` on top), then name A→Z within each group.
const sorting = ref([
  { id: "online", desc: true },
  { id: "userName", desc: false },
]);

const memberColumns: TableColumn<AdminMember>[] = [
  {
    accessorKey: "online",
    header: ({ column }) =>
      h(UButton, {
        color: "neutral",
        variant: "ghost",
        label: "Status",
        icon: sortIcon(column.getIsSorted()),
        class: "-mx-2.5",
        onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
      }),
  },
  {
    accessorKey: "userName",
    header: ({ column }) =>
      h(UButton, {
        color: "neutral",
        variant: "ghost",
        label: "Name",
        icon: sortIcon(column.getIsSorted()),
        class: "-mx-2.5",
        onClick: () => column.toggleSorting(column.getIsSorted() === "asc"),
      }),
  },
  { accessorKey: "twitch", header: "Twitch" },
  { accessorKey: "userId", header: "User ID" },
];

const edit = reactive({ twitchRequired: false, persistent: false, closed: false });
const saving = ref(false);
const reviving = ref(false);
const deleting = ref(false);
const confirmDelete = ref(false);

async function load(id: string) {
  loading.value = true;
  room.value = null;
  confirmDelete.value = false;
  try {
    const data = await $fetch<RoomResponse>(apiUrl(`room/${encodeURIComponent(id)}`));
    if (data.room) {
      room.value = data.room;
      edit.twitchRequired = data.room.twitchRequired;
      edit.persistent = data.room.persistent;
      edit.closed = data.room.closed;
    }
  } catch {
    toast.add({ title: "Failed to load room", color: "error" });
  } finally {
    loading.value = false;
  }
}

// Merge the live overlay onto the durable roster in place: never replaces the
// whole room object (so `edit.*` is untouched), flips each member's `online`
// against the overlay, and appends live members the D1 roster hasn't seen yet.
function applyPresence(p: LivePresence) {
  const r = room.value;
  if (!r) return;
  const list = r.members ?? [];
  const byId = new Map(list.map((m) => [m.userId, m]));
  for (const lm of p.members) {
    if (!byId.has(lm.userId)) {
      const m: AdminMember = {
        userId: lm.userId,
        userName: lm.userName,
        twitch: lm.twitch,
        online: false,
      };
      list.push(m);
      byId.set(lm.userId, m);
    }
  }
  const online = new Set(p.members.filter((m) => m.online).map((m) => m.userId));
  for (const m of list) m.online = online.has(m.userId);
  r.members = list;
  r.hasHost = p.hasHost;
  r.onlineCount = p.onlineCount;
  r.expiresAt = p.expiresAt;
}

let presenceTimer: ReturnType<typeof setInterval> | null = null;
function stopPresence() {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = null;
}

async function pollPresence() {
  const r = room.value;
  if (!r || !isLive(r)) return;
  try {
    const p = await $fetch<LivePresence>(apiUrl(`room/${encodeURIComponent(r.id)}/live`));
    applyPresence(p);
  } catch {
    /* transient; next tick retries */
  }
}

// (Re)start the 2s poll, but only for live rooms — ended rooms have no DO to
// poll, so their roster stays as loaded (all offline).
function syncPresence() {
  stopPresence();
  if (room.value && isLive(room.value)) {
    pollPresence();
    presenceTimer = setInterval(pollPresence, 2000);
  }
}

// Reload the durable roster + settings, then resync the presence poll (room
// liveness can change across a reload — e.g. after a revive).
async function reload(id: string) {
  await load(id);
  syncPresence();
}

watch(roomId, (id) => id && reload(id), { immediate: true });
onBeforeUnmount(stopPresence);

async function saveSettings() {
  if (!room.value) return;
  saving.value = true;
  const ok = await actions.saveSettings(room.value.id, { ...edit });
  if (ok) await reload(room.value.id);
  saving.value = false;
}

async function revive() {
  if (!room.value) return;
  reviving.value = true;
  const ok = await actions.reviveRoom(room.value.id);
  reviving.value = false;
  if (ok) await reload(room.value.id);
}

async function destroy() {
  if (!room.value) return;
  deleting.value = true;
  const ok = await actions.deleteRoom(room.value.id);
  deleting.value = false;
  if (ok) router.push("/");
}

// Prefer browser back so the list's filters and scroll position survive the round
// trip; fall back to the list root when the detail page was opened directly.
function goBack() {
  if (window.history.length > 1) router.back();
  else router.push("/");
}

const info = computed(() => {
  const r = room.value;
  if (!r) return [];
  return [
    { k: "Members", v: `${r.onlineCount || 0} online / ${r.memberCount || 0} total` },
    { k: "DO alarm", v: alarmLabel(r) },
    { k: "hostId", v: r.hostId, mono: true },
    { k: "Created", v: fmt(r.createdAt) },
    { k: "Ended / Expires", v: endLabel(r) },
    { k: "Room id", v: r.id, mono: true },
  ];
});
</script>

<template>
  <div class="min-h-screen">
    <header
      class="sticky top-0 z-10 flex items-center gap-3 bg-primary px-4 py-3 text-white sm:px-5"
    >
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-left"
        class="-ml-2 text-white hover:bg-white/10"
        aria-label="Back to rooms"
        @click="goBack"
      />
      <span class="text-lg font-extrabold">
        {{ room ? `Room ${room.code}` : "Room" }}
      </span>
    </header>

    <main class="mx-auto max-w-6xl p-4 sm:p-5">
      <div v-if="loading" class="text-muted">Loading…</div>
      <div v-else-if="!room" class="space-y-3">
        <p class="text-muted">Room not found.</p>
        <UButton color="neutral" variant="subtle" icon="i-lucide-arrow-left" @click="goBack">
          Back to rooms
        </UButton>
      </div>

      <template v-else>
        <div
          class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start"
        >
          <div class="space-y-5">
            <UCard>
              <div class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm sm:gap-x-5">
                <div class="text-muted">Status</div>
                <div><StatusBadge :room="room" /></div>
                <template v-for="item in info" :key="item.k">
                  <div class="text-muted">{{ item.k }}</div>
                  <div :class="item.mono ? 'font-mono text-xs break-all' : 'break-words'">
                    {{ item.v }}
                  </div>
                </template>
                <div class="text-muted">Settings</div>
                <div><SettingsBadges :room="room" /></div>
              </div>
            </UCard>

            <UCard>
              <h3 class="mb-3 text-xs uppercase tracking-wide text-primary-400">Edit settings</h3>
              <div class="flex flex-wrap items-center gap-4">
                <UCheckbox v-model="edit.twitchRequired" label="twitchRequired" />
                <UCheckbox v-model="edit.persistent" label="persistent" />
                <UCheckbox v-model="edit.closed" label="closed" />
                <UButton
                  size="sm"
                  :loading="saving"
                  icon="i-lucide-save"
                  class="ml-auto"
                  @click="saveSettings"
                >
                  Save settings
                </UButton>
              </div>
            </UCard>

            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-if="!isLive(room)"
                color="primary"
                variant="subtle"
                icon="i-lucide-rotate-ccw"
                :loading="reviving"
                @click="revive"
              >
                Revive
              </UButton>
              <div class="ml-auto flex items-center gap-2">
                <template v-if="confirmDelete">
                  <span class="text-sm text-muted">Delete permanently?</span>
                  <UButton color="neutral" variant="ghost" size="sm" @click="confirmDelete = false">
                    Cancel
                  </UButton>
                  <UButton color="error" size="sm" :loading="deleting" @click="destroy">
                    Confirm delete
                  </UButton>
                </template>
                <UButton
                  v-else
                  color="error"
                  variant="subtle"
                  icon="i-lucide-trash-2"
                  @click="confirmDelete = true"
                >
                  Delete
                </UButton>
              </div>
            </div>
          </div>

          <div class="space-y-5">
            <UCard>
              <h3 class="mb-3 text-xs uppercase tracking-wide text-primary-400">
                Members ({{ room.members?.length || 0 }})
              </h3>
              <div class="max-h-96 overflow-auto">
                <UTable
                  v-model:sorting="sorting"
                  :data="room.members ?? []"
                  :columns="memberColumns"
                  :empty="'No members yet.'"
                >
                  <template #online-cell="{ row }">
                    <UBadge
                      :color="row.original.online ? 'success' : 'neutral'"
                      variant="subtle"
                      size="sm"
                    >
                      {{ row.original.online ? "online" : "offline" }}
                    </UBadge>
                  </template>

                  <template #userName-cell="{ row }">
                    {{ row.original.userName || "—" }}
                  </template>

                  <template #twitch-cell="{ row }">
                    {{ row.original.twitch || "—" }}
                  </template>

                  <template #userId-cell="{ row }">
                    <span class="font-mono text-xs text-muted">{{ row.original.userId }}</span>
                  </template>
                </UTable>
              </div>
            </UCard>

            <UCard>
              <RoomMonitor
                :room-id="room.id"
                :live="isLive(room)"
                :active="true"
                :members="room.members"
              />
            </UCard>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>
