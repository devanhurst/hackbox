<script setup lang="ts">
import type { HackboxSocket } from "@/lib/sockets/hackboxSocket";
import { inject, reactive, onMounted, onUnmounted, watch } from "vue";
import { debounce, mergeProps } from "@/lib/helpers";

const socket: HackboxSocket = inject("socket") as HackboxSocket;

let mountedAt: number;

const { custom } = defineProps(["custom"]);
const props = mergeProps(
  {
    event: "range",
    min: 0,
    max: 100,
    step: 1,
    style: {
      color: "black",
      align: "left",
      background: "white",
      border: "2px solid black",
      width: "100%",
      fontSize: "16px",
      padding: "10px",
      margin: "10px 0",
      borderRadius: "0px",
      fontFamily: "sans-serif",
    },
  },
  custom,
);

const inputState = reactive({
  value: 0,
  submitted: false,
});

const submitWip = debounce(() => {
  if (inputState.submitted) return;

  socket.emit("change", {
    event: props.event,
    value: String(inputState.value),
    ms: Date.now() - mountedAt,
  });
});

watch(inputState, submitWip);

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === "Enter") respond();
};

const respond = () => {
  inputState.submitted = true;
  window.removeEventListener("keydown", handleKeydown);
  socket.emit("msg", {
    event: props.event,
    value: String(inputState.value),
    ms: Date.now() - mountedAt,
  });
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
  <div class="range-input-wrapper">
    <input
      class="range-input"
      type="range"
      v-model="inputState.value"
      :min="props.min"
      :max="props.max"
      :step="props.step"
      :disabled="inputState.submitted"
    />
    <input
      class="range-text-input"
      type="number"
      v-model="inputState.value"
      :min="props.min"
      :max="props.max"
      :step="props.step"
      :disabled="inputState.submitted"
    />
    <button @click="respond" class="submit-button">
      <font-awesome-icon v-if="inputState.submitted" class="submit-icon" icon="fa-solid fa-check" />
      <font-awesome-icon
        v-if="!inputState.submitted"
        class="submit-icon"
        icon="fa-solid fa-paper-plane"
      />
    </button>
  </div>
</template>

<style scoped>
.range-input-wrapper {
  display: flex;
  flex-direction: row;
  border: v-bind("props.style.border");
  border-radius: v-bind("props.style.borderRadius");
  background: v-bind("props.style.background");
  width: v-bind("props.style.width");
  margin: v-bind("props.style.margin");
  font-family: v-bind("props.style.fontFamily");
}

.range-input {
  margin: 0;
  padding: v-bind("props.style.padding");
  flex-grow: 1;
}

.range-input:disabled {
  opacity: 0.6;
}

.range-text-input {
  display: flex;
  border: none;
  color: v-bind("props.style.color");
  background: transparent;
  font-size: v-bind("props.style.fontSize");
  margin: 0;
  padding: v-bind("props.style.padding");
  width: 25%;
  text-align: center;
}

.range-text-input::-webkit-inner-spin-button {
  opacity: 1;
}

.range-text-input:disabled {
  opacity: 0.6;
}

.submit-button {
  font-size: v-bind("props.style.fontSize");
  border: none;
  border-radius: v-bind("props.style.borderRadius");
  background: v-bind("props.style.background");
  padding: v-bind("props.style.padding");
}

.submit-icon {
  color: v-bind("props.style.color");
}
</style>
