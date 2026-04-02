import deepmerge from "@fastify/deepmerge";
import type { MemberState } from "./types";

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
      align: "start" as const,
      components: [],
    },
  },
});

export const defaultMemberState = (userName: string) => ({
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

export const sanitizeState = (state: Partial<MemberState>) => {
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
