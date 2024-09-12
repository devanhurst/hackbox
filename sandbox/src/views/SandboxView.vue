<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import router from "@/router";
import { json } from "@codemirror/lang-json";
import initializeHostSocket from "@/lib/sockets/hostSocket";
import type { Message } from "@/types";
import presets from "./presets";
import GameState from "@/lib/GameState";

const roomCode = router.currentRoute.value.params.roomCode as string;
const state = reactive(new GameState(roomCode));
const { socket } = initializeHostSocket(router, state);

const playerStateInput = ref("");

const linterUrl = computed(() => {
  const encodedJson = encodeURIComponent(playerStateInput.value);
  return `https://jsonlint.com/?json=${encodedJson}`;
});

const updateMemberState = (userId: string) => {
  const json = JSON.parse(playerStateInput.value);
  window.setTimeout(() => {
    socket?.emit("member.update", {
      to: userId,
      data: json,
    });
  }, 500);
};

const members = computed(() =>
  Object.keys(state.members).map((key) => state.members[key])
);

const latestMessages = computed(() =>
  Object.keys(state.members).reduce((acc, key) => {
    const userMessages = state.messages.filter((msg) => msg.from === key);
    const latestMessage = userMessages.at(-1);
    acc[key] = latestMessage;
    return acc;
  }, {} as { [key: string]: Message | undefined })
);
</script>

<template>
  <h1>Sandbox {{ router.currentRoute.value.params.roomCode }}</h1>

  <h3>Members</h3>
  <p v-if="!Object.keys(state.members).length">None</p>
  <table v-else>
    <tr>
      <th>Send Message</th>
      <th>Name</th>
      <th>Last response</th>
      <th>Received at</th>
    </tr>
    <tr v-for="member in members" :key="member.id">
      <td>
        <button @click="() => updateMemberState(member.id)">Update</button>
      </td>
      <td>{{ member.online ? "✅" : "⛔️" }} {{ member.name }}</td>
      <td>
        {{ latestMessages[member.id]?.message.value }}
      </td>
      <td>
        {{ latestMessages[member.id]?.timestamp }}
      </td>
    </tr>
  </table>
  <br />
  <br />
  <label for="presets">Presets</label>
  <select id="presets" v-model="playerStateInput">
    <option v-for="preset in presets" :value="preset.value" :key="preset.name">
      {{ preset.name }}
    </option>
  </select>
  <br />
  <br />
  <a class="lint-link" :href="linterUrl" target="_blank"> Validate JSON </a>
  <br />
  <br />
  <codemirror
    v-model="playerStateInput"
    placeholder="Add your layout here, or pick a preset..."
    :autofocus="true"
    :indent-with-tab="true"
    :tab-size="2"
    :extensions="json()"
    style="text-align: start"
  />
</template>

<style>
textarea {
  height: 500px;
  min-width: 400px;
  max-width: 1000px;
  width: 100%;
  margin: 10px;
}

.lint-link {
  display: block;
}
</style>
