<script setup lang="ts">
import ChoiceButton from "./Choices/ChoiceButton.vue";
import type { Socket } from "socket.io-client";
import { inject, onMounted, reactive } from "vue";
const socket: Socket = inject("socket") as Socket;

let mountedAt: number;

const defaultProps = {
  label: "A: 42",
  value: "A",
  keys: ["A", "1"],
  style: {
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

interface State {
  submitted: boolean;
}

const state: State = reactive({
  submitted: false,
});

const respond = () => {
  state.submitted = true;

  socket.emit("msg", {
    event: props.event,
    value: props.value,
    ms: Date.now() - mountedAt,
  });
};

onMounted(() => {
  mountedAt = Date.now();
});
</script>

<template>
  <choice-button
    :onSelect="respond"
    :label="props.label"
    :keys="props.keys"
    :style="props.style"
    :disabled="state.submitted"></choice-button>
</template>

<style scoped></style>
