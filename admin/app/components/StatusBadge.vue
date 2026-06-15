<script setup lang="ts">
import type { AdminRoom } from "~/types";

const props = defineProps<{ room: AdminRoom }>();
const info = computed(() => statusInfo(props.room));
</script>

<template>
  <UBadge :color="info.color" variant="subtle" size="sm">{{ info.label }}</UBadge>
</template>
