import { spake2 } from "spake2";
import { Buffer } from "buffer";

type PakeStartPayload = {
  username: string;
  server_id: string;
  salt: string;
  server_msg: string;
  mhf: { n: number; r: number; p: number };
  kdf_aad: string;
};

type PakeClientState = {
  clientMsg: string;
  confirmA: string;
  verify: (confirmB: string) => void;
};

export async function buildPakeClient(payload: PakeStartPayload, password: string): Promise<PakeClientState> {
  const instance = spake2({ mhf: payload.mhf, kdf: { AAD: payload.kdf_aad } });
  const clientState = await instance.startClient(
    payload.username,
    payload.server_id,
    password,
    payload.salt
  );
  const clientMsg = clientState.getMessage();
  const sharedSecret = clientState.finish(Buffer.from(payload.server_msg, "base64"));
  const confirmA = sharedSecret.getConfirmation();

  return {
    clientMsg: Buffer.from(clientMsg).toString("base64"),
    confirmA: Buffer.from(confirmA).toString("base64"),
    verify: (confirmB: string) => {
      sharedSecret.verify(Buffer.from(confirmB, "base64"));
    },
  };
}
