import { defineEventHandler, readBody } from "h3";

import {
  isValidProductName,
  isValidTimestamp,
} from "../../../../../../domains/how-much/core/validation.ts";
import { getHowMuchStore } from "../../../../../../domains/how-much/server/store.ts";

export default defineEventHandler(async (event) => {
  const { productName, timestamp } = await readBody(event) as {
    productName?: string;
    timestamp?: string;
  };

  if (!isValidProductName(productName) || !isValidTimestamp(timestamp)) {
    return { success: false, error: "invalid_params" };
  }

  const store = await getHowMuchStore();
  const success = await store.reportRecord(productName!, timestamp!);

  if (success) {
    return { success: true, message: "报告成功" };
  }

  return { success: false, error: "report_failed" };
});
