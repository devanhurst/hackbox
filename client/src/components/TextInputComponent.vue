<script setup lang="ts">
import type { HackboxSocket } from "@/lib/sockets/hackboxSocket";
import { inject, reactive, onMounted, onUnmounted, watch } from "vue";
import { debounce, mergeProps } from "@/lib/helpers";

const socket: HackboxSocket = inject("socket") as HackboxSocket;

let mountedAt: number;

const { custom } = defineProps(["custom"]);
const props = mergeProps(
  {
    event: "text",
    persistent: false,
    style: {
      color: "black",
      background: "white",
      border: "2px solid black",
      width: "100%",
      fontSize: "30px",
      padding: "10px",
      margin: "10px 0",
      borderRadius: "0px",
      fontFamily: "sans-serif",
    },
  },
  custom,
);

const inputState = reactive({
  value: "",
  submitted: false,
});

const submitWip = debounce(() => {
  if (inputState.submitted) return;

  socket.emit("change", {
    event: props.event,
    value: inputState.value,
    ms: Date.now() - mountedAt,
  });
});

watch(inputState, submitWip);

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === "Enter") respond();
};

const respond = () => {
  if (inputState.value.length === 0) return;

  socket.emit("msg", {
    event: props.event,
    value: inputState.value,
    ms: Date.now() - mountedAt,
  });

  if (props.persistent) {
    inputState.value = "";
  } else {
    inputState.submitted = true;
    window.removeEventListener("keydown", handleKeydown);
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
  <div class="text-input-wrapper" :style="props.style">
    <input
      v-if="props.type === 'number'"
      class="text-input"
      type="number"
      pattern="[0-9]*"
      :step="props.step || 1"
      :min="props.min"
      :max="props.max"
      v-model="inputState.value"
      :disabled="inputState.submitted"
    />
    <input
      v-else
      class="text-input"
      type="text"
      v-model="inputState.value"
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
/* The host's style object is applied inline to the wrapper (any standard CSS);
   the inner controls inherit its typography and stay transparent so the
   wrapper's background/border frame the whole row. */
.text-input-wrapper {
  display: flex;
  flex-direction: row;
}

.text-input {
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  margin: 0;
  width: 100%;
  padding: 0;
  flex-grow: 1;
}

.text-input:disabled {
  opacity: 0.6;
}

.submit-button {
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  padding: 0 0 0 10px;
}

.submit-icon {
  color: inherit;
}
</style>
