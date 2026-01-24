<script setup lang="ts">
import JsonEditorVue from "json-editor-vue";
import { Mode } from "vanilla-jsoneditor";

const deviceConnection = ref<any>(null);

const roomCode = ref<string | null>(null);

const json = ref({
  theme: {
    header: {
      color: "#EEE",
      background: "#222",
      fontFamily: "Fredoka One",
    },
    main: {
      background: "#111",
    },
  },
  ui: {
    header: {
      text: "Playground",
    },
    main: {
      align: "start",
      components: [
        {
          type: "Button",
          props: {
            label: "Buzz in",
            event: "buzz",
          },
        },
      ],
    },
  },
});

watch(json, (newValue) => {
  try {
    deviceConnection?.value?.sendUpdate(JSON.parse(newValue as unknown as string));
  } catch {}
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <DeviceConnection ref="deviceConnection" :room-code="roomCode" />
    <ClientOnly>
      <JsonEditorVue
        v-model="json"
        :mode="Mode.text"
        :main-menu-bar="false"
        :navigation-bar="false"
      />
    </ClientOnly>
  </div>
</template>
