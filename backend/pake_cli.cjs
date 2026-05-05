const fs = require("fs");
const { spake2, ServerSPAKE2State } = require("spake2");

function b64(buf) {
  return Buffer.from(buf).toString("base64");
}

function fromB64(text) {
  return Buffer.from(text, "base64");
}

async function run() {
  const raw = fs.readFileSync(0, "utf8");
  if (!raw) {
    throw new Error("Missing input");
  }
  const input = JSON.parse(raw);
  const action = input.action;
  const options = { mhf: input.mhf || { n: 16384, r: 8, p: 1 }, kdf: { AAD: input.kdf_aad || "" } };

  if (action === "verifier") {
    const instance = spake2(options);
    const verifier = await instance.computeVerifier(
      input.password,
      input.salt,
      input.client_id,
      input.server_id
    );
    return { verifier: b64(verifier) };
  }

  if (action === "start") {
    const instance = spake2(options);
    const verifier = fromB64(input.verifier);
    const serverState = await instance.startServer(input.client_id, input.server_id, verifier);
    const serverMsg = serverState.getMessage();
    return {
      server_msg: b64(serverMsg),
      server_state: JSON.stringify(serverState.save()),
    };
  }

  if (action === "finish") {
    const saved = JSON.parse(input.server_state);
    const serverState = ServerSPAKE2State.load(saved);
    serverState.getMessage();
    const sharedSecret = serverState.finish(fromB64(input.client_msg));
    sharedSecret.verify(fromB64(input.confirm_a));
    const confirmB = sharedSecret.getConfirmation();
    return { confirm_b: b64(confirmB) };
  }

  throw new Error(`Unknown action: ${action}`);
}

run()
  .then((data) => {
    process.stdout.write(JSON.stringify(data));
  })
  .catch((err) => {
    process.stderr.write(err?.message || String(err));
    process.exit(1);
  });
