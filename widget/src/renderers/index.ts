import type { WidgetConfig } from "../config";
import { h, icon, ICONS } from "../dom";
import { isSafeUrl, markdownNode } from "../sanitize";
import type {
  CardData,
  ChartData,
  CollapsibleItem,
  DropDownOption,
  RasaButton,
  RasaMessage,
} from "../types";
import { renderChart } from "./chart";

/** What a renderer may do besides producing DOM. */
export interface RenderContext {
  config: WidgetConfig;
  /** Send `payload` to the bot, showing `displayText` (or the payload) as the user's bubble. */
  send(payload: string, displayText?: string): void;
  openModal(content: HTMLElement, label: string): void;
  setInputDisabled(disabled: boolean): void;
  log(...args: unknown[]): void;
}

/** Elements with this class are removed when the user sends the next message. */
export const TRANSIENT_CLASS = "cw-transient";

export function avatarNode(src: string | undefined, kind: "bot" | "user"): HTMLElement {
  if (src && isSafeUrl(src)) {
    return h("img", { class: `cw-avatar cw-avatar--${kind}`, src, alt: "" });
  }
  return h("span", { class: `cw-avatar cw-avatar--${kind} cw-avatar--icon` }, icon(ICONS[kind]));
}

export function botRow(
  content: HTMLElement | HTMLElement[],
  config: WidgetConfig,
  extra = "",
): HTMLElement {
  return h("div", { class: `cw-row cw-row--bot ${extra}`.trim() }, [
    avatarNode(config.botAvatar, "bot"),
    h("div", { class: "cw-row__content" }, content),
  ]);
}

export function userRow(text: string, config: WidgetConfig): HTMLElement {
  return h("div", { class: "cw-row cw-row--user" }, [
    h("div", { class: "cw-row__content" }, h("div", { class: "cw-bubble cw-bubble--user", text })),
    avatarNode(config.userAvatar, "user"),
  ]);
}

export function botTextBubble(text: string): HTMLElement {
  const bubble = markdownNode(text, "div");
  bubble.className = "cw-bubble cw-bubble--bot";
  return bubble;
}

function activate(node: HTMLElement, handler: () => void): HTMLElement {
  node.setAttribute("role", "button");
  node.setAttribute("tabindex", "0");
  node.addEventListener("click", (e) => {
    e.preventDefault();
    handler();
  });
  node.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  });
  return node;
}

function renderButtons(
  buttons: RasaButton[],
  ctx: RenderContext,
  horizontal: boolean,
): HTMLElement {
  const group = h("div", {
    class: `cw-buttons ${horizontal ? "cw-buttons--row" : "cw-buttons--stack"} ${TRANSIENT_CLASS}`,
    role: "group",
  });
  for (const button of buttons) {
    if (!button || typeof button !== "object") continue;
    const title = String(button.title ?? "");
    const payload = String(button.payload ?? title);
    const chip = h("button", { class: "cw-chip", type: "button", text: title });
    chip.addEventListener("click", () => {
      ctx.send(payload, title);
      group.remove();
    });
    group.appendChild(chip);
  }
  return group;
}

function renderImage(url: unknown, ctx: RenderContext): HTMLElement | null {
  if (!isSafeUrl(url)) {
    ctx.log("Dropped image with unsafe URL", url);
    return null;
  }
  const safeUrl = url as string;
  const img = h("img", { class: "cw-image", src: safeUrl, alt: "", loading: "lazy" });
  const link = h(
    "a",
    { class: "cw-image-link", href: safeUrl, target: "_blank", rel: "noopener noreferrer" },
    img,
  );
  return h("div", { class: "cw-card cw-card--image" }, link);
}

function renderVideo(url: unknown, ctx: RenderContext): HTMLElement | null {
  if (!isSafeUrl(url)) {
    ctx.log("Dropped video with unsafe URL", url);
    return null;
  }
  return h(
    "div",
    { class: "cw-video" },
    h("iframe", {
      src: url as string,
      title: "Video",
      allow: "fullscreen; picture-in-picture",
      referrerpolicy: "strict-origin-when-cross-origin",
      sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups",
      loading: "lazy",
    }),
  );
}

function renderPdf(
  custom: { url?: unknown; title?: unknown },
  ctx: RenderContext,
): HTMLElement | null {
  if (!isSafeUrl(custom.url)) {
    ctx.log("Dropped PDF with unsafe URL", custom.url);
    return null;
  }
  const title = String(custom.title ?? "") || ctx.config.messages.downloadPdf;
  return h(
    "a",
    {
      class: "cw-attachment",
      href: custom.url as string,
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": `${ctx.config.messages.downloadPdf}: ${title}`,
    },
    [
      h("span", { class: "cw-attachment__icon" }, icon(ICONS.pdf)),
      h("span", { class: "cw-attachment__title", text: title }),
    ],
  );
}

function renderDropdown(options: unknown, ctx: RenderContext): HTMLElement | null {
  if (!Array.isArray(options)) return null;
  const select = h("select", {
    class: "cw-select",
    "aria-label": ctx.config.messages.dropdownPlaceholder,
  });
  select.appendChild(
    h("option", {
      value: "",
      disabled: true,
      selected: true,
      text: ctx.config.messages.dropdownPlaceholder,
    }),
  );
  for (const option of options as DropDownOption[]) {
    if (!option || typeof option !== "object") continue;
    select.appendChild(
      h("option", { value: String(option.value ?? ""), text: String(option.label ?? "") }),
    );
  }
  const wrapper = h("div", { class: `cw-dropdown ${TRANSIENT_CLASS}` }, select);
  select.addEventListener("change", () => {
    const chosen = select.selectedOptions[0];
    if (!chosen) return;
    ctx.send(select.value, chosen.textContent ?? select.value);
    wrapper.remove();
  });
  return wrapper;
}

