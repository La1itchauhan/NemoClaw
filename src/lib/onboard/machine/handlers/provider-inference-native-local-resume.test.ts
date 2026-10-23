// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import { createSession } from "../../../state/onboard-session";
import { handleProviderInferenceState } from "./provider-inference";
import { baseOptions, createDeps } from "./provider-inference.test-support";

describe("native local provider inference resume (#13540)", () => {
  it("reruns inference setup when only the shared route is ready", async () => {
    // A sibling sandbox on a reused gateway already owns the matching shared
    // route, but this sandbox never received its native provider attachment.
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
      hasNativeLocalProviderAuthority: vi.fn(() => false),
    });
    calls.complete.mockResolvedValue(session);

    await handleProviderInferenceState({
      ...baseOptions(deps, session),
      resume: true,
      sandboxName: "pv2-probe",
      agent: { name: "openclaw" },
    });

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

  it("skips inference setup once this sandbox records its native provider authority", async () => {
    const session = createSession({
      agent: "openclaw",
      sandboxName: "pv2-probe",
      provider: "ollama-local",
      model: "llama3.1:8b",
      endpointUrl: "http://host.openshell.internal:11435/v1",
    });
    session.steps.provider_selection.status = "complete";
    const hasNativeLocalProviderAuthority = vi.fn(() => true);
    const { deps, calls } = createDeps({
      isInferenceRouteReady: vi.fn(() => true),
      hasNativeLocalProviderAuthority,
    });
    calls.complete.mockResolvedValue(session);

    await handleProviderInferenceState({
      ...baseOptions(deps, session),
      resume: true,
      sandboxName: "pv2-probe",
      agent: { name: "openclaw" },
    });

    expect(hasNativeLocalProviderAuthority).toHaveBeenCalledWith("pv2-probe", "nemoclaw");
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
