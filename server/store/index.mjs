import fs from "node:fs/promises";
import { config, dataDir, storePath } from "../config.mjs";
import { timestamp } from "../utils/helpers.mjs";
import { normalizeStore, cloneSeed } from "./normalize.mjs";

export { normalizeStore } from "./normalize.mjs";

async function initializeStore() {
  const initialData = normalizeStore(cloneSeed());
  await writeStore(initialData);
  return initialData;
}

export async function readStore() {
  await fs.mkdir(dataDir, { recursive: true });
  let raw = "";
  try {
    raw = await fs.readFile(storePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return initializeStore();
    throw error;
  }
  try {
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    const corruptPath = `${storePath}.corrupt-${Date.now()}`;
    await fs.writeFile(corruptPath, raw, "utf8").catch(() => undefined);
    if (config.nodeEnv === "production") {
      throw new Error(`Data store is unreadable. Corrupt copy: ${corruptPath}`);
    }
    return initializeStore();
  }
}

export async function writeStore(data) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.copyFile(storePath, `${storePath}.bak`).catch(() => undefined);
  const tempPath = `${storePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  try {
    await fs.rename(tempPath, storePath);
  } catch (error) {
    if (process.platform !== "win32" || !["EPERM", "EACCES", "EEXIST"].includes(error?.code)) throw error;
    await fs.copyFile(tempPath, storePath);
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

let storeQueue = Promise.resolve();

export async function updateStore(updater) {
  const task = storeQueue.then(async () => {
    const data = await readStore();
    const result = await updater(data);
    await writeStore(data);
    return result;
  });
  storeQueue = task.catch(() => undefined);
  return task;
}

// Flush pending writes (for graceful shutdown)
export async function flushStore() {
  await storeQueue;
}
