'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Leaf, List, Plus, QrCode, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

type Message = {
  id: string; name: string; message: string; slot: number;
  rotation: number; color: string; createdAt: string;
};

type ModelContext = {
  registerTool: (tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: object;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => Promise<unknown>;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

const LEAF_COLORS = ['#087ac1', '#1594d0', '#075caa', '#27a9df', '#176fc0', '#43b6e5'];
const MAX_LEAVES = 60;
const POSITIONS = [
  [50, 26], [29, 61], [72, 60], [20, 39], [80, 38], [39, 43], [61, 43], [33, 24],
  [67, 24], [14, 63], [86, 63], [44, 67], [56, 67], [25, 77], [75, 77], [50, 10],
  [41, 12], [59, 12], [12, 24], [88, 24], [20, 16], [80, 16], [10, 50], [90, 50],
  [35, 78], [65, 78], [46, 50], [54, 50], [29, 45], [71, 45], [16, 76], [84, 76],
  [24, 31], [44, 31], [56, 31], [76, 31], [16, 34], [34, 35], [50, 36], [66, 35],
  [84, 34], [14, 45], [25, 54], [37, 57], [50, 58], [63, 57], [75, 54], [86, 45],
  [20, 68], [30, 68], [40, 72], [60, 72], [70, 68], [80, 68], [30, 9], [70, 9],
  [9, 68], [91, 68], [45, 80], [55, 80],
] as const;

function positionFor(slot: number) {
  const base = POSITIONS[slot % POSITIONS.length];
  return { x: base[0], y: base[1] };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Message | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [displayMode, setDisplayMode] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 2800);
  }, []);

  const loadMessages = useCallback(async (showError = false) => {
    try {
      const response = await fetch('/api/messages', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || '讀取失敗');
      setMessages(Array.isArray(data.items) ? data.items : []);
      setError('');
    } catch {
      if (showError) setError('目前無法連線到留言資料，請稍後重新整理。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.hash = '';
    cleanUrl.search = '';
    setShareUrl(cleanUrl.toString());
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get('admin') || '';
    setAdminToken(token);
    setIsAdmin(Boolean(token));
    setDisplayMode(new URLSearchParams(window.location.search).get('display') === '1');
    void loadMessages(true);
    const timer = window.setInterval(() => void loadMessages(false), 5000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  useEffect(() => {
    if (!shareUrl) return;
    void QRCode.toDataURL(shareUrl, {
      width: 280, margin: 2, color: { dark: '#075a9d', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then(setQrDataUrl);
  }, [shareUrl]);

  const callApi = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { 'x-admin-token': adminToken } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || '操作失敗');
    const items = Array.isArray(data.items) ? data.items as Message[] : [];
    setMessages(items);
    return items;
  }, [adminToken]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const registration = context.registerTool({
      name: 'add_leaf_message',
      title: '新增樹葉留言',
      description: '在目前的共用留言樹新增一片含短留言的葉子。',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 40 },
        },
        required: ['message'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        const value = input as { message?: unknown };
        const toolMessage = String(value?.message ?? '').trim();
        if (!toolMessage || toolMessage.length > 40) {
          throw new Error('留言需為 1–40 字。');
        }
        const items = await callApi({
          action: 'add',
          item: {
            message: toolMessage,
            rotation: Math.round(Math.random() * 16 - 8),
            color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
          },
        });
        return { success: true, leafCount: items.length };
      },
    }, { signal: lifecycle.signal });
    void Promise.resolve(registration).catch(() => undefined);
    return () => lifecycle.abort();
  }, [callApi]);

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      await callApi({
        action: 'add',
        item: {
          message: message.trim(),
          rotation: Math.round(Math.random() * 16 - 8),
          color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
        },
      });
      setMessage('');
      setFormOpen(false);
      notify('葉子飄上樹了！');
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '送出失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteMessage() {
    if (!detail) return;
    try {
      await callApi({ action: 'delete', id: detail.id });
      setDetail(null);
      notify('已刪除這片葉子。');
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '刪除失敗。');
    }
  }

  async function clearMessages() {
    try {
      await callApi({ action: 'clear' });
      setClearOpen(false);
      notify('已清除全部留言。');
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '清除失敗。');
    }
  }

  function exportMessages() {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `blue-tree-messages-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importMessages(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error('備份格式不正確。');
      await callApi({ action: 'replace', items: parsed });
      notify(`已還原 ${parsed.length} 則留言。`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '還原失敗。');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      notify('分享網址已複製。');
    } catch {
      notify('無法自動複製，請手動選取網址。');
    }
  }

  const leafSize = useMemo(() => Math.max(50, Math.min(112, 120 - messages.length * 1.15)), [messages.length]);

  return (
    <main className={displayMode ? 'site-shell display-mode' : 'site-shell'}>
      <header className="site-header">
        <div className="eyebrow"><Leaf aria-hidden="true" /> 共用留言樹</div>
        <h1>藍色樹葉留言</h1>
        <p>寫下你的想法，用每一個聲音讓這棵樹成長</p>
      </header>

      {!displayMode && (
        <nav className="toolbar" aria-label="留言樹功能">
          <Button className="pill primary-pill" size="lg" onClick={() => setFormOpen(true)} disabled={messages.length >= MAX_LEAVES}>
            <Plus />{messages.length >= MAX_LEAVES ? '已達 60 片上限' : '新增一片葉子'}
          </Button>
          <span className="counter">目前共有 <strong>{messages.length}</strong> 片葉子</span>
          <Button className="pill" variant="outline" size="lg" onClick={() => setQrOpen(true)}><QrCode />分享 QR Code</Button>
          <Button className="pill" variant="outline" size="lg" onClick={() => setListOpen(true)}><List />看全部留言</Button>
          <Button className="pill" variant="outline" size="lg" onClick={exportMessages} disabled={!messages.length}><Download />備份</Button>
          {isAdmin && <>
            <Button className="pill" variant="outline" size="lg" onClick={() => importRef.current?.click()}><Upload />還原</Button>
            <Button className="pill" variant="destructive" size="lg" onClick={() => setClearOpen(true)}><Trash2 />清除全部</Button>
          </>}
          <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importMessages(file);
          }} />
        </nav>
      )}

      {error && <button className="connection-error" onClick={() => void loadMessages(true)}>{error} 點此重試</button>}

      <section className={messages.length > 30 ? 'tree-stage dense-leaves' : 'tree-stage'} aria-label="藍色留言樹">
        <div className="sun-glow" /><div className="ground" />
        <img className="tree-image" src="/tree-silhouette.webp" alt="" aria-hidden="true" />

        {loading && <div className="empty-state">正在讓留言樹長出來…</div>}
        {!loading && !messages.length && !error && <div className="empty-state"><Leaf /><strong>等待第一片葉子</strong><span>點「新增一片葉子」寫下第一則留言。</span></div>}

        <div className="leaves-layer">
          {messages.map((item) => {
            const position = positionFor(item.slot);
            return <button key={item.id} className="leaf-wrap"
              style={{ left: `${position.x}%`, top: `${position.y}%`, width: leafSize, height: leafSize * 0.65 }}
              onClick={() => setDetail(item)} aria-label={item.name ? `${item.name} 的留言：${item.message}` : `留言：${item.message}`}>
              <span className="leaf-body" style={{ background: item.color, transform: `rotate(${item.rotation}deg)` }}>
                {item.name && <b>{item.name}</b>}<span>{item.message}</span>
              </span>
            </button>;
          })}
        </div>

        {displayMode && qrDataUrl && <button className="stage-qr" onClick={() => setQrOpen(true)}>
          <img src={qrDataUrl} alt="掃描後開啟留言頁" /><span>掃我留言</span>
        </button>}
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="dialog-card">
          <DialogHeader><DialogTitle>新增一片藍色樹葉</DialogTitle><DialogDescription>留言會直接顯示在葉子上。</DialogDescription></DialogHeader>
          <form onSubmit={submitMessage} className="message-form">
            <label>留言內容<Textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={40} required rows={4} autoFocus /></label>
            <span className="character-count">{message.length}/40</span>
            <DialogFooter className="form-actions"><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>取消</Button><Button type="submit" disabled={submitting}>{submitting ? '送出中…' : '送出葉子'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="dialog-card">
          <DialogHeader><DialogTitle>{detail?.name || '留言'}</DialogTitle><DialogDescription>{detail && formatTime(detail.createdAt)}</DialogDescription></DialogHeader>
          <p className="detail-message">{detail?.message}</p>
          {isAdmin && <DialogFooter><Button variant="destructive" onClick={() => void deleteMessage()}><Trash2 />刪除這片葉子</Button></DialogFooter>}
        </DialogContent>
      </Dialog>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="dialog-card list-card">
          <DialogHeader><DialogTitle>全部留言</DialogTitle><DialogDescription>共 {messages.length} 片葉子</DialogDescription></DialogHeader>
          <ul className="message-list">{[...messages].reverse().map((item) => <li key={item.id}>{item.name && <b>{item.name}</b>}<time>{formatTime(item.createdAt)}</time><span>{item.message}</span></li>)}{!messages.length && <li>還沒有任何留言。</li>}</ul>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="dialog-card qr-card">
          <DialogHeader><DialogTitle>掃描 QR Code 來留言</DialogTitle><DialogDescription>每個人都會開啟同一棵留言樹。</DialogDescription></DialogHeader>
          {qrDataUrl && <img src={qrDataUrl} alt="留言樹分享 QR Code" className="qr-image" />}
          <code className="share-url">{shareUrl}</code>
          <DialogFooter><Button onClick={() => void copyShareUrl()}>複製分享網址</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>清除全部留言？</AlertDialogTitle><AlertDialogDescription>這會刪除目前 {messages.length} 片葉子，且無法復原。建議先下載備份。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void clearMessages()}>確認清除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

