import { requireKeuangan } from "../session.js";
import { ensureSeeded } from "../lib/seed.js";
import { todayWib } from "../lib/validate.js";

export async function getMe(ctx) {
  const actor = await requireKeuangan(ctx);
  const db = ctx.env.DB;
  await ensureSeeded(db, ctx.deps.now(), actor.uid);

  const [unitsRow, obRow, attRow, lockRow] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS cnt FROM units WHERE aktif = 1").first(),
    db.prepare("SELECT COUNT(*) AS cnt FROM documents WHERE type = 'opening_balance' AND status = 'selesai' AND deleted_at IS NULL").first(),
    db.prepare("SELECT SUM(bytes) AS total_bytes FROM lampiran_db").first(),
    db.prepare("SELECT MAX(sampai) AS max_date FROM period_closings WHERE status = 'selesai'").first(),
  ]);

  return {
    uid: actor.uid,
    role: actor.role,
    name: actor.name,
    today: todayWib(ctx.deps.now()),
    onboarding: {
      hasUnits: (unitsRow?.cnt ?? 0) > 0,
      hasOpeningBalance: (obRow?.cnt ?? 0) > 0,
      maxLockedDate: lockRow?.max_date || null,
      attachmentBytes: attRow?.total_bytes ?? 0,
      attachmentLimitBytes: 450 * 1024 * 1024,
    },
  };
}
