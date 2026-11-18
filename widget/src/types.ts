/**
 * Rasa response and custom payload shapes understood by the widget.
 * See https://rasa.com/docs/reference/channels/your-own-website/
 */

export interface RasaButton {
  title: string;
  payload: string;
}

export interface RasaAttachment {
  type?: string;
  payload?: { src?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface RasaCustom {
  payload?: string;
  data?: unknown;
  url?: string;
  title?: string;
  [key: string]: unknown;
}

export interface RasaMessage {
  recipient_id?: string;
  text?: string;
  image?: string;
  buttons?: RasaButton[];
  quick_replies?: RasaButton[];
  attachment?: RasaAttachment;
  custom?: RasaCustom;
  elements?: unknown[];
  [key: string]: unknown;
}

export interface CardData {
  title?: string;
  subtitle?: string;
  image?: string;
  url?: string;
  payload?: string;
}

export interface DropDownOption {
  label: string;
  value: string;
}

export interface CollapsibleItem {
  title: string;
  description: string;
}

export interface ChartData {
  title?: string;
  labels?: string[];
  backgroundColor?: string[] | string;
  chartsData?: number[];
  chartType?: string;
  displayLegend?: boolean | string;
}

/** Events emitted by the widget element (`chatbot-widget:<name>`) and the `onEvent` hook. */
export type WidgetEvent =
  | { type: "ready" }
  | { type: "open" }
  | { type: "close" }
  | { type: "message-sent"; text: string; payload: string }
  | { type: "message-received"; messages: RasaMessage[] }
  | { type: "restart" }
  | { type: "clear" }
  | { type: "error"; error: unknown; context?: string };
