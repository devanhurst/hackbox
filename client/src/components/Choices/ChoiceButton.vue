<script setup lang="ts">
import markdown from "@/lib/markdown";
import { ref, reactive, onUnmounted, onMounted, computed } from "vue";

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
    :disabled="state.selected"
    :class="`choice ${state.selected ? 'choice--selected' : ''}`"
  >
    <span class="choice-label" v-html="label"></span>
  </button>
</template>

<style scoped>
.choice {
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

.choice--selected {
  color: v-bind("props.style.hover.color || props.style.color");
  background: v-bind("props.style.hover.background || props.style.hover.background");
}

.choice--not-selected {
  opacity: 0.6;
}

.choice:hover:not(:disabled) {
  cursor: pointer;
  color: v-bind("props.style.hover.color || props.style.hover.color");
  background: v-bind("props.style.hover.background || props.style.hover.background");
}

.choice:disabled {
  opacity: 0.6;
}

.choice--not-selected {
  opacity: 0.6;
}

.choice-label {
  word-break: break-word;
  overflow: hidden;
}
</style>
