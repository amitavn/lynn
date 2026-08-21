import { verifyKey } from "discord-interactions";

export interface VerifiedRequest {
    readonly valid: true;
    readonly body: unknown;
}

export interface InvalidRequest {
    readonly valid: false;
}

export type VerificationResult = VerifiedRequest | InvalidRequest;

export const verifyDiscordRequest = async (
    request: Request,
    publicKey: string,
): Promise<VerificationResult> => {
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");

    if (!signature || !timestamp) {
        return { valid: false };
    }

    const rawBody = await request.text();
    const valid = await verifyKey(rawBody, signature, timestamp, publicKey);

    if (!valid) {
        return { valid: false };
    }

    return { valid: true, body: JSON.parse(rawBody) };
};
