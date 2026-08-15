import { App, Text, VStack, WebView } from "perry/ui";
// Perry 0.5.1220's prebuilt full stdlib exposes HTTP handle dispatch symbols even
// when the app does not call them; loading its bundled binding closes that link edge.
import "http";

import { startNativePhotosServer } from "openfx-native-photos";

const OPENFX_NATIVE_PORT = 15501;
const OPENFX_NATIVE_ORIGIN = `http://127.0.0.1:${OPENFX_NATIVE_PORT}`;
const serverStatus = startNativePhotosServer(OPENFX_NATIVE_PORT);

const body = serverStatus === 0
  ? WebView({
    url: OPENFX_NATIVE_ORIGIN,
    allowedDomains: ["127.0.0.1"],
    ephemeral: false,
    userAgent: "OpenFX-macOS/0.1 Perry",
  })
  : VStack(14, [
    Text("OpenFX 无法启动本机文件库服务"),
    Text(`错误代码：${serverStatus}。请确认 15501 端口未被占用。`),
  ]);

App({
  title: "OpenFX",
  width: 1180,
  height: 820,
  minWidth: 720,
  minHeight: 560,
  titlebarStyle: "overlay",
  body,
});
