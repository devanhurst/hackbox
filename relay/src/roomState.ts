// Member UI-state helpers, ported verbatim (in behaviour) from the legacy
// Node server's `server/helpers.ts` and `server/models/Member.ts`. These are
// pure functions with no Node-only dependencies, so they run unchanged on the
// Workers runtime. The relay is otherwise a dumb message router — the *only*
// hackbox-specific knowledge it carries is this state shape, because it caches
// the last state addressed to each member and replays it on reconnect (the job
// the Postgres `members.state` column used to do).

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

// Strip NUL bytes (U+0000) from every string in a value. Carried over from the
// legacy server (SERVER-3QY): Postgres rejected NUL bytes in the text/jsonb
// columns that handshake input flowed into. DO storage tolerates them, but the
// guard is kept so a host/member-supplied NUL can't corrupt persisted state or
// leak into downstream consumers that do choke on it.
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

// The blank canvas every member state is merged onto. Mirrors
// `emptyMemberState()` in the legacy server's helpers.ts.
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

// The "Hang tight!" holding screen a member sees before the host has pushed any
// UI. Mirrors `defaultMemberState()` in the legacy server's helpers.ts.
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

// Merge an incoming (possibly partial) state onto the empty canvas and stamp a
// stable-ish key onto each component so the Vue client can keep its v-for keys
// consistent. Mirrors `sanitizeState()` in the legacy server's helpers.ts.
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
