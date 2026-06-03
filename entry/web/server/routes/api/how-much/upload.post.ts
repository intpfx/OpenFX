import { defineEventHandler, readBody } from "h3";

import { validateUploadPayload } from "../../../../../../domains/how-much/core/validation.ts";
import { getHowMuchStore } from "../../../../../../domains/how-much/server/store.ts";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const result = validateUploadPayload(body);

  if (!result.valid) {
    return { success: false, error: result.error };
  }

  const store = await getHowMuchStore();
  const success = await store.addRecord(
    result.data.productName,
    {
      price: result.data.price,
      location: result.data.location,
      reportCount: 0,
      note: result.data.note ?? "",
    },
    new Date().toISOString(),
  );

  if (success) {
    return { success: true, message: "价格信息已保存到数据库" };
  }

  return { success: false, error: "upload_failed" };
});
