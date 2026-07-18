export const ALLOWED_APPLICATIONS = Object.freeze([
  "Activity Monitor",
  "Finder",
  "Safari",
  "System Settings",
]);

export const isAllowedApplication = (application: string): boolean =>
  ALLOWED_APPLICATIONS.includes(application);
