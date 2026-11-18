/**
 * Adds vertically stacked buttons as a bot response.
 * @param {Array} suggestions buttons json array of `{ title, payload }`
 */
function addSuggestion(suggestions) {
  const menu = el("div", { class: "menu" });
  suggestions.forEach((suggestion) => {
    if (!suggestion) return;
    menu.appendChild(
      el("div", {
        class: "menuChips",
        role: "button",
        tabindex: "0",
        text: textOf(suggestion.title),
        dataset: { payload: textOf(suggestion.payload) },
      })
    );
  });
  appendToChat(
    el("div", { class: "singleCard" }, el("div", { class: "suggestions" }, menu))
  );
}

// on click of a suggestion button, show its title and send its payload to Rasa
$(document).on("click keydown", ".menu .menuChips", function onChip(e) {
  if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  const text = this.textContent;
  const payload = this.dataset.payload;
  log("payload:", payload);
  setUserResponse(text);
  send(payload);
  $(".suggestions").remove();
});
