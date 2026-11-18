# Instructions

*Make sure you have set up Rasa on your system or server.*

## Configuration

All deployable settings live in [`static/js/config.js`](../static/js/config.js). You do not need to edit any other file to point the widget at your bot or to rebrand it.

| Key | Purpose | Default |
|-----|---------|---------|
| `rasaServerUrl` | Rasa REST channel endpoint | `http://localhost:5005/webhooks/rest/webhook` |
| `actionServerUrl` | Rasa action server, used only when `startConversation` is `true` | `http://localhost:5055/webhook/` |
| `startActionName` | Custom action that makes the bot speak first | `action_hello_world` |
| `startConversation` | Trigger `startActionName` when the page loads | `false` |
| `requestTimeoutMs` | Abort a request after this long and show the fallback message | `30000` |
| `botName` | Name in the chat header | `Sara` |
| `launcherAvatar`, `botAvatar`, `userAvatar` | Images for the launcher button, bot messages and user messages | bundled images |
| `showGreetingPopup`, `greetingTitle`, `greetingText` | The pop-up shown on first load | enabled |
| `messages.*` | Every UI string (placeholder, fallback error, menu labels) so you can localise them | English |
| `debug` | Log requests and responses to the browser console | `false` |
| `onError` | Callback `(error, context)` invoked when a request to the bot fails | `null` |

You can either edit `config.js` directly or override keys from the host page **before** `config.js` is loaded:

```html
<script>
  window.CHATBOT_CONFIG = {
    rasaServerUrl: "https://bot.example.com/webhooks/rest/webhook",
    botName: "Ava",
    messages: { fallback: "Sorry, something went wrong. Please try again." },
  };
</script>
<script src="static/js/config.js"></script>
```

## Integration

- Step 1: Since this chat UI communicates with the Rasa server using the `rest` channel, make sure you have added `rest` to the `credentials.yml` file.
- Once your bot is ready, start the Rasa server. **Restrict CORS to the origin that serves the widget** instead of `"*"`:
  ```
  rasa run -m models --enable-api --cors "https://www.example.com"
  ```
  For local development you can use `--cors "http://localhost:8080"` (or whatever port serves `index.html`). Add `--debug` while developing.
- If you have custom actions and use `startConversation`, the action server must also allow your origin:
  ```
  rasa run actions --cors "https://www.example.com"
  ```
- Set `rasaServerUrl` in `config.js` to the public address of your Rasa server. Use `https://` in production; browsers block mixed content, so an `https://` page cannot call an `http://` bot.
- Serve `index.html` from a web server (for example `python3 -m http.server 8080` during development) and open it in the browser.

## Production checklist

- Serve the widget and the Rasa server over HTTPS.
- Put Rasa behind a reverse proxy (nginx, Caddy, an API gateway) instead of exposing port 5005 directly. Terminate TLS there and add rate limiting.
- Restrict `--cors` to your site's origin(s).
- Keep `debug` set to `false`.
- Enable [Rasa's REST API token or JWT authentication](https://rasa.com/docs/reference/api/pro/rasa-pro-rest-api/) on the Rasa server so the `/conversations` and model endpoints are not public.

## Security notes

- Every piece of text returned by the bot (messages, button titles, card titles, collapsible content) is inserted as text or passed through [DOMPurify](https://github.com/cure53/DOMPurify) before rendering, so a compromised or misbehaving bot response cannot execute script on the page.
- Image, video, PDF and link URLs are only used when they are `http:` or `https:`. `javascript:` and `data:` URLs are dropped.
- Videos are rendered in a sandboxed `iframe`.
- The widget loads no third-party scripts, fonts or icon fonts at runtime. All libraries are served from `static/js/lib`.
