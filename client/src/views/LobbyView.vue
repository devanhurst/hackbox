<script setup lang="ts">
import { reactive, computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import {
  getUserId,
  getRoomCode,
  getUserName,
  setRoomCode,
  setRoomLegacy,
  setUserName,
  getTwitchAccessToken,
  deleteTwitchAccessToken,
} from "@/lib/browserStorage";
import router from "@/router";
import config from "@/config";
import { getRoom } from "@/lib/getRoom";
import type { FindRoomResponse } from "@/types";

interface TwitchData {
  id: number;
  username: string;
  photo: string;
}

const props = defineProps({
  windowHeight: String,
});

const twitchData = ref<TwitchData>();

const updateTwitchData = async (): Promise<void> => {
  const token = getTwitchAccessToken();
  if (!token) return;

  const response = await fetch(`https://api.twitch.tv/helix/users`, {
    headers: {
      Authorization: "Bearer " + token,
      "Client-Id": "qlfz8nlzzkq20jhl1xuawhza5xa3fm",
    },
  });

  if (response.ok) {
    const body = await response.json();
    const userData = body.data[0];

    twitchData.value = {
      id: userData.id,
      username: userData.display_name,
      photo: userData.profile_image_url,
    };
  } else {
    deleteTwitchAccessToken();
  }
};

const logOutOfTwitch = () => {
  const yes = confirm("Disconnect from Twitch?");
  if (yes) {
    twitchData.value = undefined;
    deleteTwitchAccessToken();
  }
};

const route = useRoute();

onMounted(() => {
  updateTwitchData();
  updateRoom();
});

const updateRoom = async () => {
  state.room = await getRoom({ roomCode: state.roomCode as string, userId: getUserId() });
};

const setRoomCodeFromInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const newRoomCode = target.value;
  state.roomCode = newRoomCode.toUpperCase();
  updateRoom();
};

const setUserNameFromInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const newUserName = target.value;
  state.userName = newUserName.toUpperCase();
};

const canJoin = computed(() => {
  if (state.userName.length === 0) return false;
  if (state.userName.length > 12) return false;
  return state.room.exists;
});

const joinGame = () => {
  if (state.room.twitchRequired && !getTwitchAccessToken()) {
    alert("Please log in with Twitch before joining this room.");
    return;
  }

  setRoomCode(state.roomCode as string);
  setUserName(state.userName as string);
  // Remember which backend this room is on so the player view connects with the
  // right transport (legacy socket.io vs the new relay).
  setRoomLegacy(!!state.room.legacy);

  router.push("/play");
};

const state = reactive({
  roomCode: route.query.room?.slice(0, 4) || getRoomCode(),
  userName: getUserName(),
  room: { exists: false, twitchRequired: false } as FindRoomResponse,
});

updateRoom();
</script>

<template>
  <div class="lobby-wrapper">
    <nav class="lobby-nav--wrapper">
      <div class="lobby-nav">
        <div class="lobby-nav--left"></div>
        <div class="lobby-nav--center">hackbox</div>
        <div class="lobby-nav--right">
          <div v-if="config.twitchClientId">
            <div v-if="!twitchData" class="twitch-icon--container__logged-out">
              <a
                :href="`https://id.twitch.tv/oauth2/authorize?client_id=${config.twitchClientId}&redirect_uri=${config.clientUrl}/twitch-auth-callback&response_type=token`"
              >
                <font-awesome-icon icon="fa-brands fa-twitch" class="twitch-icon" />
              </a>
            </div>
            <div
              v-else
              class="twitch-icon--container__logged-in"
              role="button"
              tabindex="0"
              @click="logOutOfTwitch"
            >
              <img class="twitch-photo" width="20" :src="twitchData.photo" />
              <font-awesome-icon icon="fa-brands fa-twitch" class="twitch-icon" />
            </div>
          </div>
        </div>
      </div>
    </nav>
    <section class="lobby-main--wrapper">
      <div class="lobby-main">
        <div class="input-area">
          <label>ROOM CODE</label>
          <input
            class="lobby-text-input"
            type="text"
            maxlength="4"
            :value="state.roomCode"
            @input="setRoomCodeFromInput"
          />
        </div>

        <div class="input-area">
          <label>NAME</label>
          <input
            class="lobby-text-input"
            type="text"
            maxlength="12"
            :value="state.userName"
            @input="setUserNameFromInput"
          />
        </div>

        <button @click="joinGame" :disabled="!canJoin">PLAY</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Fredoka+One&display=swap");

.lobby-wrapper {
  display: flex;
  flex-direction: column;
  background-color: #120a20;
  height: v-bind("props.windowHeight");
}

.lobby-nav--wrapper {
  display: flex;
  justify-content: center;
  min-height: 50px;
  max-height: 50px;
  color: white;
  background: #7c2fec;
}

.lobby-nav {
  display: flex;
  justify-content: center;
  width: 100%;
  min-width: 300px;
  max-width: 350px;
  align-items: center;
  font-size: 28px;
  font-weight: bold;
}

.lobby-nav--left {
  flex: 1;
  display: flex;
  justify-content: start;
}

.lobby-nav--center {
  flex: 1;
  display: flex;
  justify-content: center;
  font-family: "Fredoka One", "Helvetica", "sans-serif";
}

.lobby-nav--right {
  flex: 1;
  display: flex;
  justify-content: end;
}

.twitch-icon {
  color: white;
}

.twitch-icon--container__logged-in {
  cursor: pointer;
}

.twitch-photo {
  position: relative;
  left: 35px;
  top: 8px;
  z-index: 10;
  border-radius: 50%;
}

.lobby-main--wrapper {
  display: flex;
  justify-content: center;
  overflow: scroll;
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}

.lobby-main--wrapper::-webkit-scrollbar {
  display: none;
}

.lobby-main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  min-width: 300px;
  max-width: 350px;
  padding: 20px;
}

.input-area {
  display: flex;
  flex-direction: column;
  margin-block: 10px;
  margin-inline: 20px;
}

label {
  font-size: 18px;
  margin-left: 8px;
  margin-bottom: 6px;
  font-weight: 800;
  color: #dddddd;
}

.lobby-text-input {
  border: 0;
  font-size: 18px;
  background: #dddddd;
  padding: 10px;
  border-radius: 5px;
  font-weight: 800;
  text-transform: uppercase;
}

button {
  border: 0;
  border-radius: 5px;
  margin-top: 20px;
  font-size: 20px;
  font-weight: 800;
  margin-inline: 40px;
  padding: 20px;
  color: white;
  background: #7c2fec;
  opacity: 0.9;
  transition:
    color 0.2s,
    background 0.2s,
    opacity 0.2s;
}

button:disabled {
  color: #777777;
  background: #eeeeee;
}

button:hover {
  cursor: pointer;
}

button:hover:not(:disabled) {
  opacity: 1;
}

.host-link {
  display: flex;
  justify-content: center;
  margin-top: 30px;
  color: #7c2fec;
  font-size: 12px;
  text-decoration: none;
}
</style>
