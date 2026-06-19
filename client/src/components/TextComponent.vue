<script setup lang="ts">
import markdown from "@/lib/markdown";
import { computed } from "vue";
import { applyLegacyAlign, mergeProps } from "@/lib/helpers";

const { custom } = defineProps(["custom"]);
const props = mergeProps(
  {
    text: "Sample Text",
    style: {
      color: "black",
      textAlign: "center",
      background: "white",
      border: "4px solid black",
      width: "auto",
      fontSize: "16px",
      padding: "10px",
      margin: "10px 0px",
      borderRadius: "10px",
      fontFamily: "sans-serif",
    },
  },
  custom,
);

const text = computed(() => markdown(props.text));
// `align` is a deprecated alias for `textAlign` (see applyLegacyAlign).
const style = computed(() => applyLegacyAlign(props.style));
</script>

<template>
  <div class="textbox" :style="style" v-html="text"></div>
</template>

<style scoped>
/* The host's style object is applied inline above (any standard CSS). Only
   structural layout lives here. */
.textbox {
  display: flex;
  justify-content: center;
}

.textbox :deep(p) {
  margin: 0;
}
</style>
