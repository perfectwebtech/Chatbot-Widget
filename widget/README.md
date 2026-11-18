# Chatbot Widget 2.0

Embeddable, framework-free chat widget for [Rasa](https://rasa.com) bots.

- **One script tag.** Drop it on any page; it renders inside a Shadow DOM so host CSS and the widget never touch each other.
- **Three ways to talk to Rasa.** REST, REST with token streaming (Rasa Pro ≥ 3.17) and Socket.IO.
- **Safe by default.** Every bot string is rendered as text or passed through DOMPurify; media URLs must be `http(s)`; videos run in a sandboxed iframe.
- **Accessible.** Keyboard operable, focus managed, live region for new messages, respects reduced motion.
- **Themeable.** CSS custom properties, light/dark/auto, left or right.
- **Rich messages.** Markdown (GFM), images, buttons, quick replies, cards carousel, dropdown, collapsible, PDF attachment, video, charts, location request.
- **TypeScript, tested, CI.** Vitest unit tests, Playwright end-to-end tests against a mock Rasa server, GitHub Actions.

## Install

### Script tag

```html
<script
  src="https://your-cdn.example.com/chatbot-widget/2.0.0/chatbot-widget.iife.js"
  data-server-url="https://bot.example.com/webhooks/rest/webhook"
  data-bot-name="Ava"
  data-primary-color="#0a7d4a"
  async
></script>
```

Any config key can be passed as a `data-*` attribute (kebab-case; nested keys use a dot, e.g. `data-greeting.text="Hi"`). Add `data-auto-init="false"` to mount manually with `ChatbotWidget.init(...)`.

### npm

```bash
npm install @perfectwebtech/chatbot-widget
```

```ts
import { init } from "@perfectwebtech/chatbot-widget";

const widget = init({
  serverUrl: "https://bot.example.com/webhooks/rest/webhook",
  botName: "Ava",
  metadata: () => ({ page: location.pathname }),
  onEvent: (event) => analytics.track(`chat_${event.type}`, event),
});

widget.openChat();
```

The ES build code-splits: Chart.js and Socket.IO are loaded only when a chart or the socket transport is used.

### Declarative

```html
<chatbot-widget data-server-url="https://bot.example.com/webhooks/rest/webhook"></chatbot-widget>
<script type="module" src="chatbot-widget.es.js"></script>
```

## Configuration

| Key | Default | Notes |
| --- | --- | --- |
| `serverUrl` | `http://localhost:5005/webhooks/rest/webhook` | REST webhook URL, or the server origin for Socket.IO |
| `transport` | `"rest"` | `"rest"` or `"socketio"` |
| `streaming` | `false` | REST only. Sends `?stream=true`; Rasa Pro streams tokens as newline-delimited JSON. Leave off for Rasa OSS |
| `socketPath` | `/socket.io` | `socketio_path` from `credentials.yml` |
| `socketMetadataKey` | `metadata` | `metadata_key` from `credentials.yml` (`customData` for rasa-webchat bots) |
| `socketUserEvent` / `socketBotEvent` | `user_uttered` / `bot_uttered` | `user_message_evt` / `bot_message_evt` |
| `authToken` | – | Sent as `?token=`. Rasa does **not** check it on the REST webhook; enforce it at your proxy |
| `jwt` | – | String or (async) function. Sent as `Authorization: Bearer` on REST and as `auth.token` on Socket.IO (checked by Rasa when `jwt_key` is set) |
| `metadata` | – | Object or function; sent with every message as REST `metadata` / Socket.IO `metadata` |
| `senderId` | generated | Conversation id |
| `persistSession` | `true` | Keep the sender id in `localStorage` across page loads |
| `storageKey` | `chatbot-widget` | Prefix for storage keys |
| `requestTimeoutMs` | `30000` | REST request timeout; also the Socket.IO handshake timeout |
| `initialPayload` | – | Sent silently the first time the chat opens, e.g. `/greet` |
| `botName`, `launcherAvatar`, `botAvatar`, `userAvatar` | | Branding; avatars fall back to icons |
| `greeting` | enabled | `{ enabled, title, text, durationMs }` |
| `openOnLoad` | `false` | |
| `position` | `"right"` | `"right"` or `"left"` |
| `theme` | `"auto"` | `"auto"` follows `prefers-color-scheme`; or `"light"` / `"dark"` |
| `primaryColor` | – | Shortcut for `--cw-primary` |
| `messages` | English | Every UI string, for localisation |
| `debug` | `false` | Console diagnostics |
| `onEvent` | – | `(event) => void`; see Events |

## Theming

Set custom properties on the element (they inherit through the shadow boundary):

```css
chatbot-widget {
  --cw-primary: #0a7d4a;
  --cw-primary-contrast: #fff;
  --cw-font: "Inter", system-ui, sans-serif;
  --cw-radius: 12px;
  --cw-width: 400px;
  --cw-height: 600px;
  --cw-offset-x: 24px;
  --cw-offset-y: 24px;
  --cw-z-index: 9999;
}
```

Full list in [`src/styles.css`](src/styles.css). Below 480 px the panel goes full screen.

## API

```ts
const widget = init(config);
widget.openChat(); widget.closeChat(); widget.toggle();
await widget.send("hello");            // show "hello" and send it
await widget.send("/greet", "");       // send silently
await widget.restart();                // clear and send /restart
widget.clear();                        // clear screen only
widget.receive([{ text: "Proactive message" }]); // render bot messages from your own code
widget.config = { ...widget.config, theme: "dark" }; // reconfigure live
widget.senderId; widget.open;
```

## Events

`onEvent` and DOM events (`chatbot-widget:<type>`, bubbling and composed) fire for
`ready`, `open`, `close`, `message-sent`, `message-received`, `restart`, `clear`, `error`.

```js
document.addEventListener("chatbot-widget:message-sent", (e) => console.log(e.detail));
```

## Rasa response formats

Standard `text`, `image`, `buttons`, `attachment{type:"video"}` plus `custom` payloads:

| `custom.payload` | `custom.data` |
| --- | --- |
| `quickReplies` | `[{ title, payload }]` |
| `cardsCarousel` | `[{ title, subtitle?, image?, payload? \| url? }]` |
| `dropDown` | `[{ label, value }]` |
| `collapsible` | `[{ title, description }]` (description is Markdown) |
| `chart` | `{ title, labels, backgroundColor, chartsData, chartType, displayLegend }` |
| `pdf_attachment` | `custom.url`, `custom.title` |
| `location` | asks the browser for coordinates and sends `/inform{"latitude","longitude"}` |

Socket.IO payloads (`quick_replies`, `attachment{type:"image"}`, bare custom objects) are normalised to the same shapes.

## Rasa setup

```yaml
# credentials.yml
rest:
socketio:
  user_message_evt: user_uttered
  bot_message_evt: bot_uttered
  session_persistence: true
  # jwt_key: <secret>   # then pass `jwt` in the widget config
```

```bash
rasa run --enable-api --cors "https://www.example.com"
```

Serve the widget and Rasa over HTTPS, restrict `--cors` to your origins, and put Rasa behind a reverse proxy that rate-limits and (if you need auth on REST) validates `token`/`Authorization`.

## Development

```bash
npm install
npm run dev          # demo page on http://localhost:5173 (start `node e2e/mock-rasa.mjs` too)
npm test             # unit tests (vitest + jsdom)
npm run e2e          # Playwright against the mock server; set PLAYWRIGHT_CHROMIUM_PATH to reuse a local Chromium
npm run build        # dist/chatbot-widget.es.js (+chunks) and dist/chatbot-widget.iife.js
npm run check        # lint + typecheck + test + build + e2e
```

Bundle sizes (gzip): core ES ≈ 42 kB, Chart.js chunk ≈ 82 kB (lazy), Socket.IO chunk ≈ 18 kB (lazy), all-in-one IIFE ≈ 122 kB.
