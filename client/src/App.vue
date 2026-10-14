<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterView } from "vue-router";

let windowHeight = ref<string>("100dvh");

const onHeightChange = () => {
  windowHeight.value = window.innerHeight + 1 + "px";
};

onMounted(() => {
  onHeightChange();
  window.addEventListener("resize", onHeightChange);
});
</script>

<template>
  <RouterView :window-height="windowHeight" />
</template>

<style>
body {
  margin: 0;
  box-sizing: border-box;
  font-family: Helvetica, sans-serif;
  overflow: hidden;
  -ms-user-select: none;
  -webkit-user-select: none;
  user-select: none;
}
</style>
