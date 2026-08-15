const domainRoot = new URL("../", import.meta.url);
const source = new URL(
  "native/openfx-native-photos/native/bridge.c",
  domainRoot,
);
const swiftSource = new URL(
  "native/openfx-native-photos/swift/OpenFXNativeServer.swift",
  domainRoot,
);
const buildDirectory = new URL(
  "native/openfx-native-photos/build/",
  domainRoot,
);
const object = new URL("bridge.o", buildDirectory);
const swiftArchive = new URL("libopenfx_native_photos_swift.a", buildDirectory);
const archive = new URL("libopenfx_native_photos_bridge.a", buildDirectory);
const buildStamp = new URL("source.sha256", buildDirectory);
const validationDirectory = new URL(
  "native/openfx-native-photos/target/release/",
  domainRoot,
);
const validationArchive = new URL(
  "libperry_ext_openfx_native_photos.a",
  validationDirectory,
);
const installedArchive = new URL(
  "node_modules/openfx-native-photos/build/libopenfx_native_photos_bridge.a",
  domainRoot,
);

async function run(command: string, args: string[]): Promise<void> {
  const result = await new Deno.Command(command, {
    args,
    cwd: domainRoot,
    stderr: "inherit",
    stdout: "inherit",
  }).output();
  if (!result.success) {
    throw new Error(`${command} 执行失败：${result.code}`);
  }
}

const architecture = Deno.build.arch === "aarch64" ? "arm64" : "x86_64";
const recipe = `openfx-native-photos-v2\n${architecture}\nmacosx13.0`;
const fingerprintBytes = new TextEncoder().encode([
  recipe,
  await Deno.readTextFile(source),
  await Deno.readTextFile(swiftSource),
].join("\n"));
const fingerprint = Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", fingerprintBytes)),
  (byte) => byte.toString(16).padStart(2, "0"),
).join("");

await Deno.mkdir(buildDirectory, { recursive: true });
await Deno.mkdir(new URL("dist/", domainRoot), { recursive: true });
let reuseArchive = false;
try {
  reuseArchive = (await Deno.readTextFile(buildStamp)).trim() === fingerprint;
  await Promise.all([
    Deno.stat(object),
    Deno.stat(swiftArchive),
    Deno.stat(archive),
  ]);
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
  reuseArchive = false;
}

if (!reuseArchive) {
  await run("xcrun", [
    "clang",
    "-arch",
    architecture,
    "-mmacosx-version-min=13.0",
    "-c",
    source.pathname,
    "-o",
    object.pathname,
  ]);
  await run("xcrun", [
    "swiftc",
    "-parse-as-library",
    "-emit-library",
    "-static",
    "-target",
    `${architecture}-apple-macosx13.0`,
    swiftSource.pathname,
    "-o",
    swiftArchive.pathname,
    "-framework",
    "AppKit",
    "-framework",
    "Foundation",
    "-framework",
    "Network",
    "-framework",
    "Photos",
    "-framework",
    "PhotosUI",
    "-framework",
    "UniformTypeIdentifiers",
  ]);
  await run("xcrun", [
    "libtool",
    "-static",
    "-o",
    archive.pathname,
    object.pathname,
    swiftArchive.pathname,
  ]);
  await Deno.writeTextFile(buildStamp, `${fingerprint}\n`);
}
await Deno.mkdir(validationDirectory, { recursive: true });
await Deno.copyFile(archive, validationArchive);
try {
  await Deno.stat(
    new URL(
      "node_modules/openfx-native-photos/package.json",
      domainRoot,
    ),
  );
  await Deno.mkdir(new URL("./", installedArchive), { recursive: true });
  await Deno.copyFile(archive, installedArchive);
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
}
console.log(
  `${reuseArchive ? "已复用" : "已生成"} Perry C ABI shim：${archive.pathname}`,
);
