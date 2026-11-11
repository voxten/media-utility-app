import { createContext, useContext } from "react";

/** Width of a page's content column; the docked ActionBar lines its content up with it. */
export const PAGE_MAX_WIDTH = "1200px";
export const PAGE_GUTTER = "40px";

/** The strip under a page's scroll area; ActionBar portals into it so it never covers page content. */
export const PageFooterContext = createContext<HTMLElement | null>(null);

export const usePageFooter = () => useContext(PageFooterContext);
