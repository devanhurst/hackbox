<script setup lang="ts">
import markdown from "@/lib/markdown";
import { ref, reactive, computed } from "vue";
import { applyLegacyAlign } from "@/lib/helpers";

export interface StyleProps {
  hover?: Record<string, string>;
  [key: string]: unknown;
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
    ...customProps.style,
    hover: {
      ...defaultProps.style.hover,
      ...customProps.style?.hover,
    },
  },
};

// The host's style object is applied inline (any standard CSS). `hover` is
// applied via the scoped :hover rule below, which needs !important to beat the
// inline base. applyLegacyAlign translates the deprecated `align` key.
const baseStyle = applyLegacyAlign(props.style);
delete baseStyle.hover;
const hoverColor = props.style.hover?.color ?? props.style.color;
const hoverBackground = props.style.hover?.background ?? props.style.background;

const button = ref<HTMLButtonElement>();
const label = computed(() => markdown(props.label));
</script>

<template>
  <button
    ref="button"
    :disabled="state.submitted"
    class="sort-option"
    :style="baseStyle"
    v-html="label"
  ></button>
</template>

<style scoped>
.sort-option {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Hover colors override the inline base style, so they need !important. */
.sort-option:hover:not(:disabled) {
  cursor: pointer;
  color: v-bind(hoverColor) !important;
  background: v-bind(hoverBackground) !important;
}

.sort-option:disabled {
  opacity: 0.6;
}
</style>
