<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AdminMember, AdminRoom, RoomResponse } from "~/types";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ roomId: string | null }>();
const emit = defineEmits<{ changed: [] }>();

const toast = useToast();
const actions = useRoomActions();
const apiUrl = useApi();

const room = ref<AdminRoom | null>(null);
const loading = ref(false);

const memberColumns: TableColumn<AdminMember>[] = [
  { id: "status", header: "" },
  { accessorKey: "userName", header: "Name" },
  { accessorKey: "twitch", header: "Twitch" },
  { accessorKey: "userId", header: "User ID" },
];

// Edit-settings form state, seeded from the loaded room.
const edit = reactive({ twitchRequired: false, persistent: false, closed: false });
const saving = ref(false);
const reviving = ref(false);
const deleting = ref(false);
const confirmDelete = ref(false);

const title = computed(() => (room.value ? `Room ${room.value.code}` : "Room"));

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

watch(
  () => [open.value, props.roomId] as const,
  ([isOpen, id]) => {
    if (isOpen && id) load(id);
  },
  { immediate: true },
);

async function saveSettings() {
  if (!room.value) return;
  saving.value = true;
  const ok = await actions.saveSettings(room.value.id, { ...edit });
  if (ok) {
    await load(room.value.id);
    emit("changed");
  }
  saving.value = false;
}

async function revive() {
  if (!room.value) return;
  reviving.value = true;
  const ok = await actions.reviveRoom(room.value.id);
  reviving.value = false;
  if (ok) {
    emit("changed");
    open.value = false;
  }
}

async function destroy() {
  if (!room.value) return;
  deleting.value = true;
  const ok = await actions.deleteRoom(room.value.id);
  deleting.value = false;
  if (ok) {
    emit("changed");
    open.value = false;
  }
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
  <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div v-if="loading" class="text-muted">Loading…</div>
      <div v-else-if="!room" class="text-muted">Not found.</div>
      <div v-else class="space-y-5">
        <!-- Info grid -->
        <div class="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-2 text-sm">
          <div class="text-muted">Status</div>
          <div><StatusBadge :room="room" /></div>
          <template v-for="item in info" :key="item.k">
            <div class="text-muted">{{ item.k }}</div>
            <div :class="item.mono ? 'font-mono text-xs break-all' : ''">{{ item.v }}</div>
          </template>
          <div class="text-muted">Settings</div>
          <div><SettingsBadges :room="room" /></div>
        </div>

        <!-- Edit settings -->
        <div>
          <h3 class="text-xs uppercase tracking-wide text-primary-400 mb-2">Edit settings</h3>
          <div class="flex flex-wrap items-center gap-4">
            <UCheckbox v-model="edit.twitchRequired" label="twitchRequired" />
            <UCheckbox v-model="edit.persistent" label="persistent" />
            <UCheckbox v-model="edit.closed" label="closed" />
            <UButton size="sm" :loading="saving" icon="i-lucide-save" @click="saveSettings">
              Save settings
            </UButton>
          </div>
        </div>

        <!-- Members -->
        <div>
          <h3 class="text-xs uppercase tracking-wide text-primary-400 mb-2">
            Members ({{ room.members?.length || 0 }})
          </h3>
          <div class="max-h-72 overflow-auto">
            <UTable :data="room.members ?? []" :columns="memberColumns" :empty="'No members yet.'">
              <template #status-cell="{ row }">
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
        </div>

        <!-- Live activity monitor -->
        <RoomMonitor
          :room-id="room.id"
          :live="isLive(room)"
          :active="open"
          :members="room.members"
        />
      </div>
    </template>

    <template #footer>
      <div v-if="room" class="flex w-full items-center gap-2">
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
    </template>
  </UModal>
</template>
