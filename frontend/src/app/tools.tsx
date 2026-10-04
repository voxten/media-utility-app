// Single source of truth for navigation, the Home page tiles and routing.

import {
  ArrowDownload24Filled,
  ArrowDownload24Regular,
  ArrowMaximize24Filled,
  ArrowMaximize24Regular,
  ArrowMinimize24Filled,
  ArrowMinimize24Regular,
  bundleIcon,
  Crop24Filled,
  Crop24Regular,
  DataBarHorizontal24Filled,
  DataBarHorizontal24Regular,
  DocumentMultiple24Filled,
  DocumentMultiple24Regular,
  FolderSearch24Filled,
  FolderSearch24Regular,
  ImageArrowForward24Filled,
  ImageArrowForward24Regular,
  ImageEdit24Filled,
  ImageEdit24Regular,
  PersonVoice24Filled,
  PersonVoice24Regular,
  Timeline24Filled,
  Timeline24Regular,
  Wand24Filled,
  Wand24Regular,
  type FluentIcon,
} from "@fluentui/react-icons";
import {
  DocumentCompress24,
  DocumentConvert24,
  DocumentExtract24,
  DocumentSplit24,
} from "./customIcons";

export type CategoryId = "video" | "image" | "text" | "pdf" | "system" | "generators";

export interface ToolDefinition {
  id: string;
  category: CategoryId;
  icon: FluentIcon;
  /** Accent used for the icon tile on the Home page. */
  accent: string;
}

export const CATEGORIES: CategoryId[] = ["video", "image", "text", "pdf", "system", "generators"];

export const CATEGORY_ACCENTS: Record<CategoryId, string> = {
  video: "#e0475b",
  image: "#3b82f6",
  text: "#14a37f",
  pdf: "#d9480f",
  system: "#c2851a",
  generators: "#0e9aa7",
};

export const TOOLS: ToolDefinition[] = [
  { id: "download", category: "video", icon: bundleIcon(ArrowDownload24Filled, ArrowDownload24Regular), accent: CATEGORY_ACCENTS.video },
  { id: "video_sync", category: "video", icon: bundleIcon(Timeline24Filled, Timeline24Regular), accent: CATEGORY_ACCENTS.video },
  { id: "compressor", category: "image", icon: bundleIcon(ArrowMinimize24Filled, ArrowMinimize24Regular), accent: CATEGORY_ACCENTS.image },
  { id: "image_tools", category: "image", icon: bundleIcon(Crop24Filled, Crop24Regular), accent: CATEGORY_ACCENTS.image },
  { id: "converter", category: "image", icon: bundleIcon(ImageArrowForward24Filled, ImageArrowForward24Regular), accent: CATEGORY_ACCENTS.image },
  { id: "rembg", category: "image", icon: bundleIcon(Wand24Filled, Wand24Regular), accent: CATEGORY_ACCENTS.image },
  { id: "upscale", category: "image", icon: bundleIcon(ArrowMaximize24Filled, ArrowMaximize24Regular), accent: CATEGORY_ACCENTS.image },
  { id: "watermark", category: "image", icon: bundleIcon(ImageEdit24Filled, ImageEdit24Regular), accent: CATEGORY_ACCENTS.image },
  { id: "tts", category: "text", icon: bundleIcon(PersonVoice24Filled, PersonVoice24Regular), accent: CATEGORY_ACCENTS.text },
  { id: "pdf", category: "pdf", icon: bundleIcon(DocumentMultiple24Filled, DocumentMultiple24Regular), accent: CATEGORY_ACCENTS.pdf },
  { id: "pdf_compress", category: "pdf", icon: DocumentCompress24, accent: CATEGORY_ACCENTS.pdf },
  { id: "pdf_split", category: "pdf", icon: DocumentSplit24, accent: CATEGORY_ACCENTS.pdf },
  { id: "pdf_convert", category: "pdf", icon: DocumentConvert24, accent: CATEGORY_ACCENTS.pdf },
  { id: "pdf_extract", category: "pdf", icon: DocumentExtract24, accent: CATEGORY_ACCENTS.pdf },
  { id: "duplicates", category: "system", icon: bundleIcon(FolderSearch24Filled, FolderSearch24Regular), accent: CATEGORY_ACCENTS.system },
  { id: "progress", category: "generators", icon: bundleIcon(DataBarHorizontal24Filled, DataBarHorizontal24Regular), accent: CATEGORY_ACCENTS.generators },
];

export const toolById = (id: string) => TOOLS.find((tool) => tool.id === id);
