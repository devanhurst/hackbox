<script setup lang="ts">
import { inject, onMounted, onUnmounted, reactive } from "vue";
import type { Socket } from "socket.io-client";

let mountedAt: number;
const buzzerState = reactive({
  buzzed: false,
});

const socket = inject("socket") as Socket;

const defaultProps = {
  label: "BUZZ",
  event: "buzz",
  style: {
    color: "white",
    background: "red",
    shadow: "5px 5px #000000",
    radius: "70px",
    fontSize: "70px",
    height: "300px",
    border: "2px solid white",
    hover: {},
  },
};

const customProps = defineProps(["custom"]);
const props = {
  ...defaultProps,
  ...(customProps.custom || {}),
  style: {
    ...defaultProps.style,
    ...(customProps.custom?.style || {}),
    hover: {
      ...defaultProps.style.hover,
      ...(customProps.custom?.style?.hover || {}),
    },
  },
};

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
  <button @click="respond" :disabled="buzzerState.buzzed" class="buzzer-button">
    {{ props.label }}
  </button>
</template>

<style scoped>
.buzzer-button {
  color: v-bind("props.color");
  background: v-bind("props.background");
  font-size: v-bind("props.fontSize");
  height: v-bind("props.height");
  margin: 0;
  box-shadow: v-bind("props.shadow");
  border-radius: v-bind("props.radius");
  border: v-bind("props.border");
  font-family: v-bind("props.fontFamily");
}
</style>
