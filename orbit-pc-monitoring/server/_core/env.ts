export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "orbit-local-dev-secret-change-in-prod",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "local-dev-owner",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  agentEnrollmentToken: process.env.ORBIT_AGENT_ENROLLMENT_TOKEN ?? "orbit-demo-enrollment-2026",
  // Set DEV_AUTO_LOGIN=true in .env to bypass OAuth entirely for local development
  devAutoLogin: process.env.DEV_AUTO_LOGIN === "true" || process.env.NODE_ENV === "development",
};
