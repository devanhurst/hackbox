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

export function mergeProps(defaultProps: Record<string, any>, customProps: Record<string, any>) {
  const overwriteArray = () => {
    return (defaultArray: unknown[], customArray: unknown[]) => customArray || defaultArray;
  };

  return deepmerge({ mergeArray: overwriteArray })(defaultProps, customProps);
}
