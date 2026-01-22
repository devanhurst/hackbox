import DOMPurify from "dompurify";
import { marked } from "marked";

export default (text: string) => {
  const html = marked.parse(text) as string;
  const sanitized = DOMPurify.sanitize(html);
  return sanitized;
};
