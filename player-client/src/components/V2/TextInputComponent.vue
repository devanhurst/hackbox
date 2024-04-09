<script setup lang="ts">
import type { Socket } from "socket.io-client";
import { inject, reactive, onMounted, onUnmounted } from "vue";
const socket: Socket = inject("socket") as Socket;

let mountedAt: number;

const defaultProps = {
  event: "text",
  persistent: false,
  style: {
    color: "black",
    align: "left",
    background: "white",
    border: "2px solid black",
    width: "100%",
    fontSize: "30px",
    padding: "10px",
    margin: "10px 0",
    borderRadius: "0px",
    fontFamily: "sans-serif"
  },
};

const customProps = defineProps(["custom"]);
const props = {
  ...defaultProps,
  ...customProps.custom,
  style: { ...defaultProps.style, ...customProps.custom.style },
};

const inputState = reactive({
  value: "",
  submitted: false,
});

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
  <div class="text-input-wrapper">
    <input
      class="text-input"
      type="text"
      v-model="inputState.value"
      :disabled="inputState.submitted" />
    <button @click="respond" class="submit-button">
      <font-awesome-icon
        v-if="inputState.submitted"
        class="submit-icon"
        icon="fa-solid fa-check" />
      <font-awesome-icon
        v-if="!inputState.submitted"
        class="submit-icon"
        icon="fa-solid fa-paper-plane" />
    </button>
  </div>
</template>

<style scoped>
.text-input-wrapper {
  display: flex;
  flex-direction: row;
  border: v-bind("props.style.border");
  border-radius: v-bind("props.style.borderRadius");
  background: v-bind("props.style.background");
  width: v-bind("props.style.width");
  margin: v-bind("props.style.margin");
  font-family: v-bind("props.style.fontFamily");
}

.text-input {
  border: none;
  color: v-bind("props.style.color");
  background: transparent;
  font-size: v-bind("props.style.fontSize");
  margin: 0;
  width: 100%;
  padding: v-bind("props.style.padding");
  flex-grow: 1;
}

.text-input:disabled {
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
