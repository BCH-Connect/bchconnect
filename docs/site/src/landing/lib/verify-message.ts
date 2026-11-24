// Checks a wallet's message signature in the browser: recovers the signer's
// public key and compares its hash with the session's addresses. Loaded on demand.

import {
	base64ToBin,
	bigIntToCompactUint,
	binsAreEqual,
	decodeCashAddress,
	flattenBinArray,
	hash160,
	hash256,
	type RecoveryId,
	secp256k1,
	utf8ToBin,
} from "@bitauth/libauth";

const MAGIC = utf8ToBin("\x18Bitcoin Signed Message:\n");
/** Electrum-style header for a compressed key: 31 plus the recovery id. */
const COMPRESSED_HEADER = 31;

function messageHash(message: string): Uint8Array {
	const bytes = utf8ToBin(message);
	return hash256(
		flattenBinArray([MAGIC, bigIntToCompactUint(BigInt(bytes.length)), bytes]),
	);
}

function isRecoveryId(value: number): value is RecoveryId {
	return value >= 0 && value <= 3;
}

/** Whether `signature` signs `message` with the key behind one of `addresses`. */
export function verifyMessage(
	message: string,
	signature: string,
	addresses: readonly string[],
): boolean {
	const bin = base64ToBin(signature);
	const recoveryId = (bin[0] ?? 0) - COMPRESSED_HEADER;
	if (bin.length !== 65 || !isRecoveryId(recoveryId)) return false;
	const publicKey = secp256k1.recoverPublicKeyCompressed(
		bin.slice(1),
		recoveryId,
		messageHash(message),
	);
	if (typeof publicKey === "string") return false;
	const signer = hash160(publicKey);
	return addresses.some((address) => {
		const decoded = decodeCashAddress(address);
		return typeof decoded !== "string" && binsAreEqual(decoded.payload, signer);
	});
}
