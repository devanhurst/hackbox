<script setup lang="ts">
import { createRoom } from "@/lib/rooms";
import router from "@/router";

const goToNewSandbox = async () => {
  let roomCode;

  while (!roomCode) {
    roomCode = await createRoom();
  }

  router.push(`/${roomCode.toUpperCase()}`);
};

const goToTwitchSandbox = async () => {
  let roomCode;

  while (!roomCode) {
    roomCode = await createRoom({ twitchRequired: true });
  }

  router.push(`/${roomCode.toUpperCase()}`);
};
</script>

<template>
  <h1>Hackbox Sandbox</h1>
  <button :onClick="goToNewSandbox">Create new sandbox</button>
  <button :onClick="goToTwitchSandbox">
    Create new sandbox, twitch required
  </button>
</template>

<style scoped>
button {
  font-size: 16px;
  width: 200px;
}
</style>
