import {test, describe} from "node:test";
import assert from "node:assert/strict";

delete process.env.WAYSTATION_PUBLIC_URL;
const {resolvePublicOrigin, publicUrl} = await import("../../src/lib/config.js");

describe("config (no WAYSTATION_PUBLIC_URL)", () => {
    test("publicUrl is null", () => {
        assert.equal(publicUrl, null);
    });

    test("resolvePublicOrigin falls back to the request's Host header", () => {
        const origin = resolvePublicOrigin({headers: {host: "localhost:3000"}});
        assert.equal(origin, "http://localhost:3000");
    });
});
