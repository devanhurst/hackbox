<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AdminRoom } from "~/types";

defineProps<{ rooms: AdminRoom[]; loading?: boolean }>();
const emit = defineEmits<{ open: [string]; revive: [string]; remove: [AdminRoom] }>();

const columns: TableColumn<AdminRoom>[] = [
  { accessorKey: "code", header: "Code" },
  { id: "status", header: "Status" },
  { id: "members", header: "Members" },
  { id: "settings", header: "Settings" },
  { accessorKey: "createdAt", header: "Created" },
  { id: "ended", header: "Ended / Expires" },
  { id: "actions", header: "" },
];
</script>

<template>
  <UTable
    :data="rooms"
    :columns="columns"
    :loading="loading"
    :empty="'No rooms yet.'"
    class="flex-1"
  >
    <template #code-cell="{ row }">
      <UButton
        variant="link"
        color="primary"
        class="font-bold tracking-wider text-base p-0"
        @click="emit('open', row.original.id)"
      >
        {{ row.original.code }}
      </UButton>
    </template>

    <template #status-cell="{ row }">
      <StatusBadge :room="row.original" />
    </template>

    <template #members-cell="{ row }">
      {{ row.original.onlineCount || 0 }} / {{ row.original.memberCount || 0 }}
    </template>

    <template #settings-cell="{ row }">
      <SettingsBadges :room="row.original" />
    </template>

    <template #createdAt-cell="{ row }">
      <span class="text-muted">{{ fmt(row.original.createdAt) }}</span>
    </template>

    <template #ended-cell="{ row }">
      <span class="text-muted">{{ endLabel(row.original) }}</span>
    </template>

    <template #actions-cell="{ row }">
      <div class="flex justify-end gap-2">
        <UButton
          v-if="!isLive(row.original)"
          size="xs"
          color="neutral"
          variant="subtle"
          @click="emit('revive', row.original.id)"
        >
          revive
        </UButton>
        <UButton size="xs" color="error" variant="subtle" @click="emit('remove', row.original)">
          delete
        </UButton>
      </div>
    </template>
  </UTable>
</template>
