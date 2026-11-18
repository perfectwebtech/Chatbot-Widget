/**
 * Creates a Materialize collapsible from `[{ title, description }]`.
 * Titles are rendered as text, descriptions as sanitised Markdown.
 * for more info refer: https://materializecss.com/collapsible.html
 * @param {Array} collapsibleData json array
 */
function createCollapsible(collapsibleData) {
  const list = el("ul", { class: "collapsible" });
  collapsibleData.forEach((item) => {
    if (!item) return;
    const body = el("span");
    body.innerHTML = markdownToSafeHtml(item.description);
    list.appendChild(
      el("li", {}, [
        el("div", { class: "collapsible-header", text: textOf(item.title) }),
        el("div", { class: "collapsible-body" }, body),
      ])
    );
  });
  chatLog().appendChild(list);
  $(list).collapsible();
  scrollToBottomOfResults();
}
