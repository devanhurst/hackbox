<script setup lang="ts">
import markdown from "@/lib/markdown";
import { ref, reactive, onUnmounted, onMounted, computed } from "vue";
import { applyLegacyAlign } from "@/lib/helpers";

export interface StyleProps {
  hover?: Record<string, string>;
  [key: string]: unknown;
}

export interface Props {
  label: string;
  style: Partial<StyleProps>;
  keys?: string[];
  onSelect?: () => void;
  // Repeatable button: fire on every press without latching into a
  // selected/disabled state, so the host needn't re-push to re-arm it.
  persistent?: boolean;
}

export interface State {
  selected: boolean;
}

const state: State = reactive({
  selected: false,
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
  onSelect: () => {
    return;
  },
  label: () => "",
  keys: () => [],
  style: () => ({}),
  persistent: false,
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

// The host's style object is applied inline (any standard CSS). `hover` is the
// one key that can't be an inline property — it's applied via the scoped
// :hover/selected rules below, which need !important to beat the inline base.
// applyLegacyAlign translates the deprecated `align` key onto standard CSS.
const baseStyle = applyLegacyAlign(props.style);
delete baseStyle.hover;
const hoverColor = props.style.hover?.color ?? props.style.color;
const hoverBackground = props.style.hover?.background ?? props.style.background;

const button = ref<HTMLButtonElement>();
const label = computed(() => markdown(props.label));

const handleKeydown = (event: KeyboardEvent) => {
  if (event.repeat) return;

  const eventKey = event.key.toLowerCase();
  if (props.keys.map((k: string) => k.toLowerCase()).includes(eventKey)) {
    button.value?.click();
  }
};

const handleSelect = () => {
  if (props.persistent) {
    // Stay enabled so the player can press again and again.
    props.onSelect();
    return;
  }
  state.selected = !state.selected;
  props.onSelect();
};

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <button
    ref="button"
    @click="handleSelect"
    :style="baseStyle"
    :disabled="state.selected"
    :class="`choice ${state.selected ? 'choice--selected' : ''}`"
  >
    <span class="choice-label" v-html="label"></span>
  </button>
</template>

<style scoped>
.choice {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Hover/selected colors override the inline base style, so they need !important. */
.choice--selected,
.choice:hover:not(:disabled) {
  cursor: pointer;
  color: v-bind(hoverColor) !important;
  background: v-bind(hoverBackground) !important;
}

.choice:disabled {
  opacity: 0.6;
}

.choice-label {
  word-break: break-word;
  overflow: hidden;
}
</style>
