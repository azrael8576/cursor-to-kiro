import type { MigrationScope } from "../domain.js";
import { keyMenu } from "./key-menu.js";

const OPTIONS: Array<{ label: string; value: MigrationScope }> = [
  { label: "Workspace", value: "workspace" },
  { label: "User", value: "user" },
  { label: "Both", value: "both" },
];

export async function promptScope(): Promise<MigrationScope | undefined> {
  const result = await keyMenu((index) => [
    "Cursor → Kiro Migration", "", "Select migration scope:", "",
    ...OPTIONS.map((option, item) => `${item === index ? "❯" : " "} ${option.label}`),
  ].join("\n"), OPTIONS.length);
  return result.cancelled ? undefined : OPTIONS[result.index]!.value;
}
