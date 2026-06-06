import { defineEventHandler, sendRedirect } from "h3";

export default defineEventHandler((event) => {
  return sendRedirect(event, "/costing-assistant/index.html", 302);
});
