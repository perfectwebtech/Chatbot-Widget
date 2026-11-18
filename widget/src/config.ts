import type { WidgetEvent } from "./types";

export type TransportKind = "rest" | "socketio";

export interface WidgetMessages {
  inputPlaceholder: string;
  fallback: string;
  dropdownPlaceholder: string;
  restart: string;
  clear: string;
  close: string;
  open: string;
  send: string;
  typing: string;
  expandChart: string;
  previous: string;
  next: string;
  downloadPdf: string;
  locationDenied: string;
  retry: string;
  offline: string;
}

export interface GreetingConfig {
  enabled: boolean;
  title: string;
  text: string;
  /** How long the greeting bubble stays visible. 0 keeps it until dismissed. */
  durationMs: number;
}

export interface WidgetConfig {
  /**
   * REST: full webhook URL, e.g. `https://bot.example.com/webhooks/rest/webhook`.
   * Socket.IO: server origin, e.g. `https://bot.example.com`.
   */
  serverUrl: string;
  transport: TransportKind;
  /**
   * REST only: request `?stream=true` and render token chunks as they arrive.
   * Needs Rasa Pro ≥ 3.17 with a streaming-capable action executor. Leave off for Rasa OSS.
   */
  streaming: boolean;
  /** Socket.IO only: `socketio_path` from credentials.yml. */
  socketPath: string;
  /** Socket.IO only: `metadata_key` from credentials.yml (`customData` for rasa-webchat bots). */
  socketMetadataKey: string;
  /** Socket.IO only: `user_message_evt` from credentials.yml. */
  socketUserEvent: string;
  /** Socket.IO only: `bot_message_evt` from credentials.yml. */
  socketBotEvent: string;
  /**
   * Sent as the `token` query parameter. Rasa itself does not authenticate the REST
   * webhook; use this with a reverse proxy or API gateway that checks it.
   */
  authToken?: string;
  /**
   * JWT sent as `Authorization: Bearer` (REST, for a gateway in front of Rasa) and as
   * the Socket.IO `auth.token` (checked by Rasa when `jwt_key` is set in credentials.yml).
   * May be a function, sync or async, so tokens can be refreshed.
   */
  jwt?: string | (() => string | Promise<string>);
  /** Extra data sent with every message (REST `metadata`, Socket.IO `customData`). */
  metadata?: Record<string, unknown> | (() => Record<string, unknown>);
  /** Fixed conversation id. When omitted one is generated (and persisted if enabled). */
  senderId?: string;
  /** Keep the same conversation id across page loads via localStorage. */
  persistSession: boolean;
  storageKey: string;
  requestTimeoutMs: number;
  /** Payload sent automatically the first time the chat opens, e.g. `/greet`. */
  initialPayload?: string;

  botName: string;
  launcherAvatar?: string;
  botAvatar?: string;
  userAvatar?: string;
  greeting: GreetingConfig;
  openOnLoad: boolean;
  position: "right" | "left";
  theme: "auto" | "light" | "dark";
  /** Primary brand colour; every other colour derives from the CSS custom properties. */
  primaryColor?: string;
  messages: WidgetMessages;

  debug: boolean;
  onEvent?: (event: WidgetEvent) => void;
}

export type PartialWidgetConfig = Partial<Omit<WidgetConfig, "messages" | "greeting">> & {
  messages?: Partial<WidgetMessages>;
  greeting?: Partial<GreetingConfig>;
};

export const DEFAULT_MESSAGES: WidgetMessages = {
  inputPlaceholder: "Type a message…",
  fallback: "Sorry, something went wrong. Please try again.",
  dropdownPlaceholder: "Choose an option",
  restart: "Restart conversation",
  clear: "Clear messages",
  close: "Close chat",
  open: "Open chat",
  send: "Send message",
  typing: "Bot is typing",
  expandChart: "Expand chart",
  previous: "Previous",
  next: "Next",
  downloadPdf: "Download PDF",
  locationDenied: "Location access was denied.",
  retry: "Retry",
  offline: "Connection lost. Reconnecting…",
};

export const DEFAULT_CONFIG: WidgetConfig = {
  serverUrl: "http://localhost:5005/webhooks/rest/webhook",
  transport: "rest",
  streaming: false,
  socketPath: "/socket.io",
  socketMetadataKey: "metadata",
  socketUserEvent: "user_uttered",
  socketBotEvent: "bot_uttered",
  persistSession: true,
  storageKey: "chatbot-widget",
  requestTimeoutMs: 30_000,
  botName: "Assistant",
  greeting: {
    enabled: true,
    title: "Hey there 👋",
    text: "How can I help you today?",
    durationMs: 6000,
  },
  openOnLoad: false,
  position: "right",
  theme: "auto",
  messages: DEFAULT_MESSAGES,
  debug: false,
};

/** Deep-merge user options over the defaults. */
export function resolveConfig(overrides: PartialWidgetConfig = {}): WidgetConfig {
  const { messages, greeting, ...rest } = overrides;
  return {
    ...DEFAULT_CONFIG,
    ...stripUndefined(rest),
    messages: { ...DEFAULT_MESSAGES, ...stripUndefined(messages ?? {}) },
    greeting: { ...DEFAULT_CONFIG.greeting, ...stripUndefined(greeting ?? {}) },
  };
}

function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/**
 * Read configuration from `data-*` attributes, e.g. on the `<script>` tag or the element.
 * `data-server-url="…" data-bot-name="…" data-transport="socketio" data-streaming="true"`.
 * Nested keys use a dot: `data-greeting.text="…"`, `data-messages.fallback="…"`.
 */
export function configFromDataset(dataset: DOMStringMap): PartialWidgetConfig {
  const out: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(dataset)) {
    if (rawValue === undefined) continue;
    const value = coerce(rawValue);
    const path = rawKey.split(".");
    let target = out;
    for (let i = 0; i < path.length - 1; i += 1) {
      const segment = path[i]!;
      target[segment] = (target[segment] as Record<string, unknown> | undefined) ?? {};
      target = target[segment] as Record<string, unknown>;
    }
    target[path[path.length - 1]!] = value;
  }
  return out as PartialWidgetConfig;
}

function coerce(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && !Number.isNaN(Number(value)) && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
