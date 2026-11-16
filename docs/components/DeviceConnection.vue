<template>
  <div v-if="!connected" class="text-center">
    <UButton @click="createRoom" :loading="loading" size="xl" label="Create Room" />
  </div>

  <UCard v-else class="shadow-lg">
    <div class="text-center space-y-4">
      <div
        class="flex items-center justify-center space-x-4 text-3xl font-mono font-bold text-primary tracking-wider"
      >
        <span>{{ roomCode }}</span>
      </div>

      <div class="pt-4 border-t">
        <p class="text-sm text-gray-600 mb-2">Connected Players: {{ connectedPlayers.length }}</p>
        <div v-if="connectedPlayers.length > 0" class="space-y-2">
          <UCard v-for="player in connectedPlayers" :key="player.id" class="p-3">
            <div class="flex items-center justify-between">
              <UBadge color="neutral" variant="subtle" size="md">
                {{ player.name }}
              </UBadge>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { createHackboxSocket, type HackboxSocket } from "~/utils/hackboxSocket";
import { siblingPreviewHost } from "~/utils/previewHosts";

const config = useRuntimeConfig();

const props = defineProps<{
  roomCode: string | null;
}>();

const socket = ref<HackboxSocket | null>(null);
const connected = ref(false);
const loading = ref(false);
const connectedPlayers = ref<any[]>([]);

const hostId = crypto.randomUUID();
const localRoomCode = ref<string | null>(null);

const roomCode = computed(() => localRoomCode.value || props.roomCode);

// A Preview of the docs is served on workers.dev, which has no /api or /r
// routes of its own. A branch Preview talks to the same branch's api and relay
// Previews; a deployment URL has no branch to match, so it uses production.
function previewHost(worker: string): string | undefined {
  const hostname = window.location.hostname;
  if (!hostname.endsWith(".workers.dev")) return undefined;
  return siblingPreviewHost(hostname, "hackbox-docs", worker) ?? "hackbox.ca";
}

function resolveEndpoints() {
  if (import.meta.dev) {
    return {
      apiUrl: config.public.apiUrl || "http://localhost:8787/api",
      relayHost: config.public.relayHost || "localhost:1999",
    };
  }
  const apiHost = previewHost("hackbox-api");
  const apiUrl =
    config.public.apiUrl || (apiHost ? `https://${apiHost}/api` : `${window.location.origin}/api`);
  const relayHost = config.public.relayHost || previewHost("hackbox-relay") || window.location.host;
  return { apiUrl, relayHost };
}

async function createRoom() {
  loading.value = true;

  try {
    const { apiUrl, relayHost } = resolveEndpoints();

    const response = await fetch(`${apiUrl}/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hostId,
      }),
    });

    const data = await response.json();

    if (!data.ok || !data.roomCode) {
      console.error("Failed to create room:", data.error);
      loading.value = false;
      return;
    }

    localRoomCode.value = data.roomCode;

    socket.value = createHackboxSocket({
      host: relayHost,
      roomCode: data.roomCode,
      userId: hostId,
    });

    socket.value.on("state.host", (state: any) => {
      connected.value = true;
      loading.value = false;
      connectedPlayers.value = Object.values(state.members).filter((m: any) => m.online);
    });
  } catch (error) {
    console.error("Failed to create room:", error);
    loading.value = false;
  }
}

onBeforeUnmount(() => {
  socket.value?.close();
});

defineExpose({
  sendUpdate(data: any) {
    if (socket.value && connectedPlayers.value.length > 0) {
      const playerIds = connectedPlayers.value.map((p) => p.id);
      socket.value.emit("member.update", {
        to: playerIds,
        data,
      });
    }
  },
});
</script>
