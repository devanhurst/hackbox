<script setup lang="ts">
import type { AdminRoom, RoomsResponse } from "~/types";

useHead({ title: "hackbox admin" });

const actions = useRoomActions();
const apiUrl = useApi();

const statusFilter = ref<"active" | "ended" | "all">("active");
const statusItems = [
  { label: "Active", value: "active" },
  { label: "Ended", value: "ended" },
  { label: "All", value: "all" },
];
// `codeInput` is bound to the search box; `codeQuery` is the debounced value sent
// to the server so we don't refetch on every keystroke.
const codeInput = ref("");
const codeQuery = ref("");
let codeDebounce: ReturnType<typeof setTimeout> | null = null;
watch(codeInput, (v) => {
  if (codeDebounce) clearTimeout(codeDebounce);
  codeDebounce = setTimeout(() => {
    codeQuery.value = v.trim();
  }, 300);
});

const { data, refresh, status } = await useFetch<RoomsResponse>(apiUrl("rooms"), {
  query: { status: statusFilter, code: codeQuery },
  server: false,
});
const rooms = computed(() => data.value?.rooms ?? []);
const loading = computed(() => status.value === "pending");

const detailOpen = ref(false);
const detailId = ref<string | null>(null);
function openRoom(id: string) {
  detailId.value = id;
  detailOpen.value = true;
}

async function reviveRoom(id: string) {
  if (await actions.reviveRoom(id)) refresh();
}

const pendingDelete = ref<AdminRoom | null>(null);
const deleting = ref(false);
async function confirmDelete() {
  if (!pendingDelete.value) return;
  deleting.value = true;
  const ok = await actions.deleteRoom(pendingDelete.value.id);
  deleting.value = false;
  if (ok) {
    pendingDelete.value = null;
    refresh();
  }
}

const auto = ref(true);
let timer: ReturnType<typeof setInterval> | null = null;
function syncTimer() {
  if (timer) clearInterval(timer);
  timer = auto.value ? setInterval(() => refresh(), 5000) : null;
}
watch(auto, syncTimer);
onMounted(syncTimer);
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  if (codeDebounce) clearTimeout(codeDebounce);
});
</script>

<template>
  <div class="min-h-screen">
    <header class="bg-primary px-5 py-3 text-lg font-extrabold text-white">hackbox admin</header>

    <main class="mx-auto max-w-6xl space-y-3 p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-primary-400">
          Rooms ({{ rooms.length }})
        </h2>
        <div class="flex flex-wrap items-center gap-3">
          <UInput
            v-model="codeInput"
            icon="i-lucide-search"
            placeholder="Search code"
            class="w-40"
            :loading="loading && !!codeInput"
          />
          <USelect v-model="statusFilter" :items="statusItems" class="w-32" />
          <USwitch v-model="auto" label="auto-refresh (5s)" />
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="refresh()"
          >
            Refresh
          </UButton>
        </div>
      </div>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <RoomsTable
          :rooms="rooms"
          :loading="loading"
          @open="openRoom"
          @revive="reviveRoom"
          @remove="pendingDelete = $event"
        />
      </UCard>
    </main>

    <RoomDetailModal v-model:open="detailOpen" :room-id="detailId" @changed="refresh" />

    <UModal
      :open="!!pendingDelete"
      title="Delete room"
      @update:open="
        (v: boolean) => {
          if (!v) pendingDelete = null;
        }
      "
    >
      <template #body>
        <p class="text-sm">
          Delete room <strong>{{ pendingDelete?.code }}</strong> entirely? This destroys the live
          room (freeing its code) and removes it and its members from history. This cannot be
          undone.
        </p>
      </template>
      <template #footer>
        <div class="ml-auto flex gap-2">
          <UButton color="neutral" variant="ghost" @click="pendingDelete = null">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
