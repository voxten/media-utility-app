import { forwardRef } from "react";
import { bundleIcon, type FluentIcon, type FluentIconsProps } from "@fluentui/react-icons";

// Fluent UI standard document sheet paths
const DOC_REGULAR =
  "M18.5 20a.5.5 0 0 1-.5.5h-5.73a7 7 0 0 1-1.08 1.5H18a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L13.6 2.6c-.37-.37-.9-.59-1.42-.59H6a2 2 0 0 0-2 2v7.5q.71-.3 1.5-.42V4c0-.27.22-.5.5-.5h6V8c0 1.1.9 2 2 2h4.5zm-5-15.38 3.88 3.88H14a.5.5 0 0 1-.5-.5z";

const DOC_FILLED =
  "M12 2v6c0 1.1.9 2 2 2h6v10a2 2 0 0 1-2 2h-6.81A6.5 6.5 0 0 0 4 11.5V4c0-1.1.9-2 2-2zm1.5.5V8c0 .28.22.5.5.5h5.5z";

export const DocumentCompress24Regular: FluentIcon = forwardRef<SVGSVGElement, FluentIconsProps>(
  (props, ref) => {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        <path d={DOC_REGULAR} fill="currentColor" />
        <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4.2 15.2h2.3V17.5M8.8 19.8H6.5v-2.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.2 15.2l2.3 2.3m2.3 2.3l-2.3-2.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
);
DocumentCompress24Regular.displayName = "DocumentCompress24Regular";

export const DocumentCompress24Filled: FluentIcon = forwardRef<SVGSVGElement, FluentIconsProps>(
  (props, ref) => {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        <path d={DOC_FILLED} fill="currentColor" />
        <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4.2 15.2h2.3V17.5M8.8 19.8H6.5v-2.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.2 15.2l2.3 2.3m2.3 2.3l-2.3-2.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
);
DocumentCompress24Filled.displayName = "DocumentCompress24Filled";

export const DocumentCompress24: FluentIcon = bundleIcon(
  DocumentCompress24Filled,
  DocumentCompress24Regular
);

export const DocumentSplit24Regular: FluentIcon = forwardRef<SVGSVGElement, FluentIconsProps>(
  (props, ref) => {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        <path d={DOC_REGULAR} fill="currentColor" />
        <path
          d="M10.5 13.5L5.5 18.5M10.5 18.5L5.5 13.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="4.2" cy="13.2" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="4.2" cy="18.8" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
);
DocumentSplit24Regular.displayName = "DocumentSplit24Regular";

export const DocumentSplit24Filled: FluentIcon = forwardRef<SVGSVGElement, FluentIconsProps>(
  (props, ref) => {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        <path d={DOC_FILLED} fill="currentColor" />
        <path
          d="M10.5 13.5L5.5 18.5M10.5 18.5L5.5 13.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="4.2" cy="13.2" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="4.2" cy="18.8" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
);
DocumentSplit24Filled.displayName = "DocumentSplit24Filled";

export const DocumentSplit24: FluentIcon = bundleIcon(
  DocumentSplit24Filled,
  DocumentSplit24Regular
);

export const DocumentConvert24Regular: FluentIcon = forwardRef<SVGSVGElement, FluentIconsProps>(
  (props, ref) => {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        <path d={DOC_REGULAR} fill="currentColor" />
        <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8.8 15.2a3 3 0 0 0-4.3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M4.5 14.5v1.4h1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.2 19.8a3 3 0 0 0 4.3-.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M8.5 20.5v-1.4H7.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
);
DocumentConvert24Regular.displayName = "DocumentConvert24Regular";

export const DocumentConvert24Filled: FluentIcon = forwardRef<SVGSVGElement, FluentIconsProps>(
  (props, ref) => {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        <path d={DOC_FILLED} fill="currentColor" />
        <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8.8 15.2a3 3 0 0 0-4.3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M4.5 14.5v1.4h1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.2 19.8a3 3 0 0 0 4.3-.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M8.5 20.5v-1.4H7.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
);
DocumentConvert24Filled.displayName = "DocumentConvert24Filled";

export const DocumentConvert24: FluentIcon = bundleIcon(
  DocumentConvert24Filled,
  DocumentConvert24Regular
);

export const DocumentExtract24Regular: FluentIcon = forwardRef<SVGSVGElement, FluentIconsProps>(
  (props, ref) => {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        <path d={DOC_REGULAR} fill="currentColor" />
        <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4 15.5h5M4 17.5h5M4 19.5h3.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
);
DocumentExtract24Regular.displayName = "DocumentExtract24Regular";

export const DocumentExtract24Filled: FluentIcon = forwardRef<SVGSVGElement, FluentIconsProps>(
  (props, ref) => {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        <path d={DOC_FILLED} fill="currentColor" />
        <circle cx="6.5" cy="17.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4 15.5h5M4 17.5h5M4 19.5h3.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
);
DocumentExtract24Filled.displayName = "DocumentExtract24Filled";

export const DocumentExtract24: FluentIcon = bundleIcon(
  DocumentExtract24Filled,
  DocumentExtract24Regular
);
