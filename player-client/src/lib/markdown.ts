import * as DOMPurify from "dompurify";
import { marked } from "marked";

export default (text: string) => {
  const markdown = marked.parse(text) as string;
  return DOMPurify.sanitize(markdown);
};
