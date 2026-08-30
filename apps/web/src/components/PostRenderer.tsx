import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image, { type ImageProps } from "next/image";

/**
 * The single rendering path for a post's content — used for the live
 * page, the preview route, and (in read-only mode) could back an
 * editor preview too. See design doc §9: react-markdown ignores
 * embedded HTML by default — do NOT add rehype-raw without
 * sanitisation, since posts publish with no review step.
 */
export function PostRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: (props) => (
            <Image
              {...(props as ImageProps)}
              width={800}
              height={450}
              alt={props.alt ?? ""}
              className="rounded-md"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
