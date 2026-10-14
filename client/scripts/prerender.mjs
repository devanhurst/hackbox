import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}dist`;
const ssrDir = `${root}dist-ssr`;

const { renderLobby } = await import(pathToFileURL(`${ssrDir}/entry-server.mjs`).href);
const html = await readFile(`${dist}/index.html`, "utf8");

const placeholder = '<div id="app"></div>';
if (!html.includes(placeholder)) throw new Error(`index.html has no ${placeholder}`);

// The empty shell serves every path other than the lobby (see worker/index.js).
await copyFile(`${dist}/index.html`, `${dist}/200.html`);
await writeFile(
  `${dist}/index.html`,
  html.replace(placeholder, `<div id="app">${await renderLobby()}</div>`),
);
await rm(ssrDir, { recursive: true });
