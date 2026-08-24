import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

import { patchInstalledPushReceiver } from "../scripts/patch-push-receiver.mjs";

test("push receiver accepts additional Web Push header parameters", () => {
  patchInstalledPushReceiver();

  const require = createRequire(import.meta.url);
  const httpEce = require("http_ece");
  const originalDecrypt = httpEce.decrypt;
  let capturedParams;

  httpEce.decrypt = (_rawData, params) => {
    capturedParams = params;
    return JSON.stringify({ accepted: true });
  };

  try {
    const decrypt = require("@eneris/push-receiver/dist/utils/decrypt.js").default;
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.generateKeys();
    const result = decrypt(
      {
        appData: [
          { key: "crypto-key", value: "dh=PUBLIC_KEY_WITH_PADDING==; p256ecdsa=SIGNATURE==" },
          { key: "encryption", value: "salt=SALT_WITH_PADDING==; rs=4096" },
        ],
        rawData: Buffer.from("encrypted"),
      },
      {
        privateKey: ecdh.getPrivateKey("base64"),
        authSecret: "AUTH_SECRET",
      }
    );

    assert.deepEqual(result, { accepted: true });
    assert.equal(capturedParams.dh, "PUBLIC_KEY_WITH_PADDING==");
    assert.equal(capturedParams.salt, "SALT_WITH_PADDING==");
  } finally {
    httpEce.decrypt = originalDecrypt;
  }
});
