<script setup lang="ts">
import type { AdminRoom } from "~/types";

const props = defineProps<{ room: AdminRoom }>();

const badges = computed(() => [
  { label: "twitch", on: props.room.twitchRequired },
  { label: "persist", on: props.room.persistent },
  { label: "closed", on: props.room.closed },
]);
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <UBadge
      v-for="b in badges"
      :key="b.label"
      :color="b.on ? 'primary' : 'neutral'"
      :variant="b.on ? 'subtle' : 'soft'"
      size="sm"
    >
      {{ b.label }}
    </UBadge>
  </div>
</template>
