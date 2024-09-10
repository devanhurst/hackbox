export interface Component {
  key: string;
  type: string;
  props: { [key: string]: unknown };
}

export interface CustomFont {
  family: string;
}

export interface ThemeState {
  header: {
    color: string;
    background: string;
    minHeight: string;
    maxHeight: string;
    fontFamily: string;
  };
  main: {
    background: string;
    fontFamily: string;
    minWidth: string;
    maxWidth: string;
  };
  fonts?: CustomFont[];
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
  id: string;
  version: number;
  theme: ThemeState;
  ui: UiState;
}

export interface PlayerStatePayload {
  id: string;
  version?: number;
  theme: ThemeState;
  ui: UiState;
  presets: { [key: string]: Component };
}

export interface FindRoomResponse {
  exists: boolean;
  twitchRequired?: boolean;
}
