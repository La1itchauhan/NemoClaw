// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeLocalIdentity } from "../../../inference/native-local/contract";
import { createSession } from "../../../state/onboard-session";
import {
  clearNativeLocalProviderAuthority,
  setNativeLocalProviderAuthority,
} from "../../../state/registry/native-local-provider-authority";
import { handleProviderInferenceState } from "./provider-inference";
import { baseOptions, createDeps } from "./provider-inference.test-support";

const recorded: Parameters<typeof setNativeLocalProviderAuthority>[0][] = [];

function recordAuthority(sandboxName: string, provider: "ollama-local" | "vllm-local"): void {
  const binding = {
    provider,
    agent: "openclaw",
    endpointUrl: "http://host.openshell.internal:11435/v1",
    credentialEnv: "NEMOCLAW_LOCAL_INFERENCE_TOKEN",
    authMode: "authenticated",
    gatewayName: "nemoclaw",
    sandboxName,
  } as const;
  const receipt = {
    ...binding,
    ...nativeLocalIdentity(binding),
    schemaVersion: 1 as const,
    providerId: `provider-${sandboxName}-${provider}`,
  };
  setNativeLocalProviderAuthority(receipt);
  recorded.push(receipt);
}

async function resumeNativeLocal() {
  // A sibling sandbox on a reused gateway can already own the matching shared
  // route, so the shared route is ready for every case below.
  const session = createSession({
    agent: "openclaw",
    sandboxName: "pv2-probe",
    provider: "ollama-local",
    model: "llama3.1:8b",
    endpointUrl: "http://host.openshell.internal:11435/v1",
  });
  session.steps.provider_selection.status = "complete";
  const { deps, calls } = createDeps({
    isInferenceRouteReady: vi.fn(() => true),
    // Use the production registry lookup.
    hasNativeLocalProviderAuthority: undefined,
  });
  calls.complete.mockResolvedValue(session);
  await handleProviderInferenceState({
    ...baseOptions(deps, session),
    resume: true,
    sandboxName: "pv2-probe",
    agent: { name: "openclaw" },
  });
  return calls;
}

describe("native local provider inference resume (#13540)", () => {
  afterEach(() => {
    for (const receipt of recorded.splice(0)) clearNativeLocalProviderAuthority(receipt);
  });

  it("reruns inference setup when no native authority is recorded", async () => {
    const calls = await resumeNativeLocal();

    expect(calls.skipped).not.toHaveBeenCalledWith("inference", "ollama-local / llama3.1:8b");
    expect(calls.setupInference).toHaveBeenCalledWith(
      "pv2-probe",
      "llama3.1:8b",
      "ollama-local",
      "http://host.openshell.internal:11435/v1",
      null,
      null,
      [],
      expect.objectContaining({ agentName: "openclaw", gatewayName: "nemoclaw" }),
    );
  });

  it.each([
    { name: "a sibling sandbox", sandboxName: "old-135", provider: "ollama-local" as const },
    { name: "another provider", sandboxName: "pv2-probe", provider: "vllm-local" as const },
  ])(
    "reruns inference setup when only $name has native authority",
    async ({ sandboxName, provider }) => {
      recordAuthority(sandboxName, provider);

      const calls = await resumeNativeLocal();

      expect(calls.skipped).not.toHaveBeenCalledWith("inference", "ollama-local / llama3.1:8b");
      expect(calls.setupInference).toHaveBeenCalledOnce();
    },
  );

  it("skips inference setup once this sandbox records authority for the provider", async () => {
    recordAuthority("pv2-probe", "ollama-local");

    const calls = await resumeNativeLocal();

    expect(calls.skipped).toHaveBeenCalledWith("inference", "ollama-local / llama3.1:8b");
    expect(calls.setupInference).not.toHaveBeenCalled();
  });

  it("still skips a ready shared route for a shared-route selection", async () => {
    const session = createSession({
      provider: "compatible-endpoint",
      model: "nemotron-3-super",
      endpointUrl: "https://compatible.example.test/v1",
      credentialEnv: "COMPATIBLE_API_KEY",
      preferredInferenceApi: "openai-completions",
    });
    session.steps.provider_selection.status = "complete";
    const { deps, calls } = createDeps({ isInferenceRouteReady: vi.fn(() => true) });
    calls.complete.mockResolvedValue(session);

    await handleProviderInferenceState({
      ...baseOptions(deps, session),
      resume: true,
      sandboxName: "spark-assistant",
    });

    expect(calls.skipped).toHaveBeenCalledWith(
      "inference",
      "compatible-endpoint / nemotron-3-super",
    );
    expect(calls.setupInference).not.toHaveBeenCalled();
  });
});
