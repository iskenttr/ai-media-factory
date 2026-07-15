import { describe, expect, it } from "vitest";
import { normalizeAndSplitWords, normalizeText } from "./text-utils";

describe("normalizeText", () => {
  describe("NFC Unicode normalization", () => {
    it("normalizes composed characters to NFC form", () => {
      // Latin small letter I with acute (composed: U+00ED, decomposed: U+0069 U+0301)
      const decomposed = "\u0069\u0301"; // i + combining acute
      const composed = "\u00ed"; // í
      expect(normalizeText(decomposed)).toBe(composed);
    });

    it("handles Turkish characters correctly", () => {
      // Turkish dotted i (ı) and dotless i (ı vs i)
      expect(normalizeText("\u0131")).toBe("\u0131"); // LATIN SMALL LETTER DOTLESS I
      expect(normalizeText("\u0069")).toBe("\u0069"); // LATIN SMALL LETTER I
    });

    it("normalizes Turkish-specific characters", () => {
      const turkish = "Merhaba Dünya"; // Hello World in Turkish
      expect(normalizeText(turkish)).toBe(turkish);

      const withDiaeresis = "İstanbul"; // Istanbul with dotted I
      expect(normalizeText(withDiaeresis)).toBe(withDiaeresis);
    });

    it("handles combined Turkish diacritics", () => {
      // S with cedilla (composed vs decomposed)
      const decomposed = "\u0053\u0327"; // S + combining cedilla
      const composed = "\u015e"; // Ş
      expect(normalizeText(decomposed)).toBe(composed);
    });
  });

  describe("whitespace normalization", () => {
    it("collapses repeated spaces", () => {
      expect(normalizeText("hello    world")).toBe("hello world");
    });

    it("trims leading whitespace", () => {
      expect(normalizeText("   hello")).toBe("hello");
    });

    it("trims trailing whitespace", () => {
      expect(normalizeText("hello   ")).toBe("hello");
    });

    it("collapses tabs to single space", () => {
      expect(normalizeText("hello\tworld")).toBe("hello world");
    });

    it("collapses newlines to single space", () => {
      expect(normalizeText("hello\nworld")).toBe("hello world");
    });

    it("handles mixed whitespace", () => {
      expect(normalizeText("  hello \n\t world  ")).toBe("hello world");
    });

    it("collapses multiple newlines", () => {
      expect(normalizeText("hello\n\n\n\nworld")).toBe("hello world");
    });
  });

  describe("Unicode whitespace handling (with /gu flag)", () => {
    it("handles non-breaking space (U+00A0)", () => {
      expect(normalizeText("hello\u00a0world")).toBe("hello world");
    });

    it("handles em space (U+2003)", () => {
      expect(normalizeText("hello\u2003world")).toBe("hello world");
    });

    it("handles ideographic space (U+3000)", () => {
      expect(normalizeText("hello\u3000world")).toBe("hello world");
    });

    it("handles thin space (U+2009)", () => {
      expect(normalizeText("hello\u2009world")).toBe("hello world");
    });

    it("handles hair space (U+200A)", () => {
      expect(normalizeText("hello\u200Aworld")).toBe("hello world");
    });

    it("handles Ogham space mark (U+1680)", () => {
      expect(normalizeText("hello\u1680world")).toBe("hello world");
    });

    // Note: U+180E (Mongolian Vowel Separator) was removed from Unicode whitespace
    // category in Unicode 6.3.0 and is NOT matched by \s in modern JavaScript engines.
    // See: https://unicode.org/reports/tr31/#Mongolian_Vowel_Separator

    it("collapses mixed Unicode whitespace", () => {
      const mixed = `hello\u00a0\u2003\u3000world`;
      expect(normalizeText(mixed)).toBe("hello world");
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(normalizeText("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(normalizeText("   ")).toBe("");
      expect(normalizeText("\t\n")).toBe("");
      expect(normalizeText("\u00a0\u2003")).toBe("");
    });

    it("handles single character", () => {
      expect(normalizeText("a")).toBe("a");
    });

    it("handles single space", () => {
      expect(normalizeText(" ")).toBe("");
    });

    it("returns empty string for empty string after normalization", () => {
      expect(normalizeText("\u00a0")).toBe("");
    });

    it("preserves word boundaries correctly", () => {
      expect(normalizeText("hello world")).toBe("hello world");
      expect(normalizeText("hello   world")).toBe("hello world");
    });
  });

  describe("real-world subtitle scenarios", () => {
    it("normalizes subtitle cue text", () => {
      const subtitleCue = "   Merhaba dünya!  \n\n  Hoşçakal  ";
      expect(normalizeText(subtitleCue)).toBe("Merhaba dünya! Hoşçakal");
    });

    it("handles ASS subtitle formatting artifacts", () => {
      const assText = "{\\an8}  Hello  World  ";
      expect(normalizeText(assText)).toBe("{\\an8} Hello World");
    });

    it("preserves ASS override tags", () => {
      const assText = "{\\fad(200,200)}Bu bir test";
      expect(normalizeText(assText)).toBe("{\\fad(200,200)}Bu bir test");
    });
  });
});

describe("normalizeAndSplitWords", () => {
  it("splits normalized text into words", () => {
    expect(normalizeAndSplitWords("hello world")).toEqual(["hello", "world"]);
  });

  it("filters out empty strings", () => {
    expect(normalizeAndSplitWords("hello  world")).toEqual(["hello", "world"]);
  });

  it("handles Turkish text", () => {
    expect(normalizeAndSplitWords("Merhaba Dünya")).toEqual(["Merhaba", "Dünya"]);
  });

  it("handles empty input", () => {
    expect(normalizeAndSplitWords("")).toEqual([]);
  });

  it("handles whitespace-only input", () => {
    expect(normalizeAndSplitWords("   ")).toEqual([]);
  });

  it("normalizes before splitting", () => {
    expect(normalizeAndSplitWords("  hello\u00a0world  ")).toEqual(["hello", "world"]);
  });

  it("handles single word", () => {
    expect(normalizeAndSplitWords("hello")).toEqual(["hello"]);
  });

  it("handles newlines in input", () => {
    expect(normalizeAndSplitWords("hello\nworld")).toEqual(["hello", "world"]);
  });
});
