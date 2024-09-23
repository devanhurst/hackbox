export interface Component {
  key: string;
  type: string;
  props: { [key: string]: unknown };
}

export interface ThemeState {
  header: {
    color: string;
    background: string;
    minHeight: string;
    maxHeight: string;
    fontFamily?: string;
  };
  main: {
    background: string;
    minWidth: string;
    maxWidth: string;
    fontFamily?: string;
  };
}

export interface UiState {
  header: {
    text: string;
  };
  main: {
    align: "start" | "center" | "end";
    components: Component[];
  };
}

export interface PlayerState {
  theme: ThemeState;
  ui: UiState;
}

export interface PlayerStatePayload {
  theme: ThemeState;
  ui: UiState;
  presets: { [key: string]: Component };
}

export interface FindRoomResponse {
  exists: boolean;
  twitchRequired?: boolean;
}
