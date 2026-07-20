import { defineEventHandler } from "h3";

export const redirectLegacyAdminRequest = (): Response =>
  new Response(null, {
    status: 302,
    headers: { location: "/" },
  });

export default defineEventHandler(() => redirectLegacyAdminRequest());
