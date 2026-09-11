import { env } from 'cloudflare:workers';

const COLORS = ['#087ac1', '#1594d0', '#075caa', '#27a9df', '#176fc0', '#43b6e5'];
const MAX_MESSAGES = 60;

type StoredMessage = {
  id: string;
  name: string;
  message: string;
  slot: number;
  rotation: number;
  color: string;
  createdAt: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function listMessages(): Promise<StoredMessage[]> {
  const result = await env.DB.prepare(
    `SELECT id, name, message, slot, rotation, color, created_at AS createdAt
     FROM messages ORDER BY created_at ASC, rowid ASC`,
  ).all<StoredMessage>();
  return result.results ?? [];
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function cleanItem(value: unknown, slot: number, preserveCreatedAt = false): StoredMessage {
  const item = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const name = cleanText(item.name, 10);
  const message = cleanText(item.message, 40);
  if (!message) throw new Error('留言內容必須填寫。');
  const requestedRotation = Number(item.rotation);
  const rotation = Number.isFinite(requestedRotation)
    ? Math.max(-9, Math.min(9, Math.round(requestedRotation)))
    : Math.round(Math.random() * 16 - 8);
  const color = COLORS.includes(String(item.color))
    ? String(item.color)
    : COLORS[Math.floor(Math.random() * COLORS.length)];
  const requestedDate = new Date(String(item.createdAt ?? ''));
  return {
    id: crypto.randomUUID(),
    name,
    message,
    slot,
    rotation,
    color,
    createdAt: preserveCreatedAt && !Number.isNaN(requestedDate.getTime())
      ? requestedDate.toISOString()
      : new Date().toISOString(),
  };
}

function requireAdmin(request: Request, payload: Record<string, unknown>) {
  const expected = env.ADMIN_TOKEN?.trim();
  const supplied = request.headers.get('x-admin-token') || cleanText(payload.token, 200);
  if (!expected || !supplied || supplied !== expected) {
    throw new Response('管理者驗證失敗。', { status: 403 });
  }
}

export async function GET() {
  try {
    return json({ ok: true, items: await listMessages() });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: '目前無法讀取留言。' }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 100_000) return json({ ok: false, error: '傳送的資料太大。' }, 413);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = cleanText(payload.action, 20);

    if (action === 'add') {
      const slotRows = await env.DB.prepare('SELECT slot FROM messages ORDER BY slot').all<{ slot: number }>();
      const usedSlots = new Set((slotRows.results ?? []).map((row) => row.slot));
      if (usedSlots.size >= MAX_MESSAGES) {
        return json({ ok: false, error: '這棵樹已經有 60 片葉子，已達上限。' }, 409);
      }
      let nextSlot = 0;
      while (usedSlots.has(nextSlot) && nextSlot < MAX_MESSAGES) nextSlot += 1;
      const item = cleanItem(payload.item, nextSlot);
      await env.DB.prepare(
        `INSERT INTO messages (id, name, message, slot, rotation, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(item.id, item.name, item.message, item.slot, item.rotation, item.color, item.createdAt).run();
      return json({ ok: true, items: await listMessages() }, 201);
    }

    if (action === 'delete') {
      requireAdmin(request, payload);
      await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(cleanText(payload.id, 80)).run();
      return json({ ok: true, items: await listMessages() });
    }

    if (action === 'clear') {
      requireAdmin(request, payload);
      await env.DB.prepare('DELETE FROM messages').run();
      return json({ ok: true, items: [] });
    }

    if (action === 'replace') {
      requireAdmin(request, payload);
      const source = Array.isArray(payload.items) ? payload.items.slice(0, MAX_MESSAGES) : [];
      const restored = source.map((item, index) => cleanItem(item, index, true));
      const statements = [env.DB.prepare('DELETE FROM messages')];
      for (const item of restored) {
        statements.push(env.DB.prepare(
          `INSERT INTO messages (id, name, message, slot, rotation, color, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(item.id, item.name, item.message, item.slot, item.rotation, item.color, item.createdAt));
      }
      await env.DB.batch(statements);
      return json({ ok: true, items: await listMessages() });
    }

    return json({ ok: false, error: '不支援的操作。' }, 400);
  } catch (error) {
    if (error instanceof Response) return json({ ok: false, error: await error.text() }, error.status);
    console.error(error);
    return json(
      { ok: false, error: error instanceof Error ? error.message : '操作失敗，請稍後再試。' },
      500,
    );
  }
}

