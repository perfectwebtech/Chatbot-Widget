import { describe, expect, it } from "vitest";
import { isSafeUrl, markdownToSafeHtml, sanitizeHtml } from "../src/sanitize";

describe("isSafeUrl", () => {
  it("accepts http and https", () => {
    expect(isSafeUrl("https://example.com/a.png")).toBe(true);
    expect(isSafeUrl("http://example.com")).toBe(true);
    expect(isSafeUrl("/relative/path.png")).toBe(true);
  });

  it("rejects script-capable and malformed URLs", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeUrl("vbscript:msgbox")).toBe(false);
    expect(isSafeUrl("")).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl(42)).toBe(false);
  });
});

describe("sanitizeHtml", () => {
  it("strips scripts and event handlers", () => {
    const out = sanitizeHtml(
      '<img src=x onerror="alert(1)"><script>alert(2)</script><p onclick="x">hi</p>',
    );
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).toContain("hi");
  });

  it("removes images with unsafe sources and forbids iframes and forms", () => {
    const out = sanitizeHtml(
      '<img src="javascript:alert(1)"><iframe src="https://x"></iframe><form><input></form>',
    );
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<form");
    expect(out).not.toContain("<input");
  });

  it("hardens links", () => {
    const out = sanitizeHtml(
      '<a href="https://example.com">ok</a><a href="javascript:alert(1)">bad</a>',
    );
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
    expect(out).not.toContain("javascript:");
  });
});

describe("markdownToSafeHtml", () => {
  it("renders GFM", () => {
    const out = markdownToSafeHtml("**bold** and `code`\n\n- a\n- b\n\n| h |\n|---|\n| v |");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<code>code</code>");
    expect(out).toContain("<li>a</li>");
    expect(out).toContain("<table>");
  });

  it("neutralises XSS inside markdown", () => {
    const out = markdownToSafeHtml('[x](javascript:alert(1)) <img src=x onerror="alert(1)">');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("onerror");
  });
});
