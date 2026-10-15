import { test } from "node:test";
import assert from "node:assert";
import { adminTokenMatches } from "../server/adminToken.ts";
test("unset ADMIN_TOKEN never matches", () => { delete process.env.ADMIN_TOKEN; assert.equal(adminTokenMatches(""), false); assert.equal(adminTokenMatches("anything"), false); });
test("short ADMIN_TOKEN never matches", () => { process.env.ADMIN_TOKEN = "short"; assert.equal(adminTokenMatches("short"), false); });
test("exact token matches only", () => { process.env.ADMIN_TOKEN = "admin-token-1234567890"; assert.ok(adminTokenMatches("admin-token-1234567890")); assert.equal(adminTokenMatches("admin-token-123456789"), false); assert.equal(adminTokenMatches(undefined), false); });
