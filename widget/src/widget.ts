import {
  configFromDataset,
  resolveConfig,
  type PartialWidgetConfig,
  type WidgetConfig,
} from "./config";
import { h, icon, ICONS, uuid } from "./dom";
import {
  botRow,
  botTextBubble,
  renderMessage,
  TRANSIENT_CLASS,
  userRow,
  type RenderContext,
} from "./renderers";
import { isSafeUrl, markdownToSafeHtml } from "./sanitize";
import styles from "./styles.css?inline";
import { createTransport, type Transport } from "./transport";
import type { RasaMessage, WidgetEvent } from "./types";

let sharedSheet: CSSStyleSheet | null = null;

function adoptStyles(root: ShadowRoot): void {
  if ("adoptedStyleSheets" in Document.prototype && typeof CSSStyleSheet !== "undefined") {
    try {
      if (!sharedSheet) {
        sharedSheet = new CSSStyleSheet();
        sharedSheet.replaceSync(styles);
      }
      root.adoptedStyleSheets = [sharedSheet];
      return;
    } catch {
      // fall through to a <style> element
    }
  }
  root.appendChild(h("style", { text: styles }));
}

/**
 * `<chatbot-widget>` custom element.
 *
 * Usage: `ChatbotWidget.init({ serverUrl: "…" })` or
 * `<chatbot-widget data-server-url="…"></chatbot-widget>`.
 */
export class ChatbotWidgetElement extends HTMLElement {
  static readonly tagName = "chatbot-widget";

  #config: WidgetConfig = resolveConfig();
  #pending: PartialWidgetConfig | null = null;
  #transport: Transport | null = null;
  #senderId = "";
  #root: ShadowRoot;
  #rendered = false;
  #open = false;
  #initialSent = false;
  #busy = false;
  #queue: string[] = [];
  #restarting = false;
  #streamBubble: HTMLElement | null = null;
  #streamText = "";
  #lastStreamedText: string | null = null;
  #greetingTimer: ReturnType<typeof setTimeout> | null = null;
  #unsubscribe: Array<() => void> = [];

