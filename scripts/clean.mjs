import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const generatedDist = fileURLToPath(new URL("../dist", import.meta.url));
await rm(generatedDist, { recursive: true, force: true });
