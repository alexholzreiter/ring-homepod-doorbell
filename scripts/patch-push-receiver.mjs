import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultTarget = path.join(
  projectRoot,
  "node_modules/@eneris/push-receiver/dist/utils/decrypt.js"
);

const helperMarker = "function parseHeaderParams(header)";
const helperInsertionPoint = 'const http_ece_1 = __importDefault(require("http_ece"));\n';
const originalValues = `    const dh = crypto_1.default.createECDH('prime256v1');
    dh.setPrivateKey(keys.privateKey, 'base64');
    const params = {
        version: 'aesgcm',
        authSecret: keys.authSecret,
        dh: cryptoKey.value.slice(3),
        privateKey: dh,
        salt: salt.value.slice(5),
    };`;
const patchedValues = `    const cryptoKeyParams = parseHeaderParams(cryptoKey.value);
    const saltParams = parseHeaderParams(salt.value);
    if (!cryptoKeyParams.dh)
        throw new Error('crypto-key header is missing dh parameter');
    if (!saltParams.salt)
        throw new Error('encryption header is missing salt parameter');
    const dh = crypto_1.default.createECDH('prime256v1');
    dh.setPrivateKey(keys.privateKey, 'base64');
    const params = {
        version: 'aesgcm',
        authSecret: keys.authSecret,
        dh: cryptoKeyParams.dh,
        privateKey: dh,
        salt: saltParams.salt,
    };`;
const helper = `function parseHeaderParams(header) {
    return Object.fromEntries(header.split(';').map(part => {
        const [key, ...rest] = part.trim().split('=');
        return [key, rest.join('=')];
    }));
}
`;

export function patchPushReceiverSource(source) {
  if (source.includes(helperMarker) && source.includes("dh: cryptoKeyParams.dh")) {
    return { source, changed: false };
  }
  if (!source.includes(helperInsertionPoint) || !source.includes(originalValues)) {
    throw new Error(
      "Unsupported @eneris/push-receiver decrypt implementation; remove or update the compatibility patch."
    );
  }

  return {
    source: source
      .replace(helperInsertionPoint, helperInsertionPoint + helper)
      .replace(originalValues, patchedValues),
    changed: true,
  };
}

export function patchInstalledPushReceiver(target = defaultTarget) {
  if (!fs.existsSync(target)) {
    throw new Error(`@eneris/push-receiver was not installed at ${target}`);
  }

  const current = fs.readFileSync(target, "utf8");
  const result = patchPushReceiverSource(current);
  if (result.changed) {
    fs.writeFileSync(target, result.source);
    console.log("Applied @eneris/push-receiver header parsing fix (upstream PR #33).");
  } else {
    console.log("@eneris/push-receiver header parsing fix is already present.");
  }
  return result.changed;
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (executedDirectly) {
  patchInstalledPushReceiver();
}
