import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: Request;
  res: Response;
  user: User | null;
};

export async function createContext(opts: { req: Request; res: Response }): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    // Protected procedures convert this into a normal unauthenticated response.
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
