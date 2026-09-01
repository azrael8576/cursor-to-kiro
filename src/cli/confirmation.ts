import { keyMenu } from "./key-menu.js";

export async function confirmMigration(): Promise<boolean> {
  const options = ["Migrate", "Cancel"];
  const result = await keyMenu((index) => [
    "Confirm migration", "",
    ...options.map((option, item) => `${item === index ? "❯" : " "} ${option}`),
  ].join("\n"), options.length);
  return !result.cancelled && result.index === 0;
}
