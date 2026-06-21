<script setup lang="ts">
import { inject, onMounted, onUnmounted, reactive } from "vue";
import type { HackboxSocket } from "@/lib/sockets/hackboxSocket";
import { mergeProps } from "@/lib/helpers";

let mountedAt: number;
const buzzerState = reactive({
  buzzed: false,
});

const socket = inject("socket") as HackboxSocket;

const { custom } = defineProps(["custom"]);
const props = mergeProps(
  {
    label: "BUZZ",
    event: "buzz",
    style: {
      color: "white",
      background: "red",
      boxShadow: "5px 5px #000000",
      borderRadius: "70px",
      fontSize: "70px",
      height: "300px",
      border: "2px solid white",
    },
  },
  custom,
);

const respond = () => {
  buzzerState.buzzed = true;
  window.removeEventListener("keydown", handleKeydown);
  socket.emit("msg", {
    event: props.event,
    ms: Date.now() - mountedAt,
    value: null,
  });
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === " " || event.key === "Enter") {
    respond();
  }
};

onMounted(() => {
  mountedAt = Date.now();
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <button
    @click="respond"
    :disabled="buzzerState.buzzed"
    class="buzzer-button"
    :style="props.style"
  >
    {{ props.label }}
  </button>
</template>

<style scoped>
.buzzer-button {
  margin: 0;
  cursor: pointer;
}

.buzzer-button:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>
