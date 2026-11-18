/**
 * Appends a horizontally scrolling row of quick-reply chips to the chat.
 * @param {Array} quickRepliesData json array of `{ title, payload }`
 */
function showQuickReplies(quickRepliesData) {
  const slider = el("div", { class: "quickReplies" });
  quickRepliesData.forEach((reply) => {
    if (!reply) return;
    slider.appendChild(
      el("div", {
        class: "chip",
        role: "button",
        tabindex: "0",
        text: textOf(reply.title),
        dataset: { payload: textOf(reply.payload) },
      })
    );
  });
  appendToChat([slider, clearfix()]);

  // drag to scroll
  let isDown = false;
  let startX;
  let scrollLeft;

  slider.addEventListener("mousedown", (e) => {
    isDown = true;
    slider.classList.add("active");
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });
  slider.addEventListener("mouseleave", () => {
    isDown = false;
    slider.classList.remove("active");
  });
  slider.addEventListener("mouseup", () => {
    isDown = false;
    slider.classList.remove("active");
  });
  slider.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 3; // scroll-fast
    slider.scrollLeft = scrollLeft - walk;
  });
}

// on click of a quick reply, show its title and send its payload to Rasa
$(document).on("click keydown", ".quickReplies .chip", function onChip(e) {
  if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  const text = this.textContent;
  const payload = this.dataset.payload;
  log("chip payload:", payload);
  setUserResponse(text);
  send(payload);
  $(".quickReplies").remove();
});
