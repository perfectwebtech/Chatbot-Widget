import type { WidgetConfig } from "../config";
import { RestTransport } from "./rest";
import { SocketTransport } from "./socketio";
import type { Transport, TransportContext } from "./types";

export * from "./types";
export { RestTransport } from "./rest";
export { SocketTransport } from "./socketio";

export function createTransport(config: WidgetConfig, senderId: string): Transport {
  const ctx: TransportContext = {
    senderId,
    serverUrl: config.serverUrl,
    requestTimeoutMs: config.requestTimeoutMs,
    authToken: config.authToken,
    jwt: config.jwt,
    metadata: config.metadata,
    debug: config.debug,
  };
  if (config.transport === "socketio") {
    return new SocketTransport({
      ...ctx,
      socketPath: config.socketPath,
      metadataKey: config.socketMetadataKey,
      userMessageEvent: config.socketUserEvent,
      botMessageEvent: config.socketBotEvent,
    });
  }
  return new RestTransport({ ...ctx, streaming: config.streaming });
}
