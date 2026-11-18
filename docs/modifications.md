## Modifying the UI 

The bot name, avatars, greeting pop-up text and every UI string are set in [`static/js/config.js`](../static/js/config.js), see [instructions.md](instructions.md). To hide the pop-up set `showGreetingPopup: false`.

If you want to modify the UI of the chatbot widget, you can edit the respective classes in the [`style.css`](../static/css/style.css)


| Element      | Class        |
|--------------|--------------|
| Chat Window  | .widget      |
| Chat Header  | .chat_header |
| Chats        | .chats       |
| Bot Message  | .botMsg      |
| User Message | .userMsg     |
| Keypad       | .keypad      | 
| Buttons      | .suggestions | 
| Cards        | .cards       |
| Quick Replies| .quickReplies|
| Collapsible  | .collapsible |
| Video        | .video-container |
| Image        | .imgcard     |
| Dropdown     | .dropDownMsg |
| PDF attachment     | .pdf_attachment  |
| Bot pop-up intro | .tap-target |

