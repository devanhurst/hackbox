<script setup lang="ts">
import { provide } from "vue";
import initializePlayerSocket from "@/lib/sockets/playerSocket";
import router from "@/router";
import { onBeforeRouteLeave } from 'vue-router'

const props = defineProps({
  windowHeight: String,
});

const { socket, state } = initializePlayerSocket(router);
provide("socket", socket);
document.addEventListener('contextmenu', event => event.preventDefault());

onBeforeRouteLeave(() => {
  socket.disconnect();
});
</script>

<template>
  <div class="player-wrapper">
    <div
      class="player-nav--wrapper">
      <div class="player-nav">
        {{ state.ui.header.text }}
      </div>
    </div>
    <div v-if="state.ui.main.components" class="player-main--wrapper">
      <div class="player-main">
        <component
          v-for="comp in state.ui.main.components"
          :is="`${comp.type}Component`"
          :key="comp.key"
          :custom="comp.props"
          class="player-component" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-wrapper {
  display: flex;
  flex-direction: column;
  height: v-bind("props.windowHeight");
  background: v-bind("state.theme.main.background || 'black'");
}

.player-nav--wrapper {
  display: flex;
  justify-content: center;
  min-height: v-bind("state.theme.header.minHeight || '50px'");
  max-height: v-bind("state.theme.header.maxHeight || '50px'");
  color: v-bind("state.theme.header.color || 'black'");
  background: v-bind("state.theme.header.background || 'black'");
  font-family: v-bind("state.theme.header.fontFamily");
}

.player-nav {
  display: flex;
  justify-content: center;
  width: 100%;
  min-width: v-bind("state.theme.main.minWidth || '300px'");
  max-width: v-bind("state.theme.main.maxWidth || '350px'");
  align-items: center;
  font-size: 28px;
  font-weight: bold;
}

.player-main--wrapper {
  display: flex;
  flex: 1;
  justify-content: center;
  overflow: scroll;
  align-items: v-bind("state.ui.main.align || 'start'");
  font-family: v-bind("state.theme.main.fontFamily");
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}

.player-main--wrapper::-webkit-scrollbar {
  display: none;
}

.player-main {
  display: flex;
  flex-direction: column;
  max-height: 100%;
  width: 100%;
  min-width: v-bind("state.theme.main.minWidth || '300px'");
  max-width: v-bind("state.theme.main.maxWidth || '350px'");
}

.player-component {
  margin-top: 10px;
  margin-bottom: 10px;
}

.input-area {
  display: flex;
  flex-direction: column;
  margin-block: 10px;
  margin-inline: 20px;
}

label {
  font-size: 18px;
  margin-left: 8px;
  margin-bottom: 6px;
  font-weight: 800;
  color: #444444;
}

input {
  border: 0;
  font-size: 18px;
  background: #dddddd;
  padding: 10px;
  border-radius: 5px;
  font-weight: 800;
  text-transform: uppercase;
}

button {
  border: 0;
  border-radius: 5px;
  margin-top: 20px;
  font-size: 20px;
  font-weight: 800;
  margin-inline: 40px;
  padding: 20px;
  color: white;
  background: #ed729f;
  opacity: 0.9;
  transition: color 0.2s, background 0.2s, opacity 0.2s;
}

button:disabled {
  color: #777777;
  background: #eeeeee;
}

button:hover {
  cursor: pointer;
}

button:hover:not(:disabled) {
  opacity: 1;
}

.host-link {
  display: flex;
  justify-content: center;
  margin-top: 30px;
  color: #ed729f;
  font-size: 12px;
  text-decoration: none;
}
</style>
