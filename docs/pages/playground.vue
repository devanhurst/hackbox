<template>
  <div class="h-[calc(100vh-4rem)]">
    <div class="h-full flex">
      <!-- Left Panel: Builder & Editor -->
      <div class="w-2/3 border-r flex flex-col bg-white">
        <div class="h-full min-h-[calc(100vh-8rem)]">
          <JsonEditor
            :value="memberState"
            @update="handleJsonUpdate"
          />
        </div>
      </div>
      <div class="w-1/3 p-6 text-center bg-gray-100 min-h-[calc(100vh-8rem)] overflow-y-auto">
        <DeviceConnection
          ref="deviceConnection"
          :room-code="roomCode"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const deviceConnection = ref<any>(null)

// Default member state
const memberState = ref({
  theme: {
    mainColor: '#3b82f6',
    backgroundColor: '#ffffff',
    textColor: '#1f2937'
  },
  ui: {
    main: {
      components: [
        {
          type: 'Text',
          custom: {
            text: '# Welcome to Hackbox\n\nClick the button below to send an event.',
            size: 'medium'
          }
        },
        {
          type: 'Button',
          custom: {
            text: 'Click Me',
            value: 'button-clicked'
          }
        }
      ]
    }
  }
})

const roomCode = ref<string | null>(null)

// Watch for state changes and send updates to real devices
watch(memberState, () => {
  if (deviceConnection.value?.sendUpdate) {
    deviceConnection.value.sendUpdate(memberState.value)
  }
}, { deep: true })

function handleJsonUpdate(newState: any) {
  memberState.value = newState
}
</script>
