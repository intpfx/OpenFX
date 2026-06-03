import type { UploadPayload } from "./types.ts";

const MAX_PRODUCT_NAME_LENGTH = 100;
const MIN_PRICE = 0.01;
const MAX_PRICE = 1_000_000_000;

export const isValidProductName = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0 &&
    value.trim().length <= MAX_PRODUCT_NAME_LENGTH;
};

export const isValidPrice = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= MIN_PRICE && value <= MAX_PRICE;
};

export const isValidLocation = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

export const isValidTimestamp = (value: unknown): value is string => {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
};

export const validateUploadPayload = (
  data: unknown,
): { valid: false; error: string } | { valid: true; data: UploadPayload } => {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "expected_object" };
  }

  const obj = data as Record<string, unknown>;

  if (!isValidProductName(obj.productName)) {
    return { valid: false, error: "invalid_product_name" };
  }

  if (!isValidPrice(obj.price)) {
    return { valid: false, error: "invalid_price" };
  }

  if (!isValidLocation(obj.location)) {
    return { valid: false, error: "invalid_location" };
  }

  const note = typeof obj.note === "string" ? obj.note.trim() : "";

  return {
    valid: true,
    data: {
      productName: obj.productName.trim(),
      price: obj.price,
      location: obj.location.trim(),
      note,
    },
  };
};
