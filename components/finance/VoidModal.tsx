'use client';

import { useState } from 'react';
import Modal from '../Modal';
import { toast } from '../toast';

// Entries are never edited or deleted — a mistake is voided with a reason. The
// row stays (struck through, with who/when/why) and drops out of every report.
export default function VoidModal({
  title,
  subject,
  onClose,
  onConfirm,
}: {
  title: string;
  subject: string; // what is being voided, e.g. "Rent — Rs 25,000 on 12 Oct"
  onClose: () => void;
  onConfirm: (reason: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (reason.trim().length < 3) { toast('Give a reason (a few words).', true); return; }
    setSaving(true);
    const res = await onConfirm(reason.trim());
    setSaving(false);
    if (res.ok) { toast('Voided'); onClose(); }
    else toast(res.error, true);
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      maxWidth={440}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Keep it</button>
          <button className="btn btn-danger" onClick={submit} disabled={saving}>{saving ? 'Voiding…' : 'Void it'}</button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-[13.5px] text-strong">{subject}</div>
        <p className="text-[12.5px]" style={{ color: 'var(--color-muted)' }}>
          It stays in the list, struck through, with your name, the time and your reason — and is
          left out of every report. This cannot be undone.
        </p>
        <div>
          <label className="field-label">Why is it being voided?</label>
          <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice by mistake" />
        </div>
      </div>
    </Modal>
  );
}
