/**
 * Chart rendering with Chart.js.
 * for more info. refer: https://www.chartjs.org/docs/latest/getting-started/usage.html
 *
 * Chart.js draws on a canvas, so titles and labels are never inserted as HTML.
 */

/** Chart instances currently shown in the chat, destroyed on the next user turn. */
const chatCharts = [];
/** The chart shown in the expand modal, if any. */
let modalChart;

/** Normalise the `displayLegend` flag, which Rasa may send as a string. */
function legendEnabled(displayLegend) {
  return displayLegend === true || displayLegend === "true";
}

/**
 * Build the Chart.js configuration shared by the inline and modal charts.
 */
function chartConfig(chartData, inline) {
  const { title, labels, backgroundColor, chartsData, chartType, displayLegend } = chartData;
  const legend = { display: legendEnabled(displayLegend), position: "right" };
  if (inline) legend.labels = { boxWidth: 5, fontSize: 10 };
  return {
    type: textOf(chartType) || "bar",
    data: {
      labels: Array.isArray(labels) ? labels.map(textOf) : [],
      datasets: [
        {
          label: textOf(title),
          backgroundColor,
          data: Array.isArray(chartsData) ? chartsData : [],
          fill: false,
        },
      ],
    },
    options: {
      title: { display: true, text: textOf(title) },
      layout: { padding: { left: 5, right: 0, top: 0, bottom: 0 } },
      legend,
    },
  };
}

/**
 * Render a chart message inside the chat log with an expand control.
 *
 * sample data format:
 *  { "title": "Leaves", "labels": ["Sick Leave", "Casual Leave"], "backgroundColor": ["#36a2eb", "#ffcd56"],
 *    "chartsData": [5, 10], "chartType": "pie", "displayLegend": "true" }
 * @param {Object} chartData
 */
function renderChartMessage(chartData) {
  const canvas = el("canvas", { class: "chat-chart" });
  const expand = el(
    "span",
    {
      class: "modal-trigger chart-expand",
      href: "#modal1",
      role: "button",
      tabindex: "0",
      title: getConfig().messages.chartExpand,
      "aria-label": getConfig().messages.chartExpand,
    },
    svgIcon(ICONS.openInNew)
  );
  const container = el("div", { class: "chart-container" }, [expand, canvas]);
  chatLog().appendChild(container);
  chatLog().appendChild(clearfix());

  // eslint-disable-next-line no-undef
  chatCharts.push(new Chart(canvas, chartConfig(chartData, true)));

  // the handler is bound to this chart's own control, not to the document,
  // so each chart opens only its own data
  expand.addEventListener("click", () => createChartinModal(chartData));

  scrollToBottomOfResults();
}

/**
 * Render the chart in the modal (`#modal1` must exist in `index.html`).
 * @param {Object} chartData same shape as `renderChartMessage`
 */
function createChartinModal(chartData) {
  if (modalChart) {
    modalChart.destroy();
    modalChart = undefined;
  }
  const ctx = document.getElementById("modal-chart");
  if (!ctx) return;
  // eslint-disable-next-line no-undef
  modalChart = new Chart(ctx, chartConfig(chartData, false));
}

/** Destroy every chart in the chat log and remove their containers. */
function destroyCharts() {
  while (chatCharts.length) {
    chatCharts.pop().destroy();
  }
  if (modalChart) {
    modalChart.destroy();
    modalChart = undefined;
  }
  $(".chart-container").remove();
}
