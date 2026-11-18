import type { Chart as ChartType, ChartConfiguration, ChartTypeRegistry } from "chart.js";
import { h, icon, ICONS } from "../dom";
import type { ChartData } from "../types";
import type { RenderContext } from "./index";

const SUPPORTED_TYPES = new Set([
  "bar",
  "line",
  "pie",
  "doughnut",
  "polarArea",
  "radar",
  "scatter",
  "bubble",
]);

function legendEnabled(value: ChartData["displayLegend"]): boolean {
  return value === true || value === "true";
}

function toConfig(data: ChartData, compact: boolean): ChartConfiguration {
  const type = (
    SUPPORTED_TYPES.has(String(data.chartType)) ? data.chartType : "bar"
  ) as keyof ChartTypeRegistry;
  const labels = Array.isArray(data.labels) ? data.labels.map(String) : [];
  const values = Array.isArray(data.chartsData) ? data.chartsData.map(Number) : [];
  return {
    type,
    data: {
      labels,
      datasets: [
        {
          label: String(data.title ?? ""),
          data: values,
          backgroundColor: data.backgroundColor,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: !compact,
      plugins: {
        title: { display: Boolean(data.title), text: String(data.title ?? "") },
        legend: {
          display: legendEnabled(data.displayLegend),
          position: "right",
          labels: compact ? { boxWidth: 8, font: { size: 10 } } : {},
        },
      },
    },
  };
}

async function mount(canvas: HTMLCanvasElement, config: ChartConfiguration): Promise<ChartType> {
  const { Chart } = await import("chart.js/auto");
  return new Chart(canvas, config);
}

/**
 * Render a chart message. Chart.js is loaded on first use so pages without
 * charts never pay for it.
 */
export function renderChart(data: ChartData, ctx: RenderContext): HTMLElement {
  const canvas = h("canvas", {
    class: "cw-chart__canvas",
    role: "img",
    "aria-label": String(data.title ?? "Chart"),
  });
  const expand = h(
    "button",
    {
      class: "cw-chart__expand",
      type: "button",
      "aria-label": ctx.config.messages.expandChart,
      title: ctx.config.messages.expandChart,
    },
    icon(ICONS.openInNew),
  );
  const container = h("div", { class: "cw-chart" }, [expand, canvas]);

  let instance: ChartType | null = null;
  mount(canvas, toConfig(data, true))
    .then((chart) => {
      instance = chart;
    })
    .catch((error) => ctx.log("Chart failed to load", error));

  expand.addEventListener("click", () => {
    const big = h("canvas", {
      class: "cw-chart__canvas cw-chart__canvas--modal",
      role: "img",
      "aria-label": String(data.title ?? "Chart"),
    });
    const wrapper = h("div", { class: "cw-chart cw-chart--modal" }, big);
    ctx.openModal(wrapper, String(data.title ?? ctx.config.messages.expandChart));
    mount(big, toConfig(data, false)).catch((error) => ctx.log("Chart failed to load", error));
  });

  // free the chart when the element leaves the DOM
  const observer = new MutationObserver(() => {
    if (!container.isConnected) {
      instance?.destroy();
      observer.disconnect();
    }
  });
  queueMicrotask(() => {
    const root = container.getRootNode();
    if (root instanceof Node) observer.observe(root, { childList: true, subtree: true });
  });

  return container;
}
