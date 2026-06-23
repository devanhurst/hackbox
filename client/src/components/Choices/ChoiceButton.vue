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
  // A brief, transient "just pressed" flash, independent of the latched
  // `selected` state, so every trigger gets visible feedback.
  pressed: boolean;
}

const state: State = reactive({
  selected: false,
  pressed: false,
});

// How long the pressed flash stays on screen.
const PRESS_FLASH_MS = 150;
let pressTimer: ReturnType<typeof setTimeout> | undefined;

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

// `hover` can't be an inline property — it's applied via the scoped
// :hover/selected rules below, which need !important to beat the inline base.
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

// Flash the pressed look briefly. Driven from handleSelect (not the DOM :active
// pseudo-class) so keyboard triggers — which synthesize a click and never set
// :active — get the same feedback as taps.
const flashPressed = () => {
  state.pressed = true;
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    state.pressed = false;
  }, PRESS_FLASH_MS);
};

const handleSelect = () => {
  flashPressed();
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
  if (pressTimer) clearTimeout(pressTimer);
});
</script>

<template>
  <button
    ref="button"
    @click="handleSelect"
    :style="baseStyle"
    :disabled="state.selected"
    :class="['choice', { 'choice--selected': state.selected, 'choice--pressed': state.pressed }]"
  >
    <span class="choice-label" v-html="label"></span>
  </button>
</template>

<style scoped>
.choice {
  display: flex;
  justify-content: center;
  align-items: center;
  transition:
    transform 0.08s ease,
    filter 0.08s ease;
}

/* Transient feedback on every trigger (tap or keypress), separate from the
   latched selected state so it shows even on persistent, never-disabled buttons. */
.choice--pressed {
  transform: scale(0.95);
  filter: brightness(0.85);
}

/* Respect reduced-motion: drop the scale, keep the brightness cue. */
@media (prefers-reduced-motion: reduce) {
  .choice {
    transition: filter 0.08s ease;
  }
  .choice--pressed {
    transform: none;
  }
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
