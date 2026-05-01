import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

export function OSCReference() {
  const [markdown, setMarkdown] = useState<string>("Loading...");

  useEffect(() => {
    fetch("/docs/OSC_API.md")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load OSC Reference");
        return res.text();
      })
      .then(setMarkdown)
      .catch((err) => setMarkdown("Error loading OSC Reference: " + err.message));
  }, []);

  return (
    <div className="p-6 overflow-auto max-h-[calc(100vh-140px)]">
      <div className="max-w-4xl mx-auto prose prose-invert prose-amber prose-pre:bg-zinc-900">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </div>
    </div>
  );
}
