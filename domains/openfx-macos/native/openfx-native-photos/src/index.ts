declare function js_openfx_native_photos_server_start(port: number): number;

export function startNativePhotosServer(port: number): number {
  return js_openfx_native_photos_server_start(port);
}
