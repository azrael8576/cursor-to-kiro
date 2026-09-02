import { describe, expect, it } from "vitest";
import {
  AURORA_BACKGROUND,
  AURORA_BORDER,
  AURORA_COLORS,
  AURORA_SPARKS,
  LOGO_LINES,
  LOGO_NAME,
} from "../src/cli/theme.js";

describe("CLI visual identity", () => {
  it("uses the cursor-to-kiro ASCII banner instead of the skills banner", () => {
    expect(LOGO_LINES).toHaveLength(6);
    expect(LOGO_NAME).toBe("CURSOR-TO-KIRO");
    expect(AURORA_BACKGROUND).toBe("23");
    expect(AURORA_BORDER).toBe("30");
    expect(AURORA_COLORS).toEqual(["159", "86", "81"]);
    expect(AURORA_SPARKS).toBe("✦ · ✧");
  });
});
