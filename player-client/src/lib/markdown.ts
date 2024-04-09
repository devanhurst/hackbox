import xss from "xss";
import { marked } from "marked";

export default (text: string) => {
  return xss(marked.parse(text) as string);
};
