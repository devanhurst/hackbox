import deepmerge from "@fastify/deepmerge";

interface Component {
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

// Strip NUL bytes (U+0000): kept so a host/member-supplied NUL can't corrupt
// persisted state or leak into downstream consumers that choke on it.
export const stripNullBytes = <T>(value: T): T => {
  if (typeof value === "string") {
    return value.replaceAll("\u0000", "") as T;
  }
  if (Array.isArray(value)) {
    return value.map(stripNullBytes) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, stripNullBytes(val)]),
    ) as T;
  }
  return value;
};

// The blank canvas every member state is merged onto.
const emptyMemberState = (): MemberState => ({
  theme: {
    header: {
      color: "#EEE",
      background: "#222",
      fontFamily: "Fredoka One",
    },
    main: {
      background: "#111",
    },
  },
  ui: {
    header: {
      text: "",
    },
    main: {
      align: "start",
      components: [],
    },
  },
});

export const defaultMemberState = (userName: string): Partial<MemberState> => ({
  ui: {
    header: {
      text: userName,
    },
    main: {
      components: [
        {
          type: "Text",
          props: {
            text: "Hang tight!<br /><br />We're waiting for the host to let you in.",
            style: {
              align: "center",
              border: "none",
              color: "#EEE",
              background: "transparent",
              fontSize: "1.5rem",
              fontFamily: "Fredoka One",
            },
          },
        },
      ],
    },
  },
});

// Stamps a stable-ish key onto each component so the Vue client can keep its
// v-for keys consistent.
export const sanitizeState = (state: Partial<MemberState>): MemberState => {
  const merge = deepmerge();
  const newState = merge(emptyMemberState(), state ?? {}) as MemberState;

  const randomId = crypto.randomUUID().substring(0, 3);

  if (!Array.isArray(newState.ui.main.components)) {
    newState.ui.main.components = [];
  } else {
    newState.ui.main.components = newState.ui.main.components.map((c, index) => ({
      key: `${randomId}-${index}`,
      ...c,
    }));
  }

  return newState;
};
