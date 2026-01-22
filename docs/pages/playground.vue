<template>
  <div class="h-[calc(100vh-4rem)]">
    <div class="h-full flex">
      <!-- Left Panel: Builder & Editor -->
      <div class="w-2/3 border-r flex flex-col bg-white">
        <div class="h-full min-h-[calc(100vh-8rem)]">
          <JsonEditor @update="handleJsonUpdate" />
        </div>
      </div>
      <div class="w-1/3 p-6 text-center bg-gray-100 min-h-[calc(100vh-8rem)] overflow-y-auto">
        <DeviceConnection ref="deviceConnection" :room-code="roomCode" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const deviceConnection = ref<any>(null);

const roomCode = ref<string | null>(null);

function handleJsonUpdate(newState: any) {
  if (deviceConnection.value?.sendUpdate) {
    deviceConnection.value.sendUpdate(newState);
  }
}
</script>
