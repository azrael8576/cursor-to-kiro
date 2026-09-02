import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ManifestEntry } from "../src/domain.js";
import { commitTransaction } from "../src/transaction/transaction.js";
import { generatedText } from "../src/util/text.js";
import { cleanupTemporary, tempDirectory } from "./helpers.js";

afterEach(cleanupTemporary);

describe("transaction rollback", () => {
  it("removes only files created by the failing transaction", async () => {
    const root = await tempDirectory();
    const blocker = path.join(root, "blocker");
    await writeFile(blocker, "pre-existing", "utf8");
    const entries: ManifestEntry[] = [
      {
        absolutePath: path.join(root, "created", "one.txt"),
        displayPath: "created/one.txt",
        bytes: generatedText("one"),
        artifactId: "a",
        semanticKey: "a",
      },
      {
        absolutePath: path.join(blocker, "nested", "two.txt"),
        displayPath: "blocker/nested/two.txt",
        bytes: generatedText("two"),
        artifactId: "b",
        semanticKey: "b",
      },
    ];
    await expect(
      commitTransaction(entries, { files: new Map() }),
    ).rejects.toMatchObject({ rollbackPerformed: true });
    const createdEntry = entries[0];
    if (!createdEntry)
      throw new Error("Test fixture must include a created entry");
    await expect(access(createdEntry.absolutePath)).rejects.toBeTruthy();
    await expect(access(blocker)).resolves.toBeUndefined();
  });
});
