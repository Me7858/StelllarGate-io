// Fixture ledger entries for the contract verification tests.
//
// These are real XDR — produced by encoding the same structures the RPC
// returns, and round-tripped through the SDK's own decoder — rather than
// hand-typed JSON, so a change in the protocol's encoding surfaces as a
// failing test instead of a silently-passing one.
//
// Contract ID  CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
// raw hash    d7928b72c2703ccfeaf7eb9ff4ef4d504a55a8b979fc9b450ea2c842b4d1ce61

/** The contract instance ledger key for that contract ID. */
export const FIXTURE_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

/** Base64 XDR of its ContractData instance key (persistent durability). */
export const FIXTURE_INSTANCE_KEY =
  "AAAABgAAAAHXkotywnA8z+r365/0701QSlWouXn8m0UOoshCtNHOYQAAABQAAAAB";

/** An instance whose executable is a WASM hash: 9e3f…e1f. */
export const WASM_HASH_A = "9e3f2a1b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f";
export const ENTRY_WASM_A =
  "AAAABgAAAAAAAAAB15KLcsJwPM/q9+uf9O9NUEpVqLl5/JtFDqLIQrTRzmEAAAAUAAAAAQAAABMAAAAAnj8qG4x9bl9KOywdDp+Ke2xdTj8qGwydjn9qW0w9Lh8AAAAA";

/** An instance whose executable is a WASM hash: all zeroes. */
export const WASM_HASH_ZERO = "0".repeat(64);
export const ENTRY_WASM_ZERO =
  "AAAABgAAAAAAAAAB15KLcsJwPM/q9+uf9O9NUEpVqLl5/JtFDqLIQrTRzmEAAAAUAAAAAQAAABMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/**
 * An instance whose executable is the built-in STELLAR_ASSET variant — a
 * real contract, but one with no WASM hash at all. This is what a
 * misconfigured registry entry pointing at a SAC address looks like.
 */
export const ENTRY_STELLAR_ASSET =
  "AAAABgAAAAAAAAAB15KLcsJwPM/q9+uf9O9NUEpVqLl5/JtFDqLIQrTRzmEAAAAUAAAAAQAAABMAAAABAAAAAA==";

/** The live SAC contract the fixtures were captured from, verbatim. */
export const ENTRY_REAL_SAC_WITH_STORAGE =
  "AAAABgAAAAAAAAAB15KLcsJwPM/q9+uf9O9NUEpVqLl5/JtFDqLIQrTRzmEAAAAUAAAAAQAAABMAAAABAAAAAQAAAAIAAAAPAAAACE1FVEFEQVRBAAAAEQAAAAEAAAADAAAADwAAAAdkZWNpbWFsAAAAAAMAAAAHAAAADwAAAARuYW1lAAAADgAAAAZuYXRpdmUAAAAAAA8AAAAGc3ltYm9sAAAAAAAOAAAABm5hdGl2ZQAAAAAAEAAAAAEAAAABAAAADwAAAAlBc3NldEluZm8AAAAAAAAQAAAAAQAAAAEAAAAPAAAABk5hdGl2ZQAA";

/** Base64 that is valid base64 but not a decodable LedgerEntryData. */
export const ENTRY_GARBAGE = "bm90LWEtbGVkZ2VyLWVudHJ5";
