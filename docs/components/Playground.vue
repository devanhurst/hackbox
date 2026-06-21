<script setup lang="ts">
import JsonEditorVue from "json-editor-vue";
import { Mode } from "vanilla-jsoneditor";

const deviceConnection = ref<any>(null);
const roomCode = ref<string | null>(null);

const samples: { name: string; payload: any }[] = [
  {
    name: "🎉 Lobby",
    payload: {
      theme: {
        header: { color: "#f0abfc", background: "#3b0764", fontFamily: "Bungee" },
        main: { background: "radial-gradient(circle at 50% 0%, #6b21a8, #2e1065)" },
      },
      presets: {
        Card: {
          type: "Text",
          props: {
            style: {
              color: "#fff",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: "18px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              padding: "20px",
              textAlign: "center",
              fontFamily: "Space Grotesk",
              margin: "8px 0",
            },
          },
        },
      },
      ui: {
        header: { text: "You're in! 🎉" },
        main: {
          align: "center",
          components: [
            {
              type: "Card",
              props: { text: "# Welcome, player!\nThe host will start the game soon." },
            },
            { type: "Card", props: { text: "Keep this screen open on your phone 📱" } },
          ],
        },
      },
    },
  },
  {
    name: "❓ Trivia",
    payload: {
      theme: {
        header: { color: "#fff", background: "#5b21b6", fontFamily: "Bungee" },
        main: { background: "linear-gradient(160deg, #1e1b4b, #4c1d95)" },
      },
      ui: {
        header: { text: "Question 3 of 10" },
        main: {
          align: "center",
          components: [
            {
              type: "Text",
              props: {
                text: "Which planet is known as the **Red Planet**?",
                style: {
                  color: "#fff",
                  background: "transparent",
                  border: "none",
                  fontSize: "1.4rem",
                  textAlign: "center",
                  fontFamily: "Space Grotesk",
                  margin: "0 0 20px",
                },
              },
            },
            {
              type: "Choices",
              props: {
                event: "answer",
                multiSelect: false,
                choices: [
                  { label: "Venus", value: "venus" },
                  { label: "Mars", value: "mars" },
                  { label: "Jupiter", value: "jupiter" },
                  { label: "Saturn", value: "saturn" },
                ],
                style: {
                  color: "#fff",
                  background: "rgba(255,255,255,0.08)",
                  border: "2px solid rgba(255,255,255,0.25)",
                  borderRadius: "14px",
                  fontFamily: "Space Grotesk",
                  fontSize: "1.1rem",
                  padding: "14px",
                  margin: "6px 0",
                  hover: { background: "#f59e0b", color: "#1e1b4b" },
                },
              },
            },
          ],
        },
      },
    },
  },
  {
    name: "🔔 Buzzer",
    payload: {
      theme: {
        header: { color: "#fde047", background: "#000", fontFamily: "Bungee" },
        main: { background: "radial-gradient(circle at 50% 30%, #1f2937, #000)" },
      },
      ui: {
        header: { text: "BUZZ IN!" },
        main: {
          align: "center",
          components: [
            {
              type: "Buzzer",
              props: {
                label: "BUZZ",
                event: "buzz",
                style: {
                  color: "#000",
                  background: "linear-gradient(145deg, #fde047, #f59e0b)",
                  boxShadow: "0 12px 0 #b45309, 0 18px 30px rgba(0,0,0,0.6)",
                  borderRadius: "9999px",
                  fontSize: "3rem",
                  height: "260px",
                  width: "260px",
                  border: "6px solid #fff7cc",
                  fontFamily: "Bungee",
                },
              },
            },
          ],
        },
      },
    },
  },
  {
    name: "🎚️ Estimate",
    payload: {
      theme: {
        header: { color: "#0f172a", background: "#7dd3fc", fontFamily: "Righteous" },
        main: { background: "#e0f2fe" },
      },
      ui: {
        header: { text: "How many?" },
        main: {
          align: "center",
          components: [
            {
              type: "Text",
              props: {
                text: "Guess the number of **jellybeans** in the jar 🫙",
                style: {
                  color: "#0c4a6e",
                  background: "#fff",
                  border: "none",
                  borderRadius: "16px",
                  boxShadow: "0 6px 16px rgba(2,132,199,0.18)",
                  fontSize: "1.2rem",
                  textAlign: "center",
                  padding: "18px",
                  fontFamily: "Righteous",
                  margin: "0 0 16px",
                },
              },
            },
            {
              type: "Range",
              props: {
                event: "guess",
                min: 0,
                max: 1000,
                step: 10,
                style: {
                  color: "#0369a1",
                  background: "#fff",
                  border: "2px solid #7dd3fc",
                  borderRadius: "12px",
                  fontSize: "1.3rem",
                  fontFamily: "Righteous",
                },
              },
            },
          ],
        },
      },
    },
  },
  {
    name: "⌨️ Text input",
    payload: {
      theme: {
        header: { color: "#fff", background: "#be123c", fontFamily: "Pacifico" },
        main: { background: "linear-gradient(180deg, #fb7185, #be123c)" },
      },
      ui: {
        header: { text: "Name your team" },
        main: {
          align: "center",
          components: [
            {
              type: "Text",
              props: {
                text: "What should we call you?",
                style: {
                  color: "#fff",
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  textAlign: "center",
                  fontFamily: "Pacifico",
                  margin: "0 0 18px",
                },
              },
            },
            {
              type: "TextInput",
              props: {
                event: "teamName",
                style: {
                  color: "#be123c",
                  background: "#fff",
                  border: "none",
                  borderRadius: "14px",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
                  fontSize: "1.4rem",
                  padding: "14px",
                  fontFamily: "Righteous",
                },
              },
            },
          ],
        },
      },
    },
  },
  {
    name: "↕️ Ranking",
    payload: {
      theme: {
        header: { color: "#1c1917", background: "#a3e635", fontFamily: "Bungee" },
        main: { background: "#1c1917" },
      },
      ui: {
        header: { text: "Rank your faves" },
        main: {
          align: "start",
          components: [
            {
              type: "Text",
              props: {
                text: "Drag to rank — best at the top 🍕",
                style: {
                  color: "#a3e635",
                  background: "transparent",
                  border: "none",
                  fontSize: "1.1rem",
                  textAlign: "center",
                  fontFamily: "Space Grotesk",
                  margin: "0 0 14px",
                },
              },
            },
            {
              type: "Sort",
              props: {
                event: "ranking",
                choices: [
                  { label: "🍕 Pizza", value: "pizza" },
                  { label: "🌮 Tacos", value: "tacos" },
                  { label: "🍔 Burger", value: "burger" },
                  { label: "🍣 Sushi", value: "sushi" },
                ],
                submit: { label: "Lock it in" },
                style: {
                  color: "#1c1917",
                  background: "#a3e635",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "1.1rem",
                  fontFamily: "Space Grotesk",
                  padding: "16px",
                  margin: "8px 0",
                },
              },
            },
          ],
        },
      },
    },
  },
];

const json = ref<any>(samples[0].payload);

const loadSample = (sample: { name: string; payload: any }) => {
  json.value = sample.payload;
  deviceConnection.value?.sendUpdate(sample.payload);
};

watch(json, (newValue) => {
  try {
    deviceConnection.value?.sendUpdate(JSON.parse(newValue as unknown as string));
  } catch {}
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <DeviceConnection ref="deviceConnection" :room-code="roomCode" />

    <div class="flex flex-col gap-2">
      <span class="text-sm text-muted">Start from a sample:</span>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="sample in samples"
          :key="sample.name"
          color="neutral"
          variant="subtle"
          size="sm"
          @click="loadSample(sample)"
        >
          {{ sample.name }}
        </UButton>
      </div>
    </div>

    <ClientOnly>
      <JsonEditorVue
        v-model="json"
        :mode="Mode.text"
        :main-menu-bar="false"
        :navigation-bar="false"
      />
    </ClientOnly>
  </div>
</template>
