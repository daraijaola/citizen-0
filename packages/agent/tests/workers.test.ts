import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { JobListing } from "@citizen-0/shared";
import { classifyJob } from "../src/workers/types.js";
import { selectWorker, produceDeliverablePipeline } from "../src/workers/pipeline.js";
import { runSelfQa } from "../src/workers/qa.js";
import { ResearchBriefWorker } from "../src/workers/research.js";

function job(title: string): JobListing {
  return {
    id: "job-1",
    title,
    rewardLamports: 5_000_000n,
    deadlineUnix: Math.floor(Date.now() / 1000) + 86400,
    requiredCapabilities: 1n,
    minReputation: 0,
    jobSpecUri: "mock://spec",
    jobSpecHash: "abc",
    claimable: true,
    source: "mock",
  };
}

describe("workers + QA", () => {
  it("classifies job kinds", () => {
    assert.equal(classifyJob(job("Research brief on Nexus")), "research_brief");
    assert.equal(classifyJob(job("Summarize delinquency rules")), "summarization");
    assert.equal(classifyJob(job("Extract tokenomics parameters")), "data_extraction");
    assert.equal(classifyJob(job("Draft content for intent signing")), "content");
  });

  it("selects specialized workers", () => {
    assert.equal(selectWorker(job("Research brief on AgenC")).kind, "research_brief");
    assert.equal(selectWorker(job("Summarize the city")).kind, "summarization");
    assert.equal(selectWorker(job("Extract mint parameters")).kind, "data_extraction");
  });

  it("pipeline produces QA-passing deliverable", async () => {
    const out = await produceDeliverablePipeline(
      job("Research brief on Trade Intent Signing and Nexus Energy City"),
    );
    assert.ok(out.qa.ok);
    assert.ok(out.qa.score >= 0.6);
    assert.ok(out.deliverable.bytes.length > 200);
    assert.equal(out.deliverable.sha256Hex.length, 64);
    assert.ok(out.deliverable.resultUri.startsWith("c0://"));
  });

  it("QA rejects empty junk", async () => {
    const worker = new ResearchBriefWorker();
    const good = await worker.execute(job("Research brief on Nexus"));
    const qaGood = runSelfQa(job("Research brief on Nexus"), good);
    assert.equal(qaGood.ok, true);

    const qaBad = runSelfQa(job("Research brief on Nexus"), {
      kind: "research_brief",
      engine: "deterministic",
      title: "x",
      sections: [{ heading: "A", body: "short" }],
      metadata: {},
    });
    assert.equal(qaBad.ok, false);
  });
});
