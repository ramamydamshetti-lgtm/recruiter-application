import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { listCandidates, getCandidateById, deleteCandidate, logAudit } from "../db.js";

const router = Router();

router.get("/", authMiddleware, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const candidates = listCandidates(req.user.id, { limit, offset });
  res.json({ candidates });
});

router.get("/:id", authMiddleware, (req, res) => {
  const candidate = getCandidateById(req.params.id, req.user.id);
  if (!candidate) {
    return res.status(404).json({ error: "Candidate not found" });
  }
  res.json(candidate);
});

router.delete("/:id", authMiddleware, (req, res) => {
  const changes = deleteCandidate(req.params.id, req.user.id);
  if (!changes) {
    return res.status(404).json({ error: "Candidate not found" });
  }
  logAudit(req.user.id, "delete_candidate", { candidateId: req.params.id }, req.ip);
  res.json({ success: true });
});

export default router;
