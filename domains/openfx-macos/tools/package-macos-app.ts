const domainRoot = new URL("../", import.meta.url);
const distRoot = new URL("dist/", domainRoot);
const executable = new URL("OpenFX", distRoot);
const nativeResources = new URL("NativeLibraries/", distRoot);
const appRoot = new URL("OpenFX.app/", distRoot);
const contentsRoot = new URL("Contents/", appRoot);
const macOSRoot = new URL("MacOS/", contentsRoot);
const resourcesRoot = new URL("Resources/", contentsRoot);
const appExecutable = new URL("OpenFX", macOSRoot);
const appNativeResources = new URL("NativeLibraries/", resourcesRoot);
const infoPlist = new URL("Info.plist", contentsRoot);
const entitlements = new URL("OpenFX.entitlements", distRoot);

async function exists(url: URL): Promise<boolean> {
  try {
    await Deno.stat(url);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function copyDirectory(source: URL, target: URL): Promise<void> {
  await Deno.mkdir(target, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    if (entry.name === ".DS_Store") continue;
    const suffix = entry.isDirectory ? "/" : "";
    const sourceEntry = new URL(entry.name + suffix, source);
    const targetEntry = new URL(entry.name + suffix, target);
    if (entry.isDirectory) {
      await copyDirectory(sourceEntry, targetEntry);
    } else if (entry.isFile) {
      await Deno.copyFile(sourceEntry, targetEntry);
    }
  }
}

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

if (!(await exists(executable))) {
  throw new Error("缺少 dist/OpenFX；请先运行 bun run compile");
}
if (!(await exists(nativeResources))) {
  throw new Error("缺少 dist/NativeLibraries；请先运行 bun run prepare:web");
}

if (await exists(appRoot)) {
  await Deno.remove(appRoot, { recursive: true });
}
await Deno.mkdir(macOSRoot, { recursive: true });
await Deno.mkdir(resourcesRoot, { recursive: true });
await Deno.copyFile(executable, appExecutable);
await Deno.chmod(appExecutable, 0o755);
await copyDirectory(nativeResources, appNativeResources);

await Deno.writeTextFile(
  infoPlist,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>zh_CN</string>
  <key>CFBundleDisplayName</key><string>OpenFX</string>
  <key>CFBundleExecutable</key><string>OpenFX</string>
  <key>CFBundleIdentifier</key><string>com.siaovon.openfx</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>OpenFX</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPhotoLibraryUsageDescription</key>
  <string>OpenFX 仅在您从系统选择器选中实况照片后读取其静态帧和动态片段。</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
`,
);

await Deno.writeTextFile(
  entitlements,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.personal-information.photos-library</key><true/>
</dict>
</plist>
`,
);

await run("codesign", [
  "--force",
  "--deep",
  "--sign",
  "-",
  "--options",
  "runtime",
  "--entitlements",
  entitlements.pathname,
  appRoot.pathname,
]);
console.log(`已生成本地 macOS App：${appRoot.pathname}`);
