import { describe, expect, it } from "vitest";
import { countryFlag } from "@/lib/country-flag";

describe("countryFlag", () => {
  it("converts uppercase ISO alpha-2 to flag emoji", () => {
    expect(countryFlag("FR")).toBe("🇫🇷");
    expect(countryFlag("US")).toBe("🇺🇸");
    expect(countryFlag("JP")).toBe("🇯🇵");
  });

  it("accepts lowercase and mixed case", () => {
    expect(countryFlag("fr")).toBe("🇫🇷");
    expect(countryFlag("Us")).toBe("🇺🇸");
  });

  it("returns empty string for invalid input", () => {
    expect(countryFlag("")).toBe("");
    expect(countryFlag("X")).toBe("");
    expect(countryFlag("ABC")).toBe("");
  });
});
