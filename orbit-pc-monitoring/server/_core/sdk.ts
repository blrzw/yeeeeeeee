import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify, SignJWT } from "jose";
import { AXIOS_TIMEOUT_MS, COOKIE_NAME, decodeOAuthState, ONE_YEAR_MS } from "../../shared/const";
import { ForbiddenError } from "../../shared/_core/errors";
import { getUserByOpenId, upsertUser } from "../db";
import { ENV } from "./env";
import type { Request } from "express";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

class OAuthService {
  constructor(private client: AxiosInstance) {}

  decodeState(state: string) {
    return decodeOAuthState(state).redirectUri;
  }

  async getTokenByCode(code: string, state: string) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };
    const { data } = await this.client.post(EXCHANGE_TOKEN_PATH, payload);
    return data;
  }

  async getUserInfoByToken(token: { accessToken: string }) {
    const { data } = await this.client.post(GET_USER_INFO_PATH, {
      accessToken: token.accessToken,
    });
    return data;
  }
}

const createOAuthHttpClient = () =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

export class SDKServer {
  client: AxiosInstance;
  oauthService: OAuthService;

  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  deriveLoginMethod(platforms: unknown, fallback: string | null) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(platforms.filter((p) => typeof p === "string"));
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE")) return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? (first as string).toLowerCase() : null;
  }

  async exchangeCodeForToken(code: string, state: string) {
    return this.oauthService.getTokenByCode(code, state);
  }

  async getUserInfo(accessToken: string) {
    const data = await this.oauthService.getUserInfoByToken({ accessToken });
    const loginMethod = this.deriveLoginMethod(data?.platforms, data?.platform ?? null);
    return {
      ...data,
      platform: loginMethod,
      loginMethod,
    };
  }

  parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async createSessionToken(openId: string, options: { name?: string; expiresInMs?: number } = {}) {
    return this.signSession({ openId, appId: ENV.appId, name: options.name || "" }, options);
  }

  async signSession(payload: { openId: string; appId: string; name: string }, options: { expiresInMs?: number } = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(cookieValue: string | undefined) {
    if (!cookieValue) return null;
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        return null;
      }
      return { openId, appId, name };
    } catch {
      return null;
    }
  }

  async getUserInfoWithJwt(jwtToken: string) {
    const payload = { jwtToken, projectId: ENV.appId };
    const { data } = await this.client.post(GET_USER_INFO_WITH_JWT_PATH, payload);
    const loginMethod = this.deriveLoginMethod(data?.platforms, data?.platform ?? null);
    return {
      ...data,
      platform: loginMethod,
      loginMethod,
    };
  }

  async authenticateRequest(req: Request) {
    // ── Dev auto-login: in development mode, every request is treated as the
    //    local admin without needing OAuth. Set DEV_AUTO_LOGIN=false to disable.
    if (ENV.devAutoLogin) {
      const devUser = await getUserByOpenId(ENV.ownerOpenId || "local-dev-owner");
      if (devUser) return devUser;
      // First boot — create the dev admin user
      await upsertUser({
        openId: ENV.ownerOpenId || "local-dev-owner",
        name: "Local Admin",
        email: "admin@localhost",
        loginMethod: "dev",
        lastSignedIn: new Date(),
        role: "admin",
      });
      const created = await getUserByOpenId(ENV.ownerOpenId || "local-dev-owner");
      if (created) return created;
    }

    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt,
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });
    return user;
  }
}

export const sdk = new SDKServer();
