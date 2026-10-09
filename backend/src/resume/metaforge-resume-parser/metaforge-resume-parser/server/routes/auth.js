import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { findUserByUsername, logAudit } from "../db.js";

const router = Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username?.trim() || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const user = findUserByUsername(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    logAudit(null, "login_failed", { username: username.trim() }, req.ip);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: "12h" }
  );

  logAudit(user.id, "login_success", null, req.ip);

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

router.get("/me", (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret);
    res.json({ user: { id: payload.id, username: payload.username, role: payload.role } });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

export default router;
