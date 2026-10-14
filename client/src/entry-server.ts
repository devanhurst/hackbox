import { createMemoryHistory } from "vue-router";
import { renderToString } from "vue/server-renderer";
import { createHackboxApp } from "./createApp";

export async function renderLobby() {
  const { app, router } = createHackboxApp(createMemoryHistory());
  await router.push("/");
  await router.isReady();
  return renderToString(app);
}
