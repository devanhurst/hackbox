import type { TwitchMetadata } from "./lib/twitch";

export interface Component {
  type: string;
  props: { [key: string]: unknown };
}

export interface MemberState {
  theme: {
    header: {
      color?: string;
      background?: string;
      fontFamily?: string;
    };
    main: {
      background?: string;
    };
  };
  ui: {
    header: {
      text?: string;
    };
    main: {
      align?: "start" | "center" | "end";
      components: Component[];
    };
  };
  presets?: { [key: string]: Component };
}

export interface MemberMetadata {
  twitch?: TwitchMetadata;
}
