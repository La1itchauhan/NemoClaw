// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "smol-toml";
import { expect, it, vi } from "vitest";
import { baseGatewayEnv } from "../../../test/support/openshell-gateway-config-helpers";
import {
  buildDockerDriverGatewayConfigToml,
  ensureDockerDriverGatewayJwtBundle,
} from "./docker-driver-gateway-config";
import { prepareNativePodmanGatewayHostRuntime } from "./runtime-provider/podman-runtime-surfaces";

vi.mock("./openshell-version", async (original) => ({
  ...(await original<typeof import("./openshell-version")>()),
  SUPPORTED_OPENSHELL_FALLBACK_VERSION: "0.1.3",
}));

it.each(["docker", "podman"] as const)(
  "writes the projected gateway schema for %s without legacy credential fields",
  (driver) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-projected-"));
    try {
      const env = baseGatewayEnv(root);
      const runtime =
        driver === "podman"
          ? prepareNativePodmanGatewayHostRuntime({
              environment: { ...env, OPENSHELL_DRIVERS: "podman" },
              platform: "linux",
              socketPath: path.join(root, "podman.sock"),
            })
          : undefined;
      const toml = buildDockerDriverGatewayConfigToml(
        env,
        "/usr/bin/openshell-sandbox",
        ensureDockerDriverGatewayJwtBundle(root),
        "projected-gateway",
        runtime,
      );
      const parsed = parse(toml) as unknown as {
        openshell: {
          version: number;
          gateway: Record<string, unknown>;
          drivers: Record<string, Record<string, unknown>>;
        };
      };
      expect(parsed.openshell).toMatchObject({
        version: 2,
        gateway: {
          compute_driver: driver,
          disable_tls: false,
          guest_tls_ca: path.join(root, "tls", "ca.crt"),
          mtls_auth: { enabled: true },
          auth: { allow_unauthenticated_users: false },
        },
      });
      expect(toml).not.toMatch(
        /compute_drivers|guest_tls_cert|guest_tls_key|require_client_auth|ttl_secs|sandbox_namespace/,
      );
      expect(parsed.openshell.drivers[driver]).toMatchObject({ allow_driver_config: true });
      expect(parsed.openshell.drivers[driver].network_name).toBe(
        driver === "podman" ? env.OPENSHELL_DOCKER_NETWORK_NAME : undefined,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
