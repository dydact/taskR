import React, { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

type Props = {
  role: "user" | "assistant" | "system";
  content: string;
};

export const ChatMessage: React.FC<Props> = ({ role, content }) => {
  const html = useMemo(() => {
    marked.setOptions({
      highlight: (code, lang) => {
        try {
          if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
          }
        } catch {}
        return hljs.highlightAuto(code).value;
      }
    });
    return marked.parse(content);
  }, [content]);

  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // Add copy buttons to code blocks
    const blocks = root.querySelectorAll("pre > code");
    blocks.forEach((codeEl) => {
      const pre = codeEl.parentElement as HTMLElement;
      if (!pre || pre.dataset.hasCopy) return;
      pre.dataset.hasCopy = "1";
      const btn = document.createElement("button");
      btn.className = "code-copy";
      btn.textContent = "Copy";
      btn.onclick = async () => {
        await navigator.clipboard.writeText(codeEl.textContent || "");
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 1200);
      };
      pre.style.position = "relative";
      btn.style.position = "absolute";
      btn.style.top = "8px";
      btn.style.right = "8px";
      pre.appendChild(btn);
    });
  }, [html]);

  return (
    <div className={`chat-msg chat-msg--${role}`}>
      <div className="chat-bubble" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

