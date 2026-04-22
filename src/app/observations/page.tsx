'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/layout/Header';
import {
  Loader2, ClipboardList, CheckCircle2, Clock, Send, Eye,
  ChevronRight, User, BookOpen, Plus, X, AlertCircle, Shield
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ObservationStatus = 'draft' | 'pending' | 'submitted' | 'reviewed' | 'acknowledged';

interface Observation {
  id: string;
  status: ObservationStatus;
  staffId: string;
  managerId: string | null;
  rubricId: string;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  staff?:   { id: string; email: string; profile?: { fullName: string | null } };
  manager?: { id: string; email: string; profile?: { fullName: string | null } };
  rubric?:  { id: string; name: string };
  answers?: Answer[];
}

interface ObservationDetail extends Omit<Observation, 'rubric'> {
  rubric?: {
    id: string;
    name: string;
    sections: Section[];
  };
}

interface Section {
  id: string;
  name: string;
  weight: string | null;
  indicators: Indicator[];
}

interface Indicator {
  id: string;
  name: string;
  description?: string | null;
}

interface Answer {
  id: string;
  indicatorId: string;
  score: number;
  note?: string | null;
  evidence?: string | null;
}

interface UserItem {
  id: string;
  email: string;
  profile?: { fullName: string | null };
  roles?: string[];
}

interface Rubric {
  id: string;
  name: string;
}

// ─── Hook: session + roles ────────────────────────────────────────────────────

function useCurrentUser() {
  const { data: session, status } = useSession();
  const isLoading = status === 'loading';

  if (!session?.user) {
    return {
      user: null,
      roles: [] as string[],
      isManager: false,
      isStaff: false,
      isAdmin: false,
      isDirector: false,
      isLoading,
    };
  }

  const roles: string[] = (session.user as any).roles ?? [];

  return {
    user: {
      id: (session.user as any).id as string,
      email: session.user.email ?? '',
      name: session.user.name ?? null,
      roles,
    },
    roles,
    isManager:  roles.includes('manager') || roles.includes('admin'),
    isStaff:    roles.includes('staff'),
    isAdmin:    roles.includes('admin'),
    isDirector: roles.includes('director'),
    isLoading,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(u?: { email: string; profile?: { fullName: string | null } | null }) {
  return u?.profile?.fullName || u?.email || '—';
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: any; cls: string }> = {
  draft:        { label: 'Draft',        icon: Clock,        cls: 'bg-zinc-100 text-zinc-600 border-zinc-200'   },
  pending:      { label: 'Pending',      icon: Clock,        cls: 'bg-amber-50 text-amber-700 border-amber-200'  },
  submitted:    { label: 'Submitted',    icon: Send,         cls: 'bg-blue-50 text-blue-700 border-blue-200'     },
  reviewed:     { label: 'Reviewed',     icon: Eye,          cls: 'bg-purple-50 text-purple-700 border-purple-200'},
  acknowledged: { label: 'Acknowledged', icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, icon: Eye, cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Alert ────────────────────────────────────────────────────────────────────

function Alert({ type, message }: { type: 'error' | 'success'; message: string }) {
  return (
    <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm border mb-4 ${
      type === 'error'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
    }`}>
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      {message}
    </div>
  );
}

// ─── Score Input (auto-save on blur) ─────────────────────────────────────────

function ScoreInput({
  indicator,
  answer,
  disabled,
  onSave,
}: {
  indicator: Indicator;
  answer?: Answer;
  disabled: boolean;
  onSave: (indicatorId: string, score: number, note: string) => Promise<void>;
}) {
  const [score,  setScore]  = useState(answer?.score && answer.score > 0 ? answer.score.toString() : '');
  const [note,   setNote]   = useState(answer?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    setScore(answer?.score && answer.score > 0 ? answer.score.toString() : '');
    setNote(answer?.note ?? '');
  }, [answer?.score, answer?.note]);

  const handleSave = async () => {
    const num = Number(score);
    if (!score || isNaN(num) || disabled) return;
    setSaving(true);
    try {
      await onSave(indicator.id, num, note);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const isFilled = score !== '' && Number(score) > 0;

  return (
    <div className={`border rounded-xl p-4 mb-3 bg-white transition-colors ${
      isFilled ? 'border-zinc-300' : 'border-zinc-200 hover:border-zinc-300'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isFilled ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
            <p className="font-medium text-zinc-800 text-sm">{indicator.name}</p>
          </div>
          {indicator.description && (
            <p className="text-xs text-zinc-500 mt-0.5 ml-3.5">{indicator.description}</p>
          )}
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-zinc-400 ml-2 flex-shrink-0" />}
        {saved && !saving && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-2 flex-shrink-0" />}
      </div>

      <div className="flex gap-3 items-start">
        <div className="flex-shrink-0">
          <label className="block text-xs text-zinc-500 mb-1 font-medium">Score (1–100)</label>
          <input
            type="number" min="1" max="100"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            onBlur={handleSave}
            disabled={disabled}
            placeholder="1–100"
            className="w-24 px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-400"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1 font-medium">Catatan</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={handleSave}
            disabled={disabled}
            rows={2}
            placeholder="Tulis catatan observasi..."
            className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-400 resize-none"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ObservationsPage() {
  const {
    user, roles, isManager, isStaff, isAdmin, isDirector, isLoading: sessionLoading,
  } = useCurrentUser();

  const [observations,  setObservations]  = useState<Observation[]>([]);
  const [selected,      setSelected]      = useState<ObservationDetail | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [alertMsg,      setAlertMsg]      = useState<{ type: 'error'|'success'; message: string } | null>(null);

  // Form state untuk Admin membuat observation baru
  const [staffList,   setStaffList]   = useState<UserItem[]>([]);
  const [managerList, setManagerList] = useState<UserItem[]>([]);
  const [rubricList,  setRubricList]  = useState<Rubric[]>([]);
  const [form,        setForm]        = useState({ staffId: '', managerId: '', rubricId: '' });
  const [creating,    setCreating]    = useState(false);
  const [showForm,    setShowForm]    = useState(false);

  const showAlert = (type: 'error'|'success', message: string) => {
    setAlertMsg({ type, message });
    setTimeout(() => setAlertMsg(null), 5000);
  };

  // ── Data fetching ──────────────────────────────────────────────────

  const fetchObservations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/observations');
      if (!res.ok) return;
      const json = await res.json();
      const list: Observation[] = Array.isArray(json) ? json : [];
      setObservations(list);
      if (list.length > 0 && !selected) {
        loadDetail(list[0].id);
      }
    } catch (err) {
      console.error('fetchObservations error:', err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFormData = useCallback(async () => {
    if (!isAdmin) return; // hanya admin yang bisa buat observation
    try {
      const [usersRes, managersRes, rubricsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/managers'),
        fetch('/api/rubrics'),
      ]);

      const usersRaw    = await usersRes.json();
      const managersRaw = await managersRes.json();
      const rubricsRaw  = await rubricsRes.json();

      const users: UserItem[] = Array.isArray(usersRaw?.data)
        ? usersRaw.data : Array.isArray(usersRaw) ? usersRaw : [];
      setStaffList(users);

      const managers: UserItem[] = Array.isArray(managersRaw) ? managersRaw : [];
      setManagerList(managers);

      const rubrics: Rubric[] = Array.isArray(rubricsRaw)
        ? rubricsRaw : Array.isArray(rubricsRaw?.data) ? rubricsRaw.data : [];
      setRubricList(rubrics);
    } catch (err) {
      console.error('fetchFormData error:', err);
    }
  }, [isAdmin]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/observations/${id}`);
      if (!res.ok) return;
      setSelected(await res.json());
    } catch (err) {
      console.error('loadDetail error:', err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionLoading && user) {
      fetchObservations();
      fetchFormData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, user?.id]);

  // ── Actions ────────────────────────────────────────────────────────

  /** Admin membuat observation dan menugaskan ke manager */
  const createObservation = async () => {
    if (!form.staffId || !form.rubricId) {
      showAlert('error', 'Pilih staff dan rubric terlebih dahulu.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId:   form.staffId,
          rubricId:  form.rubricId,
          managerId: form.managerId || undefined, // opsional; backend default ke admin sendiri
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showAlert('error', json.error || 'Gagal membuat observation.');
        return;
      }
      setForm({ staffId: '', managerId: '', rubricId: '' });
      setShowForm(false);
      showAlert('success', 'Observation berhasil dibuat dan manager sudah dinotifikasi.');
      await fetchObservations();
      await loadDetail(json.id);
    } catch {
      showAlert('error', 'Terjadi kesalahan jaringan.');
    } finally {
      setCreating(false);
    }
  };

  /** Manager auto-save jawaban per indicator (onBlur) */
  const saveAnswer = async (indicatorId: string, score: number, note: string) => {
    if (!selected) return;
    const res = await fetch('/api/observations/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observationId: selected.id, indicatorId, score, note }),
    });
    if (!res.ok) {
      const json = await res.json();
      showAlert('error', json.error || 'Gagal menyimpan jawaban.');
      return;
    }
    await loadDetail(selected.id);
  };

  /** Manager submit observation */
  const handleSubmit = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/observations/${selected.id}/submit`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok) { showAlert('error', json.error || 'Gagal submit.'); return; }
      showAlert('success', 'Observasi berhasil disubmit. Staff akan mendapat notifikasi email.');
      await fetchObservations();
      await loadDetail(selected.id);
    } catch {
      showAlert('error', 'Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(false);
    }
  };

  /** Staff acknowledge hasil observasi */
  const handleAcknowledge = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/observations/${selected.id}/acknowledge`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok) { showAlert('error', json.error || 'Gagal acknowledge.'); return; }
      showAlert('success', 'Observation berhasil di-acknowledge.');
      await fetchObservations();
      await loadDetail(selected.id);
    } catch {
      showAlert('error', 'Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Computed permissions ───────────────────────────────────────────

  const indicators = selected?.rubric?.sections?.flatMap((s) => s.indicators) ?? [];

  const completedCount = indicators.filter((ind) =>
    selected?.answers?.some((a) => a.indicatorId === ind.id && a.score > 0)
  ).length;

  /**
   * Sesuai user flow: Manager mengisi (bukan membuat).
   * canEdit = true jika:
   *   - User adalah manager yang ditugaskan (managerId === user.id) atau admin
   *   - Status masih draft
   */
  const canEdit =
    selected?.status === 'draft' &&
    (selected?.managerId === user?.id || isAdmin);

  const canSubmit = canEdit && completedCount > 0;

  /**
   * canAcknowledge = true jika:
   *   - User adalah staff target (staffId === user.id) atau admin
   *   - Status submitted
   *   Tidak mengecek role — user dengan multi-role (staff+manager) tetap bisa acknowledge
   */
  const canAcknowledge =
    selected?.status === 'submitted' &&
    (selected?.staffId === user?.id || isAdmin);

  // ── Render ─────────────────────────────────────────────────────────

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="container mx-auto px-6 py-8 max-w-6xl">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">Observations</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {isAdmin
                ? 'Kelola semua observasi — buat & assign ke manager'
                : isDirector
                ? 'Pantau semua observasi yang sudah selesai'
                : isManager
                ? 'Isi form observasi yang sudah ditugaskan kepada Anda'
                : 'Lihat dan acknowledge hasil observasi Anda'}
            </p>
            <div className="flex gap-1 mt-2">
              {roles.map((r) => (
                <span key={r} className="text-xs bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded-full">{r}</span>
              ))}
            </div>
          </div>

          {/* ✅ Hanya Admin yang bisa buat observation baru */}
          {isAdmin && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 transition-colors"
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? 'Tutup' : 'Buat Observation'}
            </button>
          )}
        </div>

        {alertMsg && <Alert type={alertMsg.type} message={alertMsg.message} />}

        {/* ── Form Create (Admin only) ─────────────────────────── */}
        {showForm && isAdmin && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-5 mb-6 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-700 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-zinc-400" />
              Buat Observation Baru
              <span className="text-xs text-zinc-400 font-normal">(hanya admin)</span>
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Staff yang diobservasi *</label>
                <select
                  value={form.staffId}
                  onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                >
                  <option value="">Pilih staff...</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>{s.profile?.fullName || s.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Assign ke Manager
                  <span className="text-zinc-400 font-normal ml-1">(opsional)</span>
                </label>
                <select
                  value={form.managerId}
                  onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                >
                  <option value="">Default (diri sendiri)</option>
                  {managerList.map((m) => (
                    <option key={m.id} value={m.id}>{m.profile?.fullName || m.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Form rubric / toolset *</label>
                <select
                  value={form.rubricId}
                  onChange={(e) => setForm({ ...form, rubricId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                >
                  <option value="">Pilih rubric...</option>
                  {rubricList.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900">
                Batal
              </button>
              <button
                onClick={createObservation}
                disabled={creating || !form.staffId || !form.rubricId}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Buat & Assign
              </button>
            </div>
          </div>
        )}

        {/* ── Main Grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-6">

          {/* Left: Observation List */}
          <div className="col-span-2">
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  {observations.length} Observation{observations.length !== 1 ? 's' : ''}
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                </div>
              ) : observations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <ClipboardList className="w-10 h-10 text-zinc-200 mb-3" />
                  <p className="text-sm font-medium text-zinc-500">Belum ada observation</p>
                  {isAdmin && (
                    <p className="text-xs text-zinc-400 mt-1">Klik "Buat Observation" untuk memulai</p>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {observations.map((obs) => (
                    <button
                      key={obs.id}
                      onClick={() => loadDetail(obs.id)}
                      className={`w-full text-left px-4 py-3.5 hover:bg-zinc-50 transition-colors flex items-center justify-between group ${
                        selected?.id === obs.id
                          ? 'bg-zinc-50 border-l-2 border-l-zinc-900'
                          : 'border-l-2 border-l-transparent'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <User className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                          <p className="text-sm font-medium text-zinc-800 truncate">
                            {displayName(obs.staff)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={obs.status} />
                          {obs.rubric?.name && (
                            <span className="text-xs text-zinc-400 truncate max-w-[120px]">
                              {obs.rubric.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Observation Detail */}
          <div className="col-span-3">
            {!selected ? (
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm flex flex-col items-center justify-center py-24 text-center">
                <BookOpen className="w-12 h-12 text-zinc-200 mb-3" />
                <p className="text-sm font-medium text-zinc-500">Pilih observation dari daftar</p>
                <p className="text-xs text-zinc-400 mt-1">Detail akan tampil di sini</p>
              </div>
            ) : detailLoading ? (
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm flex items-center justify-center py-24">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            ) : (
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">

                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-100">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-base font-semibold text-zinc-900">
                      {selected.rubric?.name ?? 'Detail Observasi'}
                    </h2>
                    <StatusBadge status={selected.status} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      Staff: <strong className="text-zinc-700 ml-1">{displayName(selected.staff)}</strong>
                    </span>
                    <span>
                      Manager: <strong className="text-zinc-700">{displayName(selected.manager)}</strong>
                    </span>
                    {selected.submittedAt && (
                      <span>Submitted: {new Date(selected.submittedAt).toLocaleDateString('id-ID')}</span>
                    )}
                    {selected.acknowledgedAt && (
                      <span>Acknowledged: {new Date(selected.acknowledgedAt).toLocaleDateString('id-ID')}</span>
                    )}
                  </div>
                </div>

                {/* Progress bar — hanya saat manager bisa edit */}
                {canEdit && indicators.length > 0 && (
                  <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-zinc-500">Progress pengisian</span>
                      <span className="text-xs font-medium text-zinc-700">
                        {completedCount} / {indicators.length} indikator
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-zinc-900 rounded-full transition-all duration-500"
                        style={{ width: `${indicators.length > 0 ? (completedCount / indicators.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Sections & Indicators */}
                <div className="px-6 py-4 max-h-[55vh] overflow-y-auto">
                  {!selected.rubric?.sections || selected.rubric.sections.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-sm text-red-500 font-medium">Rubric belum memiliki section/indikator</p>
                      <p className="text-xs text-zinc-400 mt-1">Tambahkan section & indikator pada rubric ini di menu Rubrics</p>
                    </div>
                  ) : (
                    selected.rubric.sections.map((section) => (
                      <div key={section.id} className="mb-6">
                        {/* ✅ Section header hanya satu kali — bug double-render diperbaiki */}
                        <div className="flex items-center gap-2 mb-3 pb-1 border-b border-zinc-100">
                          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                            {section.name}
                          </h3>
                          {section.weight && (
                            <span className="text-xs text-zinc-400">bobot {section.weight}%</span>
                          )}
                        </div>

                        {section.indicators.length === 0 ? (
                          <p className="text-xs text-zinc-400 italic px-1">Belum ada indikator di section ini</p>
                        ) : section.indicators.map((indicator) => {
                          const answer = selected.answers?.find((a) => a.indicatorId === indicator.id);

                          // Read-only view (staff, director, atau setelah submitted)
                          if (!canEdit) {
                            return (
                              <div key={indicator.id} className="border border-zinc-100 rounded-xl p-4 mb-3 bg-zinc-50">
                                <p className="text-sm font-medium text-zinc-800 mb-2">{indicator.name}</p>
                                {indicator.description && (
                                  <p className="text-xs text-zinc-500 mb-3">{indicator.description}</p>
                                )}
                                {answer && answer.score > 0 ? (
                                  <div className="flex gap-6">
                                    <div>
                                      <span className="text-xs text-zinc-500 block mb-0.5">Score</span>
                                      <span className="text-2xl font-bold text-zinc-900">{answer.score}</span>
                                      <span className="text-xs text-zinc-400 ml-1">/ 100</span>
                                    </div>
                                    {answer.note && (
                                      <div className="flex-1">
                                        <span className="text-xs text-zinc-500 block mb-0.5">Catatan</span>
                                        <p className="text-sm text-zinc-700">{answer.note}</p>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-xs text-zinc-400 italic">Belum diisi oleh manager</p>
                                )}
                              </div>
                            );
                          }

                          return (
                            <ScoreInput
                              key={indicator.id}
                              indicator={indicator}
                              answer={answer}
                              disabled={false}
                              onSave={saveAnswer}
                            />
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>

                {/* Action Footer */}
                {(canSubmit || canAcknowledge) && (
                  <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50">

                    {canSubmit && (
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xs text-zinc-500">
                          {completedCount < indicators.length
                            ? `${indicators.length - completedCount} indikator belum diisi`
                            : '✓ Semua indikator sudah diisi'}
                        </p>
                        <button
                          onClick={handleSubmit}
                          disabled={actionLoading}
                          className="flex items-center gap-2 px-5 py-2 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Submit Observasi
                        </button>
                      </div>
                    )}

                    {canAcknowledge && (
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-zinc-800">Sudah membaca hasil observasi?</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Klik Acknowledge untuk konfirmasi bahwa Anda telah membaca hasil ini.
                          </p>
                        </div>
                        <button
                          onClick={handleAcknowledge}
                          disabled={actionLoading}
                          className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Acknowledge
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
