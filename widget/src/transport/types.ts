import type { RasaMessage } from "../types";

export interface SendOptions {
  /** Extra data merged into the per-message metadata. */
  metadata?: Record<string, unknown>;
}

export interface TransportEvents {
  /** One or more complete bot messages. */
  message: RasaMessage[];
  /** A partial text token while a streamed response is in progress. */
  chunk: { text: string; messageId?: string };
  /** The streamed message is finished. */
  streamEnd: { messageId?: string };
  connected: void;
  disconnected: void;
  error: { error: unknown; context: string };
}

export type Listener<T> = (payload: T) => void;

/** Minimal typed event emitter. */
export class Emitter<Events extends { [K in keyof Events]: unknown }> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (error) {
        // a faulty listener must never break the others
        if (event !== "error") {
          this.emit("error" as K, { error, context: "listener" } as Events[K]);
        }
      }
    });
  }

  removeAll(): void {
    this.listeners.clear();
  }
}

/** A connection to the bot. Implementations: REST (+SSE streaming) and Socket.IO. */
export interface Transport extends Emitter<TransportEvents> {
  readonly kind: "rest" | "socketio";
  /** Establish the connection. Resolves once messages can be sent. */
  connect(): Promise<void>;
  /** Send a user message or intent payload. Responses arrive via `message`/`chunk` events. */
  send(text: string, options?: SendOptions): Promise<void>;
  disconnect(): void;
}

export interface TransportContext {
  senderId: string;
  serverUrl: string;
  requestTimeoutMs: number;
  authToken?: string;
  jwt?: string | (() => string | Promise<string>);
  metadata?: Record<string, unknown> | (() => Record<string, unknown>);
  debug?: boolean;
}

export async function resolveJwt(ctx: TransportContext): Promise<string | undefined> {
  if (!ctx.jwt) return undefined;
  return typeof ctx.jwt === "function" ? await ctx.jwt() : ctx.jwt;
}

export function resolveMetadata(
  ctx: TransportContext,
  extra?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const base = typeof ctx.metadata === "function" ? ctx.metadata() : ctx.metadata;
  if (!base && !extra) return undefined;
  return { ...(base ?? {}), ...(extra ?? {}) };
}

/** Append Rasa's `token` query parameter when an auth token is configured. */
export function withAuthToken(url: string, token?: string): string {
  if (!token) return url;
  const parsed = new URL(
    url,
    typeof location !== "undefined" ? location.href : "http://localhost/",
  );
  parsed.searchParams.set("token", token);
  return parsed.toString();
}

const MESSAGE_KEYS = new Set([
  "recipient_id",
  "text",
  "image",
  "buttons",
  "quick_replies",
  "attachment",
  "custom",
  "elements",
]);

/**
 * Normalise a Rasa response object into the REST shape the renderers understand.
 * - Socket.IO sends buttons as `quick_replies` and images as `attachment{type:"image"}`.
 * - Socket.IO emits custom payloads as the payload object itself (no `custom` wrapper).
 */
export function normalizeMessage(raw: unknown): RasaMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const message: RasaMessage = { ...(source as RasaMessage) };

  if (!message.buttons && Array.isArray(message.quick_replies)) {
    message.buttons = message.quick_replies;
  }
  const attachment = message.attachment;
  if (
    !message.image &&
    attachment &&
    attachment.type === "image" &&
    typeof attachment.payload?.src === "string"
  ) {
    message.image = attachment.payload.src;
  }
  if (!message.custom) {
    const extraKeys = Object.keys(source).filter((key) => !MESSAGE_KEYS.has(key));
    const looksLikeCustom = typeof source.payload === "string" || typeof source.type === "string";
    if (looksLikeCustom && extraKeys.length > 0) {
      const custom: Record<string, unknown> = {};
      for (const key of extraKeys) {
        custom[key] = source[key];
        delete (message as Record<string, unknown>)[key];
      }
      message.custom = custom as RasaMessage["custom"];
    }
  }
  return message;
}
