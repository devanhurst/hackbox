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

// `align` is a deprecated style key. It historically set both a component's flex
// `justify-content` and its `text-align`. New payloads should use the standard
// CSS keys (`textAlign`, `justifyContent`) directly, but we keep translating
// `align` onto them so existing host payloads don't break. Returns a new style
// object with `align` removed. Used by the components where `align` had an
// effect (Text and the button-style components).
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
