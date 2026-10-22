// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { expect, it, vi } from "vitest";
import { isManagedImageHarnessWorkload } from "../../../scripts/checks/managed-image-protected-runtime-contract.ts";
import { managedImageHarnessContainerListArgs } from "../../../scripts/checks/run-managed-image-openshell-e2e.ts";

vi.mock("../../../src/lib/onboard/openshell-version.ts", async (original) => ({
  ...(await original<typeof import("../../../src/lib/onboard/openshell-version.ts")>()),
  SUPPORTED_OPENSHELL_FALLBACK_VERSION: "0.0.116",
}));

it("requires the exact private network and image for a 0.0.116 workload", () => {
  const expected = {
    sandbox: "nmc-mi-oc-ol",
    stateDir: "/tmp/private/gateway-state",
    networkName: "private-network",
    imageContentId: `sha256:${"a".repeat(64)}`,
  };
  const record = {
    Config: {
      Labels: {
        "openshell.ai/managed-by": "openshell",
        "openshell.ai/sandbox-name": expected.sandbox,
      },
    },
    Image: expected.imageContentId,
    NetworkSettings: { Networks: { [expected.networkName]: {} } },
  };
  expect(isManagedImageHarnessWorkload(record, expected)).toBe(true);
  expect(isManagedImageHarnessWorkload(record, { ...expected, networkName: "foreign" })).toBe(
    false,
  );
  expect(isManagedImageHarnessWorkload(record, { ...expected, networkName: undefined })).toBe(
    false,
  );
  expect(
    isManagedImageHarnessWorkload({ ...record, Image: `sha256:${"b".repeat(64)}` }, expected),
  ).toBe(false);
  expect(isManagedImageHarnessWorkload(record, { ...expected, sandbox: "foreign" })).toBe(false);
  expect(managedImageHarnessContainerListArgs(expected.sandbox, true)).toEqual([
    "docker",
    "ps",
    "-aq",
    "--no-trunc",
    "--filter",
    "label=openshell.ai/managed-by=openshell",
    "--filter",
    `label=openshell.ai/sandbox-name=${expected.sandbox}`,
  ]);
});
