// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, expect, it, vi } from "vitest";
import { createHermesStateVolumeDockerHarness } from "../__test-helpers__/hermes-state-volume";
import { managedStartupStateRoots } from "../managed-startup/state-roots";
import { managedImageRuntimeIdentity } from "../managed-image/agents";
import { prepareManagedStateVolumes } from "./managed-state-volumes";
import { createManagedStateVolumeOnboardLifecycle } from "./onboard-orchestration";

vi.mock("../openshell-version", async (original) => ({
  ...(await original<typeof import("../openshell-version")>()),
  SUPPORTED_OPENSHELL_FALLBACK_VERSION: "0.1.3",
}));

const roots = managedStartupStateRoots({
  agent: "openclaw",
  sandboxName: "alpha",
  agentIdentity: managedImageRuntimeIdentity("openclaw"),
});

afterEach(() => vi.unstubAllEnvs());

it("creates workspace-approved volumes and removes only its incomplete creation", () => {
  const docker = createHermesStateVolumeDockerHarness();
  const scope = prepareManagedStateVolumes(
    { roots },
    {
      workspace: "qualification",
      runContainerEngine: docker.runDocker,
      registerExitCleanup: () => () => undefined,
    },
  );
  expect(docker.volume?.labels).toEqual({
    ...roots[0]!.ownershipLabels,
    "openshell.ai/sandbox-attachable": "true",
    "openshell.ai/sandbox-attachable-workspace": "qualification",
  });
  expect(scope?.reused).toEqual([false]);
  scope?.cleanupIncompleteCreate();
  expect(docker.volume).toBeNull();
});

it("binds lifecycle volume approval to the selected workspace", () => {
  vi.stubEnv("OPENSHELL_WORKSPACE", "ambient");
  const docker = createHermesStateVolumeDockerHarness();
  createManagedStateVolumeOnboardLifecycle(
    {
      roots,
      workspace: "selected",
      runtimeProvider: {
        identity: { id: "docker" },
        workload: { managedStateMountDriverId: "docker" },
        containerEngine: {
          supported: true,
          identities: [
            { operation: "sandbox-lifecycle", engineId: "docker", displayName: "Docker" },
          ],
        },
      } as never,
    },
    { runContainerEngine: docker.runDocker },
  );
  expect(docker.volume?.labels["openshell.ai/sandbox-attachable-workspace"]).toBe("selected");
});

it.each<Record<string, string>>([
  {},
  {
    "openshell.ai/sandbox-attachable": "true",
    "openshell.ai/sandbox-attachable-workspace": "another-workspace",
  },
])("preserves retained state without matching workspace approval %j", (approval) => {
  const initial = {
    name: roots[0]!.resourceIdentity,
    labels: { ...roots[0]!.ownershipLabels, ...approval },
  };
  const docker = createHermesStateVolumeDockerHarness(initial);
  expect(() =>
    prepareManagedStateVolumes(
      { roots },
      {
        workspace: "qualification",
        runContainerEngine: docker.runDocker,
      },
    ),
  ).toThrow("Retained data was not changed");
  expect(docker.volume).toEqual(initial);
  expect(docker.calls.map(([command]) => command)).toEqual(["inspect", "inspect"]);
});

it("reuses approved retained state without removing it during rollback", () => {
  const initial = {
    name: roots[0]!.resourceIdentity,
    labels: {
      ...roots[0]!.ownershipLabels,
      "openshell.ai/sandbox-attachable": "true",
      "openshell.ai/sandbox-attachable-workspace": "qualification",
    },
  };
  const docker = createHermesStateVolumeDockerHarness(initial);
  const scope = prepareManagedStateVolumes(
    { roots },
    {
      workspace: "qualification",
      runContainerEngine: docker.runDocker,
    },
  );
  expect(scope?.reused).toEqual([true]);
  expect(scope?.cleanupIncompleteCreate()).toEqual([]);
  expect(docker.volume).toEqual(initial);
});
