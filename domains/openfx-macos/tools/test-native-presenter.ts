const domainRoot = new URL("../", import.meta.url);
const buildDirectory = new URL(
  "native/openfx-native-photos/build/",
  domainRoot,
);
const executable = new URL("presenter-host-test", buildDirectory);

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

await Deno.mkdir(buildDirectory, { recursive: true });
await run("xcrun", [
  "swiftc",
  "-parse-as-library",
  "native/openfx-native-photos/swift/OpenFXNativeServer.swift",
  "native/openfx-native-photos/tests/PresenterHostTest.swift",
  "-o",
  executable.pathname,
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
await run(executable.pathname, []);
console.log("Perry 窗口 Photos presenter 回归测试通过");
