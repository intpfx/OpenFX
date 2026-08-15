#include <stdint.h>

extern int32_t openfx_native_photos_server_start(int32_t port);

int32_t js_openfx_native_photos_server_start(int32_t port) {
    if (port < 1 || port > UINT16_MAX) {
        return -2;
    }
    return openfx_native_photos_server_start(port);
}
