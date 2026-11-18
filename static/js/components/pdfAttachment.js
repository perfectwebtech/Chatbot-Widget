/**
 * Renders a PDF attachment link on to the chat screen.
 * @param {Object} pdfData Rasa response with `custom: { url, title }`
 */
function renderPdfAttachment(pdfData) {
  const { url, title } = pdfData.custom || {};
  if (!isSafeUrl(url)) {
    log("Ignoring PDF attachment with unsafe URL", url);
    return;
  }
  const link = el("a", {
    href: url,
    target: "_blank",
    rel: "noopener noreferrer",
    text: textOf(title) || "Download PDF",
  });
  const attachment = el("div", { class: "pdf_attachment" }, [
    el("div", { class: "row" }, [
      el("div", { class: "col s3 pdf_icon" }, svgIcon(ICONS.pdf)),
      el("div", { class: "col s9 pdf_link" }, link),
    ]),
  ]);
  chatLog().appendChild(attachment);
  scrollToBottomOfResults();
}
