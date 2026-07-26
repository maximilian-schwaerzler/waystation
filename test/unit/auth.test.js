import {test, describe} from "node:test";
import assert from "node:assert/strict";

delete process.env.WAYSTATION_UPLOAD_TOKEN;
const {isAuthorizedUpload} = await import("../../src/lib/auth.js");

describe("isAuthorizedUpload (no upload token configured)", () => {
    test("request with no Authorization header is authorized", () => {
        assert.equal(isAuthorizedUpload({headers: {}}), true);
    });

    test("request with an arbitrary header is still authorized (header ignored)", () => {
        assert.equal(isAuthorizedUpload({headers: {authorization: "Bearer whatever"}}), true);
    });
});
