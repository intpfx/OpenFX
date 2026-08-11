import {
  BOUNDED_DENO_ENTRY_MARKER,
  TRUSTED_REMOTE_ADDRESS_HEADER,
} from "../server/runtime/deno-request.ts";

export const assertSafeDenoBundle = (source: string): void => {
  if (/\brequest\s*\.\s*arrayBuffer\s*\(/.test(source)) {
    throw new Error("unbounded_request_array_buffer_in_deno_entry");
  }
  for (const marker of [BOUNDED_DENO_ENTRY_MARKER, TRUSTED_REMOTE_ADDRESS_HEADER]) {
    if (!source.includes(marker)) {
      throw new Error(`missing_bounded_deno_entry_marker:${marker}`);
    }
  }
};

if (import.meta.main) {
  const path = Deno.args[0];
  if (!path) throw new Error("missing_bundle_path");
  assertSafeDenoBundle(await Deno.readTextFile(path));
  console.log("Bounded Deno entry verification passed.");
}
