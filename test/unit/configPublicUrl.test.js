import {test, describe} from "node:test";
import assert from "node:assert/strict";

process.env.WAYSTATION_PUBLIC_URL = "https://files.example.com/";
const {resolvePublicOrigin, publicUrl} = await import("../../src/lib/config.js");

describe("config (WAYSTATION_PUBLIC_URL configured)", () => {
    test("trailing slash is stripped from publicUrl", () => {
        assert.equal(publicUrl, "https://files.example.com");
    });

    test("resolvePublicOrigin uses publicUrl regardless of the Host header", () => {
        const origin = resolvePublicOrigin({headers: {host: "someother.host"}});
        assert.equal(origin, "https://files.example.com");
    });
});
