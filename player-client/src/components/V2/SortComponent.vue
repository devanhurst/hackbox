<script setup lang="ts">
import ChoiceButton from "./Choices/ChoiceButton.vue";
import type { Socket } from "socket.io-client";
import { inject, onMounted, reactive, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";

const socket: Socket = inject("socket") as Socket;

let mountedAt: number;

interface Choice {
  label: string;
  value: string;
  keys: string[];
  style?: object;
  selected?: boolean;
}

const defaultProps = {
  event: "answer",
  multiSelect: false,
  choices: [
    {
      label: "A: Hydrogen",
      value: "A",
    }
  ],
  submit: {
    label: "Submit",
    style: {
      margin: "50px 0px",
      hover: {},
    },
  },
  style: {
    grid: false,
    gridColumns: 2,
    gridRowHeight: "1fr",
    gridGap: "10px",
    hover: {},
  },
};

const customProps = defineProps(["custom"]);
const props = {
  ...defaultProps,
  ...customProps.custom,
  submit: {
    ...defaultProps.submit,
    ...(customProps.custom?.submit || {}),
    style: {
      ...defaultProps.style,
      ...defaultProps.submit.style,
      ...(customProps.custom?.style || {}),
      ...(customProps.custom?.submit?.style || {}),
      hover: {
        ...defaultProps.style.hover,
        ...defaultProps.submit.style.hover,
        ...(customProps.custom?.style?.hover || {}),
        ...(customProps.custom?.submit?.style?.hover || {}),
      },
    },
  },
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
  choices: Choice[];
  selections: string[];
  submitted: boolean;
}

const state: State = reactive({
  choices: props.choices.map((choice: Choice) => ({
    ...choice,
    selected: false,
  })),
  selections: [],
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
  <div class="choices">
    <VueDraggable ref="el" v-model="state.choices" :disabled="state.submitted">
      <div v-for="choice in state.choices" :key="choice.value">
        <choice-button
          :key="choice.value"
          :label="choice.label"
          :style="{ ...props.style, ...choice.style }"></choice-button>
      </div>
    </VueDraggable>
    <choice-button
      key="submit-button"
      :onSelect="submitResponse"
      :disabled="state.submitted"
      :label="props.submit.label"
      :keys="['Enter']"
      :style="{ ...props.style, ...props.submit.style }"></choice-button>
  </div>
</template>

<style scoped>
.choices {
  display: flex;
  flex-direction: column;
}
</style>
