import type { RasaMessage } from "../types";
import {
  Emitter,
  normalizeMessage,
  resolveJwt,
  resolveMetadata,
  withAuthToken,
  type SendOptions,
  type Transport,
  type TransportContext,
  type TransportEvents,
} from "./types";

export interface RestTransportOptions extends TransportContext {
  /** Ask Rasa for `?stream=true` and render token chunks as they arrive (Rasa Pro ≥ 3.17). */
  streaming?: boolean;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Rasa REST channel: POST {sender, message, metadata} to `/webhooks/rest/webhook`.
 * With `streaming` the request carries `stream=true` and the response is parsed as
 * `text/event-stream`; otherwise the JSON array of messages is emitted at once.
 */
export class RestTransport extends Emitter<TransportEvents> implements Transport {
  readonly kind = "rest" as const;
  private readonly options: RestTransportOptions;
  private readonly fetchImpl: typeof fetch;
  private connected = false;

  constructor(options: RestTransportOptions) {
    super();
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.emit("connected", undefined);
  }

  disconnect(): void {
    this.connected = false;
    this.emit("disconnected", undefined);
  }

  async send(text: string, sendOptions: SendOptions = {}): Promise<void> {
    if (!this.connected) await this.connect();
    const { serverUrl, authToken, requestTimeoutMs, streaming } = this.options;

    const url = new URL(withAuthToken(serverUrl, authToken));
    if (streaming) url.searchParams.set("stream", "true");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: streaming ? "text/event-stream, application/json" : "application/json",
    };
    const jwt = await resolveJwt(this.options);
    if (jwt) headers.Authorization = `Bearer ${jwt}`;

    const body: Record<string, unknown> = { sender: this.options.senderId, message: text };
    const metadata = resolveMetadata(this.options, sendOptions.metadata);
    if (metadata) body.metadata = metadata;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await this.fetchImpl(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit",
      });
      if (!response.ok) {
        throw new Error(`Rasa responded with HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream") && response.body) {
        // the stream can legitimately outlive the request timeout
        clearTimeout(timer);
        await this.consumeEventStream(response.body);
      } else {
        const json: unknown = await response.json();
        this.emit("message", toMessages(json));
      }
    } catch (error) {
      this.emit("error", { error, context: "send" });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse a streamed response. Rasa writes one JSON object per line
   * (newline-delimited JSON, served as `text/event-stream`). Lines prefixed with
   * `data:` (true SSE) are accepted too.
   *
   * Rasa Pro token streaming sends each token as `{recipient_id, text}` with no
   * marker, so consecutive text lines are treated as chunks of one message until a
   * non-text line or the end of the stream. Non-text lines (buttons, images,
   * custom payloads) are complete messages. The server suppresses the assembled
   * full text when it equals the streamed chunks, so nothing is rendered twice.
   */
  private async consumeEventStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let emittedAnything = false;
    let streaming = false;

    const endSegment = (): void => {
      if (streaming) {
        streaming = false;
        this.emit("streamEnd", {});
      }
    };

    const handleLine = (rawLine: string): void => {
      let line = rawLine.trim();
      if (!line || line.startsWith(":") || line.startsWith("event:") || line.startsWith("id:"))
        return;
      if (line.startsWith("data:")) line = line.slice(5).trim();
      if (!line || line === "[DONE]") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        if (this.options.debug) console.warn("[chatbot-widget] unparsable stream line", rawLine);
        return;
      }
      const chunk = extractChunk(parsed);
      if (chunk !== null) {
        emittedAnything = true;
        streaming = true;
        this.emit("chunk", { text: chunk });
        return;
      }
      endSegment();
      for (const message of toMessages(parsed)) {
        emittedAnything = true;
        this.emit("message", [message]);
      }
    };

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleLine(buffer);
    endSegment();
    if (!emittedAnything) this.emit("message", []);
  }
}

/** Accept a Rasa JSON array, a single message object, or `{ messages: [...] }`. */
export function toMessages(json: unknown): RasaMessage[] {
  if (Array.isArray(json)) {
    return json.map(normalizeMessage).filter((m): m is RasaMessage => m !== null);
  }
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.messages)) return toMessages(obj.messages);
    if (Array.isArray(obj.responses)) return toMessages(obj.responses);
    const single = normalizeMessage(obj);
    return single && hasContent(single) ? [single] : [];
  }
  return [];
}

function hasContent(message: RasaMessage): boolean {
  return Boolean(
    message.text || message.image || message.buttons || message.attachment || message.custom,
  );
}

/**
 * A streamed line that carries only text (plus recipient_id) is a token chunk.
 * `{chunk}` / `{delta}` / `{type:"chunk"}` shapes are accepted for other gateways.
 */
function extractChunk(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.chunk === "string") return obj.chunk;
  if (typeof obj.delta === "string") return obj.delta;
  if (obj.type === "chunk" && typeof obj.text === "string") return obj.text;
  if (typeof obj.text === "string") {
    const otherKeys = Object.keys(obj).filter(
      (key) => key !== "text" && key !== "recipient_id" && obj[key] != null,
    );
    if (otherKeys.length === 0) return obj.text;
  }
  return null;
}