  // shell references
  #launcher!: HTMLButtonElement;
  #panel!: HTMLElement;
  #log!: HTMLElement;
  #input!: HTMLTextAreaElement;
  #sendBtn!: HTMLButtonElement;
  #typing!: HTMLElement;
  #greeting!: HTMLElement;
  #banner!: HTMLElement;
  #modal!: HTMLElement;
  #modalBody!: HTMLElement;
  #title!: HTMLElement;
  #headerAvatar!: HTMLElement;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    adoptStyles(this.#root);
  }

  /** Current (fully resolved) configuration. */
  get config(): WidgetConfig {
    return this.#config;
  }

  /** Replace the configuration. Safe to call before or after the element is connected. */
  set config(value: PartialWidgetConfig) {
    this.#pending = value;
    if (this.isConnected) this.#applyConfig();
  }

  get open(): boolean {
    return this.#open;
  }

  get senderId(): string {
    return this.#senderId;
  }

  connectedCallback(): void {
    if (!this.#rendered) {
      this.#renderShell();
      this.#rendered = true;
    }
    this.#applyConfig();
  }

  disconnectedCallback(): void {
    this.#teardownTransport();
    if (this.#greetingTimer) clearTimeout(this.#greetingTimer);
  }

  /* ------------------------------------------------------------------ */
  /* public API                                                          */
  /* ------------------------------------------------------------------ */

  openChat(): void {
    if (this.#open) return;
    this.#open = true;
    this.setAttribute("open", "");
    this.#panel.hidden = false;
    this.#greeting.hidden = true;
    this.#launcher.setAttribute("aria-expanded", "true");
    this.#input.focus();
    this.#scrollToBottom();
    this.#emit({ type: "open" });
    if (!this.#initialSent && this.#config.initialPayload) {
      this.#initialSent = true;
      void this.send(this.#config.initialPayload, "");
    }
  }

  closeChat(): void {
    if (!this.#open) return;
    this.#open = false;
    this.removeAttribute("open");
    this.#panel.hidden = true;
    this.#launcher.setAttribute("aria-expanded", "false");
    this.#launcher.focus();
    this.#emit({ type: "close" });
  }

  toggle(): void {
    if (this.#open) this.closeChat();
    else this.openChat();
  }

  /**
   * Send a message to the bot. `displayText` is what the user bubble shows
   * (defaults to `payload`; pass `""` to send silently, e.g. for intents).
   * Messages sent while a reply is pending are queued and delivered in order.
   */
  async send(payload: string, displayText: string = payload): Promise<void> {
    const text = payload.trim();
    if (!text) return;
    this.#clearTransient();
    if (displayText) this.#append(userRow(displayText, this.#config));
    this.#emit({ type: "message-sent", text: displayText, payload: text });
    this.#queue.push(text);
    if (!this.#busy) await this.#drain();
  }

  async #drain(): Promise<void> {
    this.#setBusy(true);
    try {
      while (this.#queue.length) {
        const text = this.#queue.shift()!;
        this.#showTyping();
        try {
          await this.#ensureTransport().send(text);
        } catch (error) {
          this.#hideTyping();
          this.#appendBotText(this.#config.messages.fallback);
          this.#emit({ type: "error", error, context: "send" });
        }
      }
    } finally {
      this.#setBusy(false);
    }
  }

  /** Clear the screen and send `/restart` to Rasa. */
  async restart(): Promise<void> {
    this.#queue.length = 0;
    this.clear();
    this.#emit({ type: "restart" });
    this.#initialSent = false;
    this.#restarting = true;
    this.#showTyping();
    this.#setBusy(true);
    try {
      await this.#ensureTransport().send("/restart");
    } catch (error) {
      this.#emit({ type: "error", error, context: "restart" });
    } finally {
      this.#restarting = false;
      this.#hideTyping();
      this.#setBusy(false);
      if (this.#config.initialPayload) {
        this.#initialSent = true;
        void this.send(this.#config.initialPayload, "");
      }
    }
  }

  /** Remove every message from the screen without telling the bot. */
  clear(): void {
    this.#log.replaceChildren(this.#typing);
    this.#hideTyping();
    this.#streamBubble = null;
    this.#streamText = "";
    this.#lastStreamedText = null;
    this.#emit({ type: "clear" });
  }

  /** Render bot messages produced elsewhere (e.g. a proactive campaign). */
  receive(messages: RasaMessage[]): void {
    this.#handleMessages(messages);
  }

  /* ------------------------------------------------------------------ */
  /* internals                                                           */
  /* ------------------------------------------------------------------ */

  #applyConfig(): void {
    const fromAttributes = configFromDataset(this.dataset);
    this.#config = resolveConfig({ ...fromAttributes, ...(this.#pending ?? {}) });
    const config = this.#config;

    this.#senderId = config.senderId ?? this.#loadSenderId();
    this.#teardownTransport();

    this.setAttribute("position", config.position);
    if (config.theme === "auto") this.removeAttribute("theme");
    else this.setAttribute("theme", config.theme);
    if (config.primaryColor) this.style.setProperty("--cw-primary", config.primaryColor);

    const { messages } = config;
    this.#title.textContent = config.botName;
    this.#launcher.setAttribute("aria-label", messages.open);
    this.#launcher.replaceChildren(
      isSafeUrl(config.launcherAvatar)
        ? h("img", { src: config.launcherAvatar, alt: "" })
        : icon(ICONS.chat),
    );
    this.#headerAvatar.replaceChildren(
      isSafeUrl(config.botAvatar)
        ? h("img", { src: config.botAvatar, alt: "", class: "cw-header__avatar" })
        : icon(ICONS.bot),
    );
    this.#input.placeholder = messages.inputPlaceholder;
    this.#input.setAttribute("aria-label", messages.inputPlaceholder);
    this.#sendBtn.setAttribute("aria-label", messages.send);
    this.#typing.setAttribute("aria-label", messages.typing);
    this.#banner.textContent = messages.offline;
    this.#root.querySelector(".cw-action--restart")?.setAttribute("aria-label", messages.restart);
    this.#root.querySelector(".cw-action--clear")?.setAttribute("aria-label", messages.clear);
    this.#root.querySelector(".cw-action--close")?.setAttribute("aria-label", messages.close);

    this.#greeting.querySelector(".cw-greeting__title")!.textContent = config.greeting.title;
    this.#greeting.querySelector(".cw-greeting__text")!.textContent = config.greeting.text;
    if (this.#greetingTimer) clearTimeout(this.#greetingTimer);
    const showGreeting = config.greeting.enabled && !config.openOnLoad && !this.#open;
    this.#greeting.hidden = !showGreeting;
    if (showGreeting && config.greeting.durationMs > 0) {
      this.#greetingTimer = setTimeout(() => {
        this.#greeting.hidden = true;
      }, config.greeting.durationMs);
    }

    this.#emit({ type: "ready" });
    if (config.openOnLoad) this.openChat();
  }

  #loadSenderId(): string {
    const { persistSession, storageKey } = this.#config;
    const key = `${storageKey}:sender`;
    if (persistSession) {
      try {
        const existing = localStorage.getItem(key);
        if (existing) return existing;
      } catch {
        // storage unavailable (private mode, blocked) — fall back to in-memory id
      }
    }
    const id = uuid();
    if (persistSession) {
      try {
        localStorage.setItem(key, id);
      } catch {
        // ignore
      }
    }
    return id;
  }

  #ensureTransport(): Transport {
    if (this.#transport) return this.#transport;
    const transport = createTransport(this.#config, this.#senderId);
    this.#unsubscribe = [
      transport.on("message", (messages) => this.#handleMessages(messages)),
      transport.on("chunk", ({ text }) => this.#handleChunk(text)),
      transport.on("streamEnd", () => this.#finishStream()),
      transport.on("connected", () => {
        this.#banner.hidden = true;
      }),
      transport.on("disconnected", () => {
        if (transport.kind === "socketio") this.#banner.hidden = false;
      }),
      transport.on("error", ({ error, context }) => {
        this.#log_(`transport error (${context})`, error);
        this.#emit({ type: "error", error, context });
      }),
    ];
    this.#transport = transport;
    void transport.connect().catch((error) => {
      this.#emit({ type: "error", error, context: "connect" });
    });
    return transport;
  }

  #teardownTransport(): void {
    this.#unsubscribe.forEach((off) => off());
    this.#unsubscribe = [];
    this.#transport?.disconnect();
    this.#transport?.removeAll();
    this.#transport = null;
  }

  #renderContext(): RenderContext {
    return {
      config: this.#config,
      send: (payload, displayText) => void this.send(payload, displayText ?? payload),
      openModal: (content, label) => this.#openModal(content, label),
      setInputDisabled: (disabled) => this.#setInputDisabled(disabled),
      log: (...args) => this.#log_(...args),
    };
  }

  #handleMessages(incoming: RasaMessage[]): void {
    this.#hideTyping();
    if (this.#streamBubble) {
      // the final message supersedes the streamed draft
      this.#streamBubble.closest(".cw-row")?.remove();
      this.#streamBubble = null;
      this.#streamText = "";
      this.#lastStreamedText = null;
    }
    // Rasa Pro 3.18–3.20 send the assembled text again after stream_end; drop that echo.
    const messages = incoming.filter((message) => {
      if (this.#lastStreamedText === null) return true;
      const onlyText =
        typeof message.text === "string" &&
        !message.image &&
        !message.buttons &&
        !message.attachment &&
        !message.custom;
      if (onlyText && message.text!.trim() === this.#lastStreamedText.trim()) {
        this.#lastStreamedText = null;
        return false;
      }
      return true;
    });
    if (messages.length) this.#lastStreamedText = null;
    if (!messages.length) {
      // an empty reply is normal after /restart and after a de-duplicated stream echo
      if (incoming.length || this.#restarting) return;
      this.#appendBotText(this.#config.messages.fallback);
      return;
    }
    const ctx = this.#renderContext();
    for (const message of messages) {
      for (const row of renderMessage(message, ctx)) this.#append(row);
    }
    this.#emit({ type: "message-received", messages });
    if (this.#open) this.#input.focus();
  }

  #handleChunk(text: string): void {
    this.#hideTyping();
    if (!this.#streamBubble) {
      const bubble = h("div", { class: "cw-bubble cw-bubble--bot cw-bubble--streaming" });
      this.#streamBubble = bubble;
      this.#streamText = "";
      this.#append(botRow(bubble, this.#config));
    }
    this.#streamText += text;
    this.#streamBubble.textContent = this.#streamText;
    this.#scrollToBottom();
  }

  #finishStream(): void {
    if (!this.#streamBubble) return;
    this.#streamBubble.classList.remove("cw-bubble--streaming");
    this.#streamBubble.innerHTML = markdownToSafeHtml(this.#streamText);
    this.#emit({ type: "message-received", messages: [{ text: this.#streamText }] });
    this.#lastStreamedText = this.#streamText;
    this.#streamBubble = null;
    this.#streamText = "";
  }

  #appendBotText(text: string): void {
    this.#append(botRow(botTextBubble(text), this.#config));
  }

  #append(row: HTMLElement): void {
    this.#log.insertBefore(row, this.#typing);
    this.#scrollToBottom();
  }

  #clearTransient(): void {
    this.#log.querySelectorAll(`.${TRANSIENT_CLASS}`).forEach((node) => node.remove());
  }

  #showTyping(): void {
    this.#typing.hidden = false;
    this.#scrollToBottom();
  }

  #hideTyping(): void {
    this.#typing.hidden = true;
  }

  /** While a reply is pending the user may keep typing; only sending is blocked. */
  #setBusy(busy: boolean): void {
    this.#busy = busy;
    this.#sendBtn.disabled = busy || this.#input.disabled;
  }

  /** Used by payloads such as `location` that must block input until they resolve. */
  #setInputDisabled(disabled: boolean): void {
    this.#input.disabled = disabled;
    this.#sendBtn.disabled = disabled || this.#busy;
    if (!disabled && this.#open) this.#input.focus();
  }

  #scrollToBottom(): void {
    this.#log.scrollTop = this.#log.scrollHeight;
  }

  #openModal(content: HTMLElement, label: string): void {
    this.#modalBody.replaceChildren(content);
    this.#modal.querySelector(".cw-modal__dialog")?.setAttribute("aria-label", label);
    this.#modal.hidden = false;
    (this.#modal.querySelector(".cw-modal__close") as HTMLElement | null)?.focus();
  }

  #closeModal(): void {
    this.#modal.hidden = true;
    this.#modalBody.replaceChildren();
    this.#input.focus();
  }

  #submit(): void {
    const text = this.#input.value;
    if (!text.trim()) return;
    this.#input.value = "";
    this.#autosize();
    void this.send(text.trim());
  }

  #autosize(): void {
    this.#input.style.height = "auto";
    this.#input.style.height = `${Math.min(this.#input.scrollHeight, 120)}px`;
  }

  #emit(event: WidgetEvent): void {
    try {
      this.#config.onEvent?.(event);
    } catch (error) {
      this.#log_("onEvent hook failed", error);
    }
    this.dispatchEvent(
      new CustomEvent(`chatbot-widget:${event.type}`, {
        detail: event,
        bubbles: true,
        composed: true,
      }),
    );
  }

  #log_(...args: unknown[]): void {
    if (this.#config.debug) console.warn("[chatbot-widget]", ...args);
  }

  #renderShell(): void {
    const actionButton = (name: string, pathData: string, handler: () => void) => {
      const button = h(
        "button",
        { class: `cw-iconbtn cw-action cw-action--${name}`, type: "button" },
        icon(pathData),
      );
      button.addEventListener("click", handler);
      return button;
    };

    this.#launcher = h("button", {
      class: "cw-launcher",
      type: "button",
      "aria-expanded": "false",
    });
    this.#launcher.addEventListener("click", () => this.toggle());

    this.#greeting = h("div", { class: "cw-greeting", role: "status", hidden: true }, [
      h("p", { class: "cw-greeting__title" }),
      h("p", { class: "cw-greeting__text" }),
      h(
        "button",
        { class: "cw-greeting__close", type: "button", "aria-label": "Dismiss" },
        icon(ICONS.close),
      ),
    ]);
    this.#greeting.querySelector(".cw-greeting__close")!.addEventListener("click", () => {
      this.#greeting.hidden = true;
    });
    this.#greeting.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".cw-greeting__close")) return;
      this.openChat();
    });

    this.#title = h("div", { class: "cw-header__title" });
    this.#headerAvatar = h("div", { class: "cw-header__avatar" });
    const header = h("div", { class: "cw-header" }, [
      this.#headerAvatar,
      this.#title,
      h("div", { class: "cw-header__actions" }, [
        actionButton("restart", ICONS.restart, () => void this.restart()),
        actionButton("clear", ICONS.clear, () => this.clear()),
        actionButton("close", ICONS.close, () => this.closeChat()),
      ]),
    ]);

    this.#banner = h("div", { class: "cw-banner", role: "status", hidden: true });

    this.#typing = h("div", { class: "cw-typing", role: "status", hidden: true }, [
      h("span"),
      h("span"),
      h("span"),
    ]);
    this.#log = h(
      "div",
      { class: "cw-log", role: "log", "aria-live": "polite", "aria-relevant": "additions" },
      this.#typing,
    );

    this.#input = h("textarea", { class: "cw-input", rows: "1" });
    this.#input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.#submit();
      }
    });
    this.#input.addEventListener("input", () => this.#autosize());
    this.#sendBtn = h("button", { class: "cw-send", type: "button" }, icon(ICONS.send));
    this.#sendBtn.addEventListener("click", () => this.#submit());
    const composer = h("div", { class: "cw-composer" }, [this.#input, this.#sendBtn]);

    this.#modalBody = h("div", { class: "cw-modal__body" });
    const modalClose = h(
      "button",
      { class: "cw-modal__close", type: "button", "aria-label": "Close" },
      icon(ICONS.close),
    );
    modalClose.addEventListener("click", () => this.#closeModal());
    this.#modal = h("div", { class: "cw-modal", hidden: true }, [
      h("div", { class: "cw-modal__dialog", role: "dialog", "aria-modal": "true" }, [
        modalClose,
        this.#modalBody,
      ]),
    ]);
    this.#modal.addEventListener("click", (e) => {
      if (e.target === this.#modal) this.#closeModal();
    });

    this.#panel = h(
      "div",
      { class: "cw-panel", role: "dialog", "aria-modal": "false", hidden: true },
      [header, this.#banner, this.#log, composer, this.#modal],
    );
    this.#panel.setAttribute("aria-labelledby", "cw-title");
    this.#title.id = "cw-title";
    this.#panel.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!this.#modal.hidden) this.#closeModal();
      else this.closeChat();
    });

    this.#root.append(this.#launcher, this.#greeting, this.#panel);
  }
}
