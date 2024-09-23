<script setup lang="ts">
import markdown from "@/lib/markdown";
import { computed } from "vue";

const customProps = defineProps(["custom"]);

const defaultProps = {
  text: "Sample Text",
  style: {
    color: "black",
    align: "center",
    background: "white",
    border: "4px solid black",
    width: "auto",
    fontSize: "16px",
    padding: "10px",
    margin: "10px 0px",
    borderRadius: "10px",
    fontFamily: "sans-serif",
  },
};

const props = {
  ...defaultProps,
  ...customProps.custom,
  style: {
    ...defaultProps.style,
    ...customProps.custom?.style,
  },
};

const text = computed(() => markdown(props.text));
</script>

<template>
  <div class="textbox" v-html="text"></div>
</template>

<style scoped>
.textbox {
  display: flex;
  width: v-bind("props.style.width");
  border: v-bind("props.style.border");
  justify-content: v-bind("props.style.align");
  text-align: v-bind("props.style.align");
  color: v-bind("props.style.color");
  background: v-bind("props.style.background");
  font-size: v-bind("props.style.fontSize");
  padding: v-bind("props.style.padding");
  margin: v-bind("props.style.margin");
  border-radius: v-bind("props.style.borderRadius");
  font-family: v-bind("props.style.fontFamily");
}

p {
  margin: 0;
}
</style>
