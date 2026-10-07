import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function readText(filename) {
  try {
    return fs.readFileSync(filename, "utf8").trim();
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function writePrivate(filename, value) {
  fs.writeFileSync(filename, `${value}\n`, { mode: 0o600 });
}

function tokenFingerprint(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createTokenStore(dataDirectory, environmentToken = "") {
  const tokenFile = path.join(dataDirectory, "ring-refresh-token.txt");
  const environmentFingerprintFile = path.join(
    dataDirectory,
    "ring-refresh-token-environment.sha256"
  );
  const envToken = String(environmentToken).trim();

  fs.mkdirSync(dataDirectory, { recursive: true });

  function save(token) {
    writePrivate(tokenFile, token);
  }

  function candidates() {
    const storedToken = readText(tokenFile);
    const savedEnvironmentFingerprint = readText(environmentFingerprintFile);
    const environmentChanged =
      Boolean(envToken && savedEnvironmentFingerprint) &&
      savedEnvironmentFingerprint !== tokenFingerprint(envToken);

    if (!storedToken && !envToken) {
      throw new Error("Kein Ring Refresh-Token vorhanden.");
    }

    const ordered = environmentChanged
      ? [
          { source: "environment", token: envToken },
          { source: "stored", token: storedToken },
        ]
      : [
          { source: "stored", token: storedToken },
          { source: "environment", token: envToken },
        ];

    return ordered.filter(
      ({ token }, index, items) =>
        token && items.findIndex((candidate) => candidate.token === token) === index
    );
  }

  function accept(candidate, storedTokenBeforeAttempt) {
    if (envToken) {
      writePrivate(environmentFingerprintFile, tokenFingerprint(envToken));
    }
    if (candidate.source !== "environment") return;

    const currentStoredToken = readText(tokenFile);
    if (!currentStoredToken || currentStoredToken === storedTokenBeforeAttempt) {
      save(candidate.token);
    }
  }

  return {
    accept,
    candidates,
    currentStoredToken: () => readText(tokenFile),
    save,
  };
}

export function isInvalidRefreshTokenError(error) {
  return String(error?.message ?? error).includes("Refresh token is not valid");
}
