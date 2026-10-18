import type { ReactNode } from "react";
import { Spinner } from "@fluentui/react-components";
import { Image20Regular } from "@fluentui/react-icons";
import { useThumbnail } from "../lib/useThumbnail";

interface FileThumbnailProps {
  path: string;
  className?: string;
  /** Shown when the file is not an image the backend can read. */
  fallback?: ReactNode;
}

export function FileThumbnail({ path, className, fallback = <Image20Regular /> }: FileThumbnailProps) {
  const thumb = useThumbnail(path);
  if (thumb === undefined) return <Spinner size="extra-tiny" />;
  if (!thumb) return <>{fallback}</>;
  return <img src={thumb.dataUrl} className={className} alt="" loading="lazy" draggable={false} />;
}
