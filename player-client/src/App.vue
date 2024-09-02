<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterView } from "vue-router";
import { getUserId } from "@/lib/browserStorage";

getUserId();

let windowHeight = ref(window.innerHeight);

const onHeightChange = () => {
  windowHeight.value = window.innerHeight;
};

onMounted(() => {
  window.addEventListener("resize", onHeightChange);
});
</script>

<template>
  <RouterView :window-height="windowHeight + 1 + 'px'" />
</template>

<style>
body {
  margin: 0;
  box-sizing: border-box;
  font-family: Helvetica, sans-serif;
  overflow: hidden;
  user-select: none;
}
</style>
