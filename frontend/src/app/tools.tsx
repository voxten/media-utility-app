// Single source of truth for navigation, the Home page tiles and routing.

import {
  ArrowDownload24Filled,
  ArrowDownload24Regular,
  bundleIcon,
  DataBarHorizontal24Filled,
  DataBarHorizontal24Regular,
  DocumentCopy24Filled,
  DocumentCopy24Regular,
  DocumentPdf24Filled,
  DocumentPdf24Regular,
  ImageArrowForward24Filled,
  ImageArrowForward24Regular,
  ImageEdit24Filled,
  ImageEdit24Regular,
  PersonVoice24Filled,
  PersonVoice24Regular,
  type FluentIcon,
} from "@fluentui/react-icons";

export type CategoryId = "video" | "image" | "text" | "pdf" | "system" | "generators";

export interface ToolDefinition {
  id: string;
  category: CategoryId;
  icon: FluentIcon;
  /** Accent used for the icon tile on the Home page. */
  accent: string;
}

export const CATEGORIES: CategoryId[] = ["video", "image", "text", "pdf", "system", "generators"];

export const TOOLS: ToolDefinition[] = [
  { id: "download", category: "video", icon: bundleIcon(ArrowDownload24Filled, ArrowDownload24Regular), accent: "#e0475b" },
  { id: "converter", category: "image", icon: bundleIcon(ImageArrowForward24Filled, ImageArrowForward24Regular), accent: "#2f8fd8" },
  { id: "watermark", category: "image", icon: bundleIcon(ImageEdit24Filled, ImageEdit24Regular), accent: "#8a5cf6" },
  { id: "tts", category: "text", icon: bundleIcon(PersonVoice24Filled, PersonVoice24Regular), accent: "#14a37f" },
  { id: "pdf", category: "pdf", icon: bundleIcon(DocumentPdf24Filled, DocumentPdf24Regular), accent: "#d9480f" },
  { id: "duplicates", category: "system", icon: bundleIcon(DocumentCopy24Filled, DocumentCopy24Regular), accent: "#c2851a" },
  { id: "progress", category: "generators", icon: bundleIcon(DataBarHorizontal24Filled, DataBarHorizontal24Regular), accent: "#0e9aa7" },
];

export const toolById = (id: string) => TOOLS.find((tool) => tool.id === id);
