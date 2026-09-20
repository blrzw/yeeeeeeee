import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import path from "path";
import { createServer as createViteServer } from "vite";

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const clientTemplate = path.resolve(process.cwd(), "client", "index.html");
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In production bundle, dist/public is either adjacent or at process.cwd()/dist/public
  const possiblePaths = [
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(import.meta.dirname, "public"),
    path.resolve(import.meta.dirname, "../..", "dist", "public"),
  ];

  const distPath = possiblePaths.find((p) => fs.existsSync(p)) ?? path.resolve(process.cwd(), "dist", "public");

  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
