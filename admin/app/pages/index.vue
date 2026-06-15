<script setup lang="ts">
import type { AdminRoom, RoomsResponse } from "~/types";

useHead({ title: "hackbox admin" });

const actions = useRoomActions();
const apiUrl = useApi();

const { data, refresh, status } = await useFetch<RoomsResponse>(apiUrl("rooms"), { server: false });
const rooms = computed(() => data.value?.rooms ?? []);
const loading = computed(() => status.value === "pending");

// Detail modal
const detailOpen = ref(false);
const detailId = ref<string | null>(null);
function openRoom(id: string) {
  detailId.value = id;
  detailOpen.value = true;
}

// Row-level revive (non-destructive) + delete (confirmed)
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

// Auto-refresh every 5s, toggleable.
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
});
</script>

<template>
  <div class="min-h-screen">
    <header class="bg-primary px-5 py-3 text-lg font-extrabold text-white">hackbox admin</header>

    <main class="mx-auto max-w-6xl space-y-3 p-5">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-primary-400">Create room</h2>
      <CreateRoom @created="refresh" />

      <div class="flex items-center justify-between pt-2">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-primary-400">
          Rooms ({{ rooms.length }})
        </h2>
        <div class="flex items-center gap-4">
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

    <!-- Delete confirmation for row-level deletes -->
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