function renderCollapsible(items: unknown): HTMLElement | null {
  if (!Array.isArray(items)) return null;
  const list = h("div", { class: "cw-collapsible" });
  for (const item of items as CollapsibleItem[]) {
    if (!item || typeof item !== "object") continue;
    const body = markdownNode(String(item.description ?? ""), "div");
    body.className = "cw-collapsible__body";
    list.appendChild(
      h("details", { class: "cw-collapsible__item" }, [
        h("summary", { class: "cw-collapsible__title", text: String(item.title ?? "") }),
        body,
      ]),
    );
  }
  return list;
}

function renderCards(cards: unknown, ctx: RenderContext): HTMLElement | null {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const scroller = h("div", { class: "cw-carousel__scroller" });
  for (const card of cards as CardData[]) {
    if (!card || typeof card !== "object") continue;
    const parts: HTMLElement[] = [];
    if (isSafeUrl(card.image)) {
      parts.push(
        h("img", { class: "cw-carousel__image", src: card.image, alt: "", loading: "lazy" }),
      );
    }
    const title = String(card.title ?? "");
    const body = h("div", { class: "cw-carousel__body" }, [
      h("div", { class: "cw-carousel__title", text: title }),
      card.subtitle
        ? h("div", { class: "cw-carousel__subtitle", text: String(card.subtitle) })
        : null,
    ]);
    parts.push(body);
    const item = h("div", { class: "cw-carousel__card" }, parts);
    if (typeof card.payload === "string" && card.payload) {
      activate(item, () => ctx.send(card.payload as string, title || card.payload));
      item.classList.add("cw-carousel__card--action");
    } else if (isSafeUrl(card.url)) {
      activate(item, () => window.open(card.url as string, "_blank", "noopener,noreferrer"));
      item.classList.add("cw-carousel__card--action");
    }
    scroller.appendChild(item);
  }
  const step = () => scroller.querySelector<HTMLElement>(".cw-carousel__card")?.offsetWidth ?? 220;
  const prev = h(
    "button",
    {
      class: "cw-carousel__nav cw-carousel__nav--prev",
      type: "button",
      "aria-label": ctx.config.messages.previous,
    },
    icon(ICONS.chevronLeft),
  );
  const next = h(
    "button",
    {
      class: "cw-carousel__nav cw-carousel__nav--next",
      type: "button",
      "aria-label": ctx.config.messages.next,
    },
    icon(ICONS.chevronRight),
  );
  prev.addEventListener("click", () => scroller.scrollBy({ left: -step(), behavior: "smooth" }));
  next.addEventListener("click", () => scroller.scrollBy({ left: step(), behavior: "smooth" }));
  return h("div", { class: "cw-carousel" }, [scroller, prev, next]);
}

function requestLocation(ctx: RenderContext): void {
  ctx.setInputDisabled(true);
  const finish = (payload: string) => {
    ctx.setInputDisabled(false);
    ctx.send(payload, "");
  };
  if (!("geolocation" in navigator)) {
    finish('/inform{"user_location":"deny"}');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latitude = Number(position.coords.latitude);
      const longitude = Number(position.coords.longitude);
      finish(`/inform${JSON.stringify({ latitude, longitude })}`);
    },
    () => finish('/inform{"user_location":"deny"}'),
  );
}

function renderCustom(message: RasaMessage, ctx: RenderContext): HTMLElement | null {
  const custom = message.custom ?? {};
  const { payload, data } = custom;
  switch (payload) {
    case "quickReplies":
      return Array.isArray(data) ? renderButtons(data as RasaButton[], ctx, true) : null;
    case "pdf_attachment":
      return renderPdf(custom, ctx);
    case "dropDown":
      return renderDropdown(data, ctx);
    case "collapsible":
      return renderCollapsible(data);
    case "cardsCarousel":
      return renderCards(data, ctx);
    case "chart":
      return renderChart((data ?? {}) as ChartData, ctx);
    case "location":
      requestLocation(ctx);
      return null;
    default:
      ctx.log("Unknown custom payload", payload);
      return null;
  }
}

/**
 * Turn one Rasa response object into chat rows. A single response can carry
 * text, an image, buttons and a custom payload at once; they render in that order.
 */
export function renderMessage(message: RasaMessage, ctx: RenderContext): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const { config } = ctx;

  if (typeof message.text === "string" && message.text.trim() !== "") {
    rows.push(botRow(botTextBubble(message.text), config));
  }
  if (message.image) {
    const node = renderImage(message.image, ctx);
    if (node) rows.push(botRow(node, config, "cw-row--rich"));
  }
  if (message.attachment?.type === "video") {
    const node = renderVideo(message.attachment.payload?.src, ctx);
    if (node) rows.push(botRow(node, config, "cw-row--rich"));
  }
  if (message.custom) {
    const node = renderCustom(message, ctx);
    if (node) rows.push(botRow(node, config, "cw-row--rich"));
  }
  if (Array.isArray(message.buttons) && message.buttons.length > 0) {
    rows.push(
      h(
        "div",
        { class: `cw-row cw-row--buttons ${TRANSIENT_CLASS}` },
        renderButtons(message.buttons, ctx, false),
      ),
    );
  }
  return rows;
}
