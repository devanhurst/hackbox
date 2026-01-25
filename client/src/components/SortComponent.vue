<script setup lang="ts">
import ChoiceButton from "./Choices/ChoiceButton.vue";
import SortOption from "./Sort/SortOption.vue";
import type { Socket } from "socket.io-client";
import { inject, onMounted, reactive, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { mergeProps } from "@/lib/helpers";

const socket: Socket = inject("socket") as Socket;

let mountedAt: number;

interface Choice {
  label: string;
  value: string;
  style?: object;
}

const { custom } = defineProps(["custom"]);
const props = mergeProps(
  {
    event: "answer",
    multiSelect: false,
    choices: [
      {
        label: "A: Helium",
        value: "A",
      },
      {
        label: "B: Neon",
        value: "B",
      },
      {
        label: "C: Krypton",
        value: "C",
      },
      {
        label: "D: Boron",
        value: "D",
      },
    ],
    submit: {
      label: "Submit",
      style: {
        margin: "50px 0px",
      },
    },
    style: {
      grid: false,
      gridColumns: 2,
      gridRowHeight: "1fr",
      gridGap: "10px",
    },
  },
  custom,
);

interface State {
  choices: Choice[];
  submitted: boolean;
}

const state: State = reactive({
  choices: props.choices.map((choice: Choice) => ({
    ...choice,
    selected: false,
  })),
  submitted: false,
});

const submitResponse = () => {
  state.submitted = true;
  const response = state.choices.map((c) => c.value);

  socket.emit("msg", {
    event: props.event,
    value: response,
    ms: Date.now() - mountedAt,
  });
};

onMounted(() => {
  mountedAt = Date.now();
});
</script>

<template>
  <div class="sort-options">
    <VueDraggable ref="el" v-model="state.choices" :disabled="state.submitted">
      <div v-for="choice in state.choices" :key="choice.value">
        <sort-option
          :key="choice.value"
          :label="choice.label"
          :submitted="state.submitted"
          :style="{ ...props.style, ...choice.style }"
        ></sort-option>
      </div>
    </VueDraggable>
    <choice-button
      key="submit-button"
      :onSelect="submitResponse"
      :disabled="state.submitted"
      :label="props.submit.label"
      :keys="['Enter']"
      :style="{ ...props.style, ...props.submit.style }"
    ></choice-button>
  </div>
</template>

<style scoped>
.sort-options {
  display: flex;
  flex-direction: column;
}
</style>
