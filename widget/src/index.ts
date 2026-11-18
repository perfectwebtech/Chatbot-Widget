/**
 * Public entry point.
 *
 * Script tag (auto-init from data attributes):
 *   <script src="chatbot-widget.iife.js" data-server-url="https://bot.example.com/webhooks/rest/webhook" data-bot-name="Ava" async></script>
 *
 * Programmatic:
 *   import { init } from "@perfectwebtech/chatbot-widget";
 *   const widget = init({ serverUrl: "…", botName: "Ava" });
 *   widget.openChat();
 *
 * Declarative:
 *   <chatbot-widget data-server-url="…"></chatbot-widget>
 */
import { configFromDataset, type PartialWidgetConfig } from "./config";
import { ChatbotWidgetElement } from "./widget";

export { ChatbotWidgetElement } from "./widget";
export { resolveConfig, DEFAULT_CONFIG, DEFAULT_MESSAGES } from "./config";
export type {
  WidgetConfig,
  PartialWidgetConfig,
  WidgetMessages,
  GreetingConfig,
  TransportKind,
} from "./config";
export type * from "./types";
export { RestTransport, SocketTransport } from "./transport";
export type { Transport, TransportEvents, SendOptions } from "./transport";
export { sanitizeHtml, markdownToSafeHtml, isSafeUrl } from "./sanitize";

export const version: string = __WIDGET_VERSION__;

/** Register the `<chatbot-widget>` element. Safe to call more than once. */
export function register(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(ChatbotWidgetElement.tagName)) {
    customElements.define(ChatbotWidgetElement.tagName, ChatbotWidgetElement);
  }
}

export interface InitOptions {
  /** Where to append the element. Defaults to `document.body`. */
  target?: Element;
}

/** Create, configure and mount a widget. Returns the element. */
export function init(
  config: PartialWidgetConfig = {},
  options: InitOptions = {},
): ChatbotWidgetElement {
  register();
  const element = document.createElement(ChatbotWidgetElement.tagName) as ChatbotWidgetElement;
  element.config = config;
  (options.target ?? document.body).appendChild(element);
  return element;
}

/** Find the first mounted widget on the page, if any. */
export function get(): ChatbotWidgetElement | null {
  return document.querySelector(ChatbotWidgetElement.tagName);
}

register();

// Auto-init when loaded via a classic <script> tag that carries data-server-url.
const currentScript =
  typeof document !== "undefined" ? (document.currentScript as HTMLScriptElement | null) : null;
if (
  currentScript &&
  currentScript.dataset.serverUrl &&
  currentScript.dataset.autoInit !== "false"
) {
  const config = configFromDataset(currentScript.dataset);
  delete (config as Record<string, unknown>).autoInit;
  const mount = () => init(config);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}
