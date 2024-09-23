<script setup lang="ts">
import markdown from "@/lib/markdown";
import { ref, reactive, computed } from "vue";

export interface StyleProps {
  color: string;
  align: string;
  background: string;
  border: string;
  width: string;
  fontSize: string;
  padding: string;
  margin: string;
  borderRadius: string;
  fontFamily: string;
  hover: Partial<StyleProps>;
}

export interface Props {
  label: string;
  style: Partial<StyleProps>;
  onSelect?: () => void;
}

export interface State {
  submitted: boolean;
}

const state: State = reactive({
  submitted: false,
});

const defaultProps = {
  style: {
    color: "black",
    align: "center",
    background: "#AAAAAA",
    border: "2px solid black",
    width: "100%",
    fontSize: "20px",
    padding: "0 20px",
    margin: "10px 0px",
    borderRadius: "10px",
    fontFamily: "sans-serif",
    hover: {
      color: "black",
      background: "#AAAAAA",
    },
  },
};

const customProps = withDefaults(defineProps<Props>(), {
  label: () => "",
  style: () => ({}),
});

const props = {
  ...defaultProps,
  ...customProps,
  style: {
    ...defaultProps.style,
    ...(customProps.style || {}),
    hover: {
      ...defaultProps.style.hover,
      ...(customProps.style?.hover || {}),
    },
  },
};

const button = ref<HTMLButtonElement>();
const label = computed(() => markdown(props.label));

</script>

<template>
  <button
    ref="button"
    :disabled="state.submitted"
    class="sort-option"
    v-html="label"></button>
</template>

<style scoped>
.sort-option {
  display: flex;
  width: v-bind("props.style.width");
  border: v-bind("props.style.border");
  justify-content: v-bind("props.style.align");
  color: v-bind("props.style.color");
  background: v-bind("props.style.background");
  font-size: v-bind("props.style.fontSize");
  padding: v-bind("props.style.padding");
  margin: v-bind("props.style.margin");
  border-radius: v-bind("props.style.borderRadius");
  font-family: v-bind("props.style.fontFamily");
}

.sort-option:hover:not(:disabled) {
  cursor: pointer;
  color: v-bind("props.style.hover.color || props.style.hover.color");
  background: v-bind(
    "props.style.hover.background || props.style.hover.background"
  );
}

.sort-option:disabled {
  opacity: 0.6;
}
</style>
