// Single source of truth for navigation, the Home page tiles and routing.

import {
  ArrowDownload24Filled,
  ArrowDownload24Regular,
  ArrowMaximize24Filled,
  ArrowMaximize24Regular,
  ArrowMinimize24Filled,
  ArrowMinimize24Regular,
  bundleIcon,
  Camera24Filled,
  Camera24Regular,
  ClosedCaption24Filled,
  ClosedCaption24Regular,
  Crop24Filled,
  Crop24Regular,
  DataBarHorizontal24Filled,
  DataBarHorizontal24Regular,
  DocumentPdf24Regular,
  DocumentMultiple24Filled,
  DocumentMultiple24Regular,
  FilmstripImage24Filled,
  FilmstripImage24Regular,
  FolderSearch24Filled,
  FolderSearch24Regular,
  Gif24Filled,
  Gif24Regular,
  Image24Regular,
  ImageArrowForward24Filled,
  ImageArrowForward24Regular,
  ImageEdit24Filled,
  ImageEdit24Regular,
  PersonVoice24Filled,
  PersonVoice24Regular,
  Timeline24Filled,
  TextT24Regular,
  Timeline24Regular,
  Video24Regular,
  Wand24Filled,
  Wand24Regular,
  Wrench24Regular,
  type FluentIcon,
} from "@fluentui/react-icons";
import {
  DocumentCompress24,
  DocumentConvert24,
  DocumentExtract24,
  DocumentSplit24,
} from "./customIcons";
import type { MediaKind } from "../lib/fileTypes";

export type CategoryId = "video" | "gif" | "image" | "text" | "pdf" | "system" | "generators";

export interface ToolDefinition {
  id: string;
  category: CategoryId;
  icon: FluentIcon;
  /** Accent used for the icon tile on the Home page. */
  accent: string;
  /** File kinds the tool takes from "Send to"; an object opens a sub-tab, whose name replaces the description. */
  accepts?: Partial<Record<MediaKind, true | { subTab: string; noteKey: string }>>;
}

export const CATEGORIES: CategoryId[] = ["video", "gif", "image", "text", "pdf", "system", "generators"];

export const CATEGORY_ACCENTS: Record<CategoryId, string> = {
  video: "#e0475b",
  gif: "#8b5cf6",
  image: "#3b82f6",
  text: "#14a37f",
  pdf: "#d9480f",
  system: "#c2851a",
  generators: "#0e9aa7",
};

/** Shown next to the category name on the Home page. */
export const CATEGORY_ICONS: Record<CategoryId, FluentIcon> = {
  video: Video24Regular,
  gif: Gif24Regular,
  image: Image24Regular,
  text: TextT24Regular,
  pdf: DocumentPdf24Regular,
  system: Wrench24Regular,
  generators: DataBarHorizontal24Regular,
};

export const SETTINGS_ACCENT = "#5b6b7f";

export const TOOLS: ToolDefinition[] = [
  { id: "download", category: "video", icon: bundleIcon(ArrowDownload24Filled, ArrowDownload24Regular), accent: CATEGORY_ACCENTS.video },
  { id: "instagram", category: "video", icon: bundleIcon(Camera24Filled, Camera24Regular), accent: CATEGORY_ACCENTS.video },
  { id: "video_sync", category: "video", icon: bundleIcon(Timeline24Filled, Timeline24Regular), accent: CATEGORY_ACCENTS.video, accepts: { video: true } },
  { id: "video_to_gif", category: "gif", icon: bundleIcon(FilmstripImage24Filled, FilmstripImage24Regular), accent: CATEGORY_ACCENTS.gif, accepts: { video: true } },
  { id: "gif_editor", category: "gif", icon: bundleIcon(Gif24Filled, Gif24Regular), accent: CATEGORY_ACCENTS.gif, accepts: { gif: true } },
  { id: "compressor", category: "image", icon: bundleIcon(ArrowMinimize24Filled, ArrowMinimize24Regular), accent: CATEGORY_ACCENTS.image, accepts: { image: true } },
  { id: "image_tools", category: "image", icon: bundleIcon(Crop24Filled, Crop24Regular), accent: CATEGORY_ACCENTS.image, accepts: { image: true } },
  { id: "converter", category: "image", icon: bundleIcon(ImageArrowForward24Filled, ImageArrowForward24Regular), accent: CATEGORY_ACCENTS.image, accepts: { image: true, gif: true } },
  { id: "rembg", category: "image", icon: bundleIcon(Wand24Filled, Wand24Regular), accent: CATEGORY_ACCENTS.image, accepts: { image: true } },
  { id: "upscale", category: "image", icon: bundleIcon(ArrowMaximize24Filled, ArrowMaximize24Regular), accent: CATEGORY_ACCENTS.image, accepts: { image: true } },
  { id: "watermark", category: "image", icon: bundleIcon(ImageEdit24Filled, ImageEdit24Regular), accent: CATEGORY_ACCENTS.image, accepts: { image: true } },
  { id: "tts", category: "text", icon: bundleIcon(PersonVoice24Filled, PersonVoice24Regular), accent: CATEGORY_ACCENTS.text },
  { id: "transcribe", category: "text", icon: bundleIcon(ClosedCaption24Filled, ClosedCaption24Regular), accent: CATEGORY_ACCENTS.text, accepts: { video: true } },
  { id: "pdf", category: "pdf", icon: bundleIcon(DocumentMultiple24Filled, DocumentMultiple24Regular), accent: CATEGORY_ACCENTS.pdf, accepts: { pdf: true } },
  { id: "pdf_compress", category: "pdf", icon: DocumentCompress24, accent: CATEGORY_ACCENTS.pdf, accepts: { pdf: true } },
  { id: "pdf_split", category: "pdf", icon: DocumentSplit24, accent: CATEGORY_ACCENTS.pdf, accepts: { pdf: true } },
  {
    id: "pdf_convert",
    category: "pdf",
    icon: DocumentConvert24,
    accent: CATEGORY_ACCENTS.pdf,
    accepts: {
      image: { subTab: "imagesToPdf", noteKey: "pdf.convert.imagesToPdf" },
      gif: { subTab: "imagesToPdf", noteKey: "pdf.convert.imagesToPdf" },
      pdf: { subTab: "pdfToImages", noteKey: "pdf.convert.pdfToImages" },
    },
  },
  { id: "pdf_extract", category: "pdf", icon: DocumentExtract24, accent: CATEGORY_ACCENTS.pdf, accepts: { pdf: true } },
  { id: "duplicates", category: "system", icon: bundleIcon(FolderSearch24Filled, FolderSearch24Regular), accent: CATEGORY_ACCENTS.system },
  { id: "progress", category: "generators", icon: bundleIcon(DataBarHorizontal24Filled, DataBarHorizontal24Regular), accent: CATEGORY_ACCENTS.generators },
];

export const toolById = (id: string) => TOOLS.find((tool) => tool.id === id);

// Job kinds whose prefix is not the id of the tool that started them.
const JOB_KIND_TOOLS: Record<string, string> = {
  "pdf.compress": "pdf_compress",
  "pdf.split": "pdf_split",
  "pdf.to_images": "pdf_convert",
  "pdf.from_images": "pdf_convert",
  "pdf.extract_text": "pdf_extract",
  image_editor: "image_tools",
};

export const toolForJob = (kind: string) => toolById(JOB_KIND_TOOLS[kind] ?? kind.split(".")[0]);
