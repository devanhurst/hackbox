import { TwitchMetadata } from "./lib/twitch";

interface Component {
  type: string;
  props: { [key: string]: unknown };
}

interface CustomFont {
  family: string;
}

interface ThemeState {
  header: {
    color: string;
    background: string;
  };
  main: {
    background: string;
  };
  fonts?: CustomFont[];
}

interface UiState {
  header: {
    text: string;
  };
  main: {
    align: "start" | "center" | "end";
    components: Component[];
  };
}

export interface MemberState {
  id: string;
  version: number;
  theme: ThemeState;
  ui: UiState;
  presets?: { [key: string]: Component };
}

export interface MemberMetadata {
  twitch?: TwitchMetadata;
}
