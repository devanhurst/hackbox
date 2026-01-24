<script setup lang="ts">
import ChoiceButton from "./Choices/ChoiceButton.vue";
import type { Socket } from "socket.io-client";
import { inject, onMounted, reactive, watch } from "vue";
import { debounce } from "@/lib/helpers";

const socket: Socket = inject("socket") as Socket;

let mountedAt: number;

interface Choice {
  label: string;
  value: string;
  keys?: string[];
  style?: object;
  selected?: boolean;
}

const defaultProps = {
  event: "answer",
  multiSelect: false,
  choices: [
    {
      label: "A: Helium",
      value: "A",
      keys: ["A", "1"],
    },
    {
      label: "B: Neon",
      value: "B",
      keys: ["B", "2"],
    },
    {
      label: "C: Krypton",
      value: "C",
      keys: ["C", "3"],
    },
    {
      label: "D: Boron",
      value: "D",
      keys: ["D", "4"],
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
};

const { custom } = defineProps(["custom"]);
const props = {
  ...defaultProps,
  ...custom,
  submit: {
    ...defaultProps.submit,
    ...custom?.submit,
    style: {
      ...defaultProps.style,
      ...defaultProps.submit.style,
      ...custom?.style,
      ...custom?.submit?.style,
      hover: {
        ...custom?.style?.hover,
        ...custom?.submit?.style?.hover,
      },
    },
  },
  style: {
    ...defaultProps.style,
    ...custom?.style,
    hover: {
      ...custom?.style?.hover,
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

const submitWip = debounce(() => {
  if (state.submitted) return;

  const response = props.multiSelect ? state.selections : state.selections[0];

  socket.emit("change", {
    event: props.event,
    value: response,
    ms: Date.now() - mountedAt,
  });
});

watch(state, submitWip);

const submitResponse = () => {
  state.submitted = true;
  const response = props.multiSelect ? state.selections : state.selections[0];

  socket.emit("msg", {
    event: props.event,
    value: response,
    ms: Date.now() - mountedAt,
  });
};

const addSelection = (value: string) => {
  state.selections.push(value);
};

const removeSelection = (value: string) => {
  const index = state.selections.indexOf(value);
  if (index === -1) return;

  state.selections.splice(index, 1);
};

const toggleSelection = (value: string) => {
  if (state.selections.includes(value)) {
    removeSelection(value);
  } else {
    addSelection(value);
  }

  if (props.multiSelect) return;
  submitResponse();
};

onMounted(() => {
  mountedAt = Date.now();
});
</script>

<template>
  <div v-if="props.style.grid">
    <div class="choices-grid">
      <choice-button
        v-for="choice in state.choices"
        :key="choice.value"
        :onSelect="() => toggleSelection(choice.value)"
        :disabled="state.submitted"
        :label="choice.label"
        :keys="choice.keys"
        :style="{ ...props.style, ...choice.style }"
      ></choice-button>
    </div>
    <choice-button
      v-if="props.multiSelect"
      key="submit-button"
      :onSelect="submitResponse"
      :disabled="state.submitted || state.selections.length === 0"
      :label="props.submit.label"
      :keys="['Enter']"
      :style="{ ...props.style, ...props.submit.style }"
    ></choice-button>
  </div>
  <div v-else class="choices">
    <choice-button
      v-for="choice in state.choices"
      :key="choice.value"
      :onSelect="() => toggleSelection(choice.value)"
      :disabled="state.submitted"
      :label="choice.label"
      :keys="choice.keys"
      :style="{ ...props.style, ...choice.style }"
    ></choice-button>
    <choice-button
      v-if="props.multiSelect"
      key="submit-button"
      :onSelect="submitResponse"
      :disabled="state.submitted || state.selections.length === 0"
      :label="props.submit.label"
      :keys="['Enter']"
      :style="{ ...props.style, ...props.submit.style }"
    ></choice-button>
  </div>
</template>

<style scoped>
.choices {
  display: flex;
  flex-direction: column;
}

.choices-grid {
  display: grid;
  grid-template-columns: repeat(v-bind("props.style.gridColumns"), 1fr);
  grid-auto-rows: v-bind("props.style.gridRowHeight");
  grid-gap: v-bind("props.style.gridGap");
  margin-bottom: v-bind("props.style.gridGap");
}
</style>
