/**
 * Load a Solana keypair from disk (JSON secret-key array or base58 file).
 * Never log the secret.
 */

import { readFileSync, existsSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export function loadKeypairFromPath(walletPath: string): Keypair {
  if (!walletPath || walletPath === "UNSET") {
    throw new Error("AGENT_WALLET_PATH is not set");
  }
  if (!existsSync(walletPath)) {
    throw new Error(`Wallet file not found: ${walletPath}`);
  }
  const raw = readFileSync(walletPath, "utf8").trim();
  try {
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    // base58 secret key (64-byte expanded secret)
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch (err) {
    throw new Error(
      `Failed to load keypair from ${walletPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export function publicKeyFromWalletPath(walletPath: string): string {
  return loadKeypairFromPath(walletPath).publicKey.toBase58();
}
