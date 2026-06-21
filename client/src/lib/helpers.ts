import deepmerge from "@fastify/deepmerge";

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  timeout = 300,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, timeout);
  };
}

// `align` is a deprecated style key kept for back-compat: it maps onto both
// `justifyContent` and `textAlign` so existing host payloads don't break.
export function applyLegacyAlign(style: Record<string, any> | undefined): Record<string, any> {
  const { align, ...rest } = style ?? {};
  if (align !== undefined) {
    rest.justifyContent = align;
    rest.textAlign = align;
  }
  return rest;
}

export function mergeProps(defaultProps: Record<string, any>, customProps: Record<string, any>) {
  const overwriteArray = () => {
    return (defaultArray: unknown[], customArray: unknown[]) => customArray || defaultArray;
  };

  return deepmerge({ mergeArray: overwriteArray })(defaultProps, customProps);
}
