import test from "node:test";
import assert from "node:assert/strict";
import {
  AiService, StubAiProvider, AiProviderError, createAiContextPackage, AI_FOUNDATION_VERSION,
} from "@orbit/vault-core";
import type {
  AiContextItem, AiContextPackage, AiModelProvider, AiProposalRequest,
  AiProviderRawResponse, AiRawProposal,
} from "@orbit/vault-types";

const PROJECT = "project-alpha";
const fixedNow = () => "2026-08-06T12:00:00.000Z";

const item = (over: Partial<AiContextItem> & Pick<AiContextItem, "id">): AiContextItem => ({
  kind: "document", label: "Doc", content: "some content", sourceRef: "doc-001", ...over,
});

const context = (over?: Partial<AiContextPackage>): AiContextPackage =>
  createAiContextPackage({
    projectId: PROJECT,
    purpose: "draft a fact from the readme",
    items: [item({ id: "ctx-1" })],
    now: fixedNow,
    ...over,
  });

const request = (over?: Partial<AiProposalRequest>): AiProposalRequest => ({
  projectId: PROJECT,
  purpose: "draft a fact from the readme",
  desiredKind: "knowledge",
  context: context(),
  ...over,
});

// A minimal provider used to probe specific invariants.
const providerReturning = (proposals: AiRawProposal[], model: string | null = "test-1"): AiModelProvider => ({
  id: "probe",
  model,
  async generate(): Promise<AiProviderRawResponse> { return { model, proposals }; },
});

const rawProposal = (over?: Partial<AiRawProposal>): AiRawProposal => ({
  kind: "knowledge", title: "A fact", body: "The app is local-first.",
  evidence: [{ kind: "document", ref: "doc-001", locator: null, excerpt: "local-first" }],
  inferred: false, ...over,
});

const service = (provider: AiModelProvider = new StubAiProvider()) =>
  new AiService(provider, { now: fixedNow });

test("createAiContextPackage builds an inspectable, project-scoped package", () => {
  const pkg = context();
  assert.equal(pkg.projectId, PROJECT);
  assert.equal(pkg.items.length, 1);
  assert.equal(pkg.items[0]!.sourceRef, "doc-001");
  assert.equal(pkg.createdAt, fixedNow());
});

test("happy path: stub provider yields a structured, non-canonical proposal", async () => {
  const result = await service().propose(request());
  assert.ok(result.ok, "expected ok result");
  const res = result.value;
  assert.equal(res.projectId, PROJECT);
  assert.equal(res.provider, "stub");
  assert.ok(res.proposals.length >= 1);
  const p = res.proposals[0]!;
  assert.equal(p.status, "proposed");
  assert.equal(p.projectId, PROJECT);
  assert.equal(p.provenance.provider, "stub");
  assert.ok(p.provenance.generatedAt);
});

test("TRUST: every returned proposal is non-canonical (status 'proposed')", async () => {
  const result = await service(providerReturning([rawProposal(), rawProposal({ title: "Second" })])).propose(request());
  assert.ok(result.ok);
  for (const p of result.value.proposals) assert.equal(p.status, "proposed");
});

test("TRUST: proposal projectId is always stamped from the request (no cross-project leakage)", async () => {
  const result = await service(providerReturning([rawProposal()])).propose(request());
  assert.ok(result.ok);
  assert.equal(result.value.projectId, PROJECT);
  for (const p of result.value.proposals) assert.equal(p.projectId, PROJECT);
});

test("TRUST: provenance required — a claim with no evidence and not flagged inferred is rejected", async () => {
  const bad = providerReturning([rawProposal({ evidence: [], inferred: false })]);
  const result = await service(bad).propose(request());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AI_RESPONSE_INVALID");
});

test("TRUST: inference is allowed without cited evidence only when explicitly flagged inferred", async () => {
  const inferred = providerReturning([rawProposal({ evidence: [], inferred: true })]);
  const result = await service(inferred).propose(request());
  assert.ok(result.ok);
  assert.equal(result.value.proposals[0]!.provenance.inferred, true);
  assert.equal(result.value.proposals[0]!.provenance.evidence.length, 0);
});

test("TRUST: project isolation — context from another project is rejected", async () => {
  const result = await service().propose(request({ context: context({ projectId: "project-beta" }) }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AI_PROJECT_ISOLATION");
});

test("provider failure is surfaced as a typed error, never thrown", async () => {
  const throwing: AiModelProvider = {
    id: "boom", model: null,
    async generate(): Promise<AiProviderRawResponse> { throw new Error("kaboom"); },
  };
  const result = await service(throwing).propose(request());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AI_PROVIDER_ERROR");
});

test("transport failures are distinguished from provider errors", async () => {
  const flaky: AiModelProvider = {
    id: "flaky", model: null,
    async generate(): Promise<AiProviderRawResponse> { throw new AiProviderError("offline", { transport: true }); },
  };
  const result = await service(flaky).propose(request());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AI_TRANSPORT_ERROR");
});

test("validation: empty purpose is rejected", async () => {
  const result = await service().propose(request({ purpose: "   " }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AI_VALIDATION_ERROR");
});

test("validation: invalid project identifier is rejected", async () => {
  const result = await service().propose(request({ projectId: "x", context: context({ projectId: "x" }) }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AI_VALIDATION_ERROR");
});

test("validation: provider proposal with an empty title is rejected as invalid", async () => {
  const result = await service(providerReturning([rawProposal({ title: "  " })])).propose(request());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "AI_RESPONSE_INVALID");
});

test("provider-neutral: the same service works across different provider implementations", async () => {
  const a = await service(providerReturning([rawProposal()], "model-a")).propose(request());
  const b = await service(new StubAiProvider({ model: "stub-x" })).propose(request());
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) {
    assert.equal(a.value.provider, "probe");
    assert.equal(b.value.provider, "stub");
  }
});

test("deterministic: identical request + clock yields identical ids", async () => {
  const first = await service().propose(request());
  const second = await service().propose(request());
  assert.ok(first.ok && second.ok);
  if (first.ok && second.ok) {
    assert.equal(first.value.requestId, second.value.requestId);
    assert.deepEqual(
      first.value.proposals.map(p => p.id),
      second.value.proposals.map(p => p.id),
    );
  }
});

test("version marker is exported", () => {
  assert.equal(typeof AI_FOUNDATION_VERSION, "string");
});
