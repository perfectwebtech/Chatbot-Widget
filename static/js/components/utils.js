/**
 * Shared helpers for the widget: configuration access, safe DOM construction,
 * HTML sanitisation and logging.
 *
 * Everything that renders bot or user content goes through this file so that
 * untrusted text never reaches the page as raw HTML.
 */

/** @returns {Object} the merged widget configuration */
function getConfig() {
  return window.CHATBOT_CONFIG;
}

/** Console logging, only when `debug` is enabled in the config. */
function log(...args) {
  if (getConfig().debug) {
    // eslint-disable-next-line no-console
    console.log("[chatbot-widget]", ...args);
  }
}

/** Report an error to the console (debug mode) and to the optional `onError` hook. */
function reportError(error, context) {
  if (getConfig().debug) {
    // eslint-disable-next-line no-console
    console.error("[chatbot-widget]", context, error);
  }
  const { onError } = getConfig();
  if (typeof onError === "function") {
    try {
      onError(error, context);
    } catch (hookError) {
      // never let a consumer hook break the widget
    }
  }
}

/** Coerce any value to a string, treating null/undefined as empty. */
function textOf(value) {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Returns true only for absolute or relative http(s) URLs.
 * Blocks `javascript:`, `data:` and other schemes that can execute code.
 * @param {*} url
 */
function isSafeUrl(url) {
  if (typeof url !== "string" || url.trim() === "") return false;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (e) {
    return false;
  }
}

/**
 * Small DOM builder. Attributes are set with setAttribute (never innerHTML),
 * string children become text nodes.
 * @param {String} tag
 * @param {Object} [attrs]
 * @param {Array|Node|String} [children]
 */
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  Object.keys(attrs || {}).forEach((key) => {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) return;
    if (key === "text") {
      node.textContent = textOf(value);
    } else if (key === "dataset") {
      Object.keys(value).forEach((dataKey) => {
        node.dataset[dataKey] = textOf(value[dataKey]);
      });
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  });
  const list = Array.isArray(children) ? children : [children];
  list.forEach((child) => {
    if (child === null || child === undefined) return;
    node.appendChild(
      typeof child === "string" ? document.createTextNode(child) : child
    );
  });
  return node;
}

/**
 * Builds an inline SVG icon from a Material Design icon path.
 * @param {String} pathData the `d` attribute of the icon path
 * @param {Object} [attrs] extra attributes for the <svg> element
 */
function svgIcon(pathData, attrs) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "1em");
  svg.setAttribute("height", "1em");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  Object.keys(attrs || {}).forEach((key) => svg.setAttribute(key, attrs[key]));
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", pathData);
  svg.appendChild(path);
  return svg;
}

/** Material Design icon paths used by the widget (Apache 2.0). */
const ICONS = {
  openInNew:
    "M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
  chevronLeft:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2 14.59L12.59 18 6.59 12l6-6L14 7.41 9.41 12 14 16.59z",
  chevronRight:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.59L8.59 15.17 13.17 12 8.59 8.83 10 7.41 14.59 12 10 16.59z",
  pdf: "M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z",
};

/* ------------------------------------------------------------------------ */
/* HTML sanitisation                                                         */
/* ------------------------------------------------------------------------ */

/** Markdown converter shared by every component that renders bot text. */
const markdownConverter = new showdown.Converter({
  simplifiedAutoLink: true,
  strikethrough: true,
  tables: true,
  tasklists: true,
  openLinksInNewWindow: true,
});

// Harden links and images produced by Markdown or returned by the bot.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    const href = node.getAttribute("href");
    if (href && !isSafeUrl(href) && !href.startsWith("#")) {
      node.removeAttribute("href");
    }
    if (node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  }
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src");
    if (!isSafeUrl(src)) {
      node.remove();
    }
  }
});

const SANITIZE_OPTIONS = {
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
  ],
  FORBID_ATTR: ["style", "onerror", "onload", "formaction"],
  ADD_ATTR: ["target"],
};

/**
 * Sanitises a fragment of HTML so it can be inserted with innerHTML.
 * @param {String} html
 * @returns {String} safe HTML
 */
function sanitizeHtml(html) {
  return DOMPurify.sanitize(textOf(html), SANITIZE_OPTIONS);
}

/**
 * Converts Markdown to sanitised HTML.
 * @param {String} markdown
 */
function markdownToSafeHtml(markdown) {
  return sanitizeHtml(markdownConverter.makeHtml(textOf(markdown)));
}

/* ------------------------------------------------------------------------ */
/* Chat DOM helpers                                                          */
/* ------------------------------------------------------------------------ */

/** @returns {HTMLElement} the scrolling chat log */
function chatLog() {
  return document.getElementById("chats");
}

/** Scroll the chat log to the latest message. */
function scrollToBottomOfResults() {
  const chats = chatLog();
  if (chats) chats.scrollTop = chats.scrollHeight;
}

/** @returns {HTMLElement} a float clearing div */
function clearfix() {
  return el("div", { class: "clearfix" });
}

/**
 * Append nodes to the chat log with the configured fade-in.
 * @param {Node|Array<Node>} nodes
 */
function appendToChat(nodes) {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  const fade = getConfig().messageFadeMs;
  list.forEach((node) => {
    if (fade > 0) {
      $(node).hide().appendTo(chatLog()).fadeIn(fade);
    } else {
      chatLog().appendChild(node);
    }
  });
  scrollToBottomOfResults();
}

/** @returns {HTMLImageElement} the avatar shown beside bot messages */
function botAvatarImg() {
  return el("img", {
    class: "botAvatar",
    src: getConfig().botAvatar,
    alt: "",
  });
}
