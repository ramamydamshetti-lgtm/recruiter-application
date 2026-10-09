import jwt from "jsonwebtoken";
import { config } from "../config.js";

function attachServiceUser(req) {
  req.user = { id: "service", username: "integration", role: "service" };
  req.isServiceAuth = true;
}

function isValidServiceKey(key) {
  return config.integrationApiKey && key === config.integrationApiKey;
}

export function authMiddleware(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (isValidServiceKey(apiKey)) {
    attachServiceUser(req);
    return next();
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Use Bearer JWT or X-API-Key header." });
  }

  const token = header.slice(7);
  if (isValidServiceKey(token)) {
    attachServiceUser(req);
    return next();
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    req.isServiceAuth = false;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
