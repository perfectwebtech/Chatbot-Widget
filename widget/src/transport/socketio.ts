import type { Socket } from "socket.io-client";
import {
  Emitter,
  normalizeMessage,
  resolveJwt,
  resolveMetadata,
  type SendOptions,
  type Transport,
  type TransportContext,
  type TransportEvents,
} from "./types";

export interface SocketTransportOptions extends TransportContext {
  /** `socketio_path` from credentials.yml, default `/socket.io`. */
  socketPath?: string;
  /** `user_message_evt` from credentials.yml. */
  userMessageEvent?: string;
  /** `bot_message_evt` from credentials.yml. */
  botMessageEvent?: string;
  /** `metadata_key` from credentials.yml (`metadata` by default, `customData` for rasa-webchat setups). */
  metadataKey?: string;
}

/**
 * Rasa Socket.IO channel.
 *
 * Handshake: emit `session_request {session_id}` and wait for `session_confirm`
 * (a bare session id string). User messages are `user_uttered {message, session_id, metadata}`;
 * bot messages arrive on `bot_uttered`. Rasa Pro ≥ 3.17 also streams with
 * `stream_start`, `stream_chunk {text}` and `stream_end`.
 *
 * Requires socket.io-client 4.x (Rasa 3.x runs python-socketio 5, Engine.IO 4).
 * A JWT (`jwt_key` in credentials.yml) is passed as `auth: { token }`.
 */
export class SocketTransport extends Emitter<TransportEvents> implements Transport {
  readonly kind = "socketio" as const;
  private readonly options: SocketTransportOptions;
  private socket: Socket | null = null;
  private sessionId: string;
  private ready: Promise<void> | null = null;

  constructor(options: SocketTransportOptions) {
    super();
    this.options = options;
    this.sessionId = options.senderId;
  }

  connect(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this.open().catch((error) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  private async open(): Promise<void> {
    const { io } = await import("socket.io-client");
    const jwt = await resolveJwt(this.options);
    const { serverUrl, socketPath, authToken, requestTimeoutMs } = this.options;
    const botEvent = this.options.botMessageEvent ?? "bot_uttered";

    const socket = io(serverUrl, {
      path: socketPath ?? "/socket.io",
      transports: ["websocket", "polling"],
      query: authToken ? { token: authToken } : undefined,
      auth: jwt ? { token: jwt } : undefined,
      timeout: requestTimeoutMs,
    });
    this.socket = socket;

    socket.on(botEvent, (payload: unknown) => {
      const message = normalizeMessage(payload);
      this.emit("message", message ? [message] : []);
    });
    socket.on("stream_chunk", (payload: unknown) => {
      const text = (payload as { text?: unknown } | undefined)?.text;
      if (typeof text === "string") this.emit("chunk", { text });
    });
    socket.on("stream_end", () => this.emit("streamEnd", {}));
    socket.on("disconnect", () => this.emit("disconnected", undefined));
    socket.io.on("reconnect", () => {
      socket.emit("session_request", { session_id: this.sessionId });
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Socket.IO session timeout"));
      }, requestTimeoutMs);
      socket.on("session_confirm", (confirmed: unknown) => {
        const id =
          typeof confirmed === "string"
            ? confirmed
            : (confirmed as { session_id?: string } | undefined)?.session_id;
        if (id) this.sessionId = id;
        this.emit("connected", undefined);
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
      socket.on("connect", () => {
        socket.emit("session_request", { session_id: this.sessionId });
      });
      socket.on("connect_error", (error: Error) => {
        this.emit("error", { error, context: "connect" });
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async send(text: string, sendOptions: SendOptions = {}): Promise<void> {
    await this.connect();
    const socket = this.socket;
    if (!socket) throw new Error("Socket not connected");
    const metadata = resolveMetadata(this.options, sendOptions.metadata);
    const metadataKey = this.options.metadataKey ?? "metadata";
    socket.emit(this.options.userMessageEvent ?? "user_uttered", {
      message: text,
      session_id: this.sessionId,
      ...(metadata ? { [metadataKey]: metadata } : {}),
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.ready = null;
  }
}
