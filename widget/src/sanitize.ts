import DOMPurify, { type Config as PurifyConfig } from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/** True for http(s) URLs only. Blocks `javascript:`, `data:`, `vbscript:` etc. */
export function isSafeUrl(url: unknown): boolean {
  if (typeof url !== "string" || url.trim() === "") return false;
  try {
    const parsed = new URL(
      url,
      typeof location !== "undefined" ? location.href : "http://localhost/",
    );
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href");
      if (href && !isSafeUrl(href) && !href.startsWith("#")) node.removeAttribute("href");
      if (node.hasAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
    if (node.tagName === "IMG" && !isSafeUrl(node.getAttribute("src"))) {
      node.remove();
    }
  });
}

const SANITIZE_OPTIONS: PurifyConfig = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    "style",
    "iframe",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "object",
    "embed",
    "svg",
    "math",
    "video",
    "audio",
    "link",
    "meta",
  ],
  FORBID_ATTR: ["style", "formaction", "xlink:href"],
  ADD_ATTR: ["target"],
};

/** Sanitise an HTML string for insertion with innerHTML. */
export function sanitizeHtml(html: string): string {
  installHooks();
  return String(DOMPurify.sanitize(html ?? "", SANITIZE_OPTIONS));
}

/** Convert Markdown (GFM) to sanitised HTML. */
export function markdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown ?? "", { async: false }) as string;
  return sanitizeHtml(html);
}

/** Create an element with sanitised Markdown content. */
export function markdownNode(
  markdown: string,
  tag: keyof HTMLElementTagNameMap = "div",
): HTMLElement {
  const node = document.createElement(tag);
  node.innerHTML = markdownToSafeHtml(markdown);
  return node;
}
