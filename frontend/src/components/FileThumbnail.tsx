import { useEffect, useRef, useState, type ReactNode } from "react";
import { makeStyles, Spinner } from "@fluentui/react-components";
import { Image20Regular } from "@fluentui/react-icons";
import { useThumbnail } from "../lib/useThumbnail";

const useStyles = makeStyles({
  slot: { display: "contents" },
});

interface FileThumbnailProps {
  path: string;
  className?: string;
  /** Shown when the file is not an image the backend can read. */
  fallback?: ReactNode;
}

/** True once the element's container has come near the visible part of the page. */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = ref.current;
    if (seen || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(node.parentElement ?? node);
    return () => observer.disconnect();
  }, [seen]);

  return { ref, seen };
}

export function FileThumbnail({ path, className, fallback = <Image20Regular /> }: FileThumbnailProps) {
  const styles = useStyles();
  const { ref, seen } = useSeen<HTMLSpanElement>();
  const thumb = useThumbnail(path, seen);
  let content: ReactNode;
  if (thumb === undefined) content = <Spinner size="extra-tiny" />;
  else if (!thumb) content = fallback;
  else content = <img src={thumb.dataUrl} className={className} alt="" draggable={false} />;
  return (
    <span ref={ref} className={styles.slot}>
      {content}
    </span>
  );
}
