<script setup lang="ts">
import type { Socket } from "socket.io-client";
import { inject, onMounted, onUnmounted } from "vue";
const socket: Socket = inject("socket") as Socket;

let mountedAt: number;

const defaultProps = {
  label: "A: 42",
  value: "A",
  keys: ["A", "1"],
  color: "black",
  align: "center",
  background: "#AAAAAA",
  border: "2px solid black",
};

const providedProps = defineProps(["custom"]);
const props = {
  ...defaultProps,
  ...providedProps.custom,
};

const respond = () => {
  socket.emit("msg", {
    event: props.event,
    value: props.value,
    ms: Date.now() - mountedAt,
  });
};

const handleKeydown = (event: KeyboardEvent) => {
  const eventKey = event.key.toLowerCase();
  const keys = [props.keys].flat().map((key) => key.toLowerCase());

  if (keys.includes(eventKey)) respond();
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
  <button @click="respond" class="select-button">{{ props.label }}</button>
</template>

<style scoped>
.select-button {
  display: flex;
  border: v-bind("props.border");
  justify-content: v-bind("props.align");
  color: v-bind("props.color");
  background: v-bind("props.background");
  font-size: 20px;
  margin: 0;
}

.select-button:hover {
  color: v-bind("props.hover.color || props.color");
  background: v-bind("props.hover.background || props.background");
}
</style>
