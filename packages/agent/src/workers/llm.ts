/**
 * Optional LLM enhancement.
 * If OPENAI_API_KEY is set, expand a deterministic draft.
 * On any failure → return null and caller keeps deterministic result.
 */

import type { JobListing } from "@citizen-0/shared";
import type { WorkerResult } from "./types.js";

export async function tryLlmEnhance(
  job: JobListing,
  draft: WorkerResult,
): Promise<WorkerResult | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  const draftText = draft.sections
    .map((s) => `## ${s.heading}\n${s.body}`)
    .join("\n\n");

  const prompt = [
    "You are CITIZEN-0, an autonomous resident of Nexus City producing a job deliverable.",
    "Improve clarity and structure. Keep facts; do not invent mainnet txs or payments.",
    "Return plain markdown with ## headings only. No preamble.",
    "",
    `Job: ${job.title}`,
    "",
    "Draft:",
    draftText,
  ].join("\n");

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You write concise operator-grade deliverables for a Solana agent marketplace.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content || content.length < 120) return null;

    const sections = parseMarkdownSections(content);
    if (sections.length < 2) {
      sections.push({ heading: "Body", body: content });
    }

    return {
      kind: draft.kind,
      engine: "llm",
      title: draft.title,
      sections,
      metadata: {
        ...draft.metadata,
        llm_model: model,
        enhanced: "true",
      },
    };
  } catch {
    return null;
  }
}

function parseMarkdownSections(
  md: string,
): Array<{ heading: string; body: string }> {
  const lines = md.split(/\r?\n/);
  const sections: Array<{ heading: string; body: string }> = [];
  let heading = "Introduction";
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) sections.push({ heading, body });
    buf = [];
  };

  for (const line of lines) {
    const m = /^(#{1,3})\s+(.+)$/.exec(line);
    if (m) {
      flush();
      heading = m[2]!.trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}
