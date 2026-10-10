// Runs after "vite build". Gives the service worker a cache name that is new for every build, so a new
// release replaces the old saved files instead of mixing with them.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../dist/sw.js", import.meta.url);
const stamped = readFileSync(file, "utf-8").replaceAll("__BUILD_ID__", Date.now().toString(36));
writeFileSync(file, stamped);
console.log("Service worker stamped:", stamped.match(/const CACHE = "([^"]+)"/)?.[1]);
