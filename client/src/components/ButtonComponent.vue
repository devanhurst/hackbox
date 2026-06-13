<script setup lang="ts">
import ChoiceButton from "./Choices/ChoiceButton.vue";
import type { HackboxSocket } from "@hackbox/client";
import { inject, onMounted, reactive } from "vue";
import { mergeProps } from "@/lib/helpers";

const socket: HackboxSocket = inject("socket") as HackboxSocket;

let mountedAt: number;

const { custom } = defineProps(["custom"]);
const props = mergeProps(
  {
    label: "A: 42",
    value: "A",
    keys: ["A", "1"],
  },
  custom,
);

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
    :disabled="state.submitted"
  ></choice-button>
</template>

<style scoped></style>
