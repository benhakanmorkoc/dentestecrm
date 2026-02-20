import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// --- SABİTLER ---
const LEAD_SOURCES = [
  "Facebook Reklam",
  "Direk Arama",
  "Referans",
  "Direk Mesaj-Instagram",
  "Eski Data",
];

const LEAD_STATUSES = [
  "Yeni",
  "Cevapsız",
  "Sıcak",
  "Satış",
  "İptal",
  "Yabancı",
  "Türk",
  "Düşünüp Geri Dönüş Sağlayacak",
  "İletişimde",
  "İstanbul Dışı",
  "Vazgeçti",
  "Randevu Verilen",
  "Randevu Gelen",
  "Randevu Gelmeyen",
];

const LEAD_STAGES = ["Çok Uzak", "Çok Pahalı", "Şişli Uzak", "Diğer"];

const LANGUAGES = ["TR", "EN", "DE", "FR", "AR"];

function createEmptyLead(ownerId) {
  return {
    id: null,
    name: "",
    language: "",
    phone: "",
    source: "",
    status: "Yeni",
    stage: "",
    owner_id: ownerId ?? "",
    pendingNote: "",
    quote: "",
  };
}

export function App() {
  // --- STATE TANIMLARI ---
  const [currentProfile, setCurrentProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [notes, setNotes] = useState([]);
  const [leadForm, setLeadForm] = useState(() => createEmptyLead(""));
  const [filters, setFilters] = useState({
    status: "",
    ownerId: "",
    source: "",
    fromDate: "",
    toDate: "",
  });
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [activeView, setActiveView] = useState("leads");
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  const isAdmin = currentProfile?.role === "admin";

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId]
  );

  // --- FİLTRELEME MANTIĞI ---
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.ownerId && lead.owner_id !== filters.ownerId) return false;
      if (filters.source && lead.source !== filters.source) return false;

      if (filters.fromDate) {
        const created = new Date(lead.created_at);
        const from = new Date(filters.fromDate);
        if (Number.isFinite(created.getTime()) && created < from) return false;
      }

      if (filters.toDate) {
        const created = new Date(lead.created_at);
        const to = new Date(filters.toDate);
        if (Number.isFinite(created.getTime()) && created > to) return false;
      }
      return true;
    });
  }, [leads, filters]);

  const totalCount = leads.length;

  const countByStatus = useMemo(() => {
    const result = {};
    for (const s of LEAD_STATUSES) result[s] = 0;
    for (const lead of leads) {
      if (result[lead.status] == null) result[lead.status] = 0;
      result[lead.status] += 1;
    }
    return result;
  }, [leads]);

  function formatDate(dateIso) {
    if (!dateIso) return "";
    const date = new Date(dateIso);
    if (!Number.isFinite(date.getTime())) return dateIso;
    return date.toLocaleString("tr-TR");
  }

  // --- VERİ YÜKLEME ---
  async function loadAllData() {
    setLoadingData(true);
    try {
      const [{ data: usersData }, { data: leadsData }, { data: notesData }] =
        await Promise.all([
          supabase.from("profiles").select("id, username, role, active").order("username"),
          supabase
            .from("leads")
            .select("id, name, language, phone, source, status, stage, quote, created_at, updated_at, owner_id")
            .order("created_at", { ascending: false }),
          supabase
            .from("lead_notes")
            .select("id, lead_id, author_id, text, created_at")
            .order("created_at", { ascending: false }),
        ]);

      setUsers(usersData ?? []);
      setLeads(leadsData ?? []);
      setNotes(notesData ?? []);
    } catch (e) {
      console.error(e);
      alert("Veriler yüklenirken bir hata oluştu.");
    } finally {
      setLoadingData(false);
    }
  }

  // --- AUTH İŞLEMLERİ ---
  useEffect(() => {
    async function initAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthLoading(false); return; }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, username, role, active")
        .eq("id", user.id)
        .single();

      if (error || !profile || profile.active === false) {
        await supabase.auth.signOut();
        setAuthLoading(false);
        return;
      }

      setCurrentProfile(profile);
      setAuthLoading(false);
      setActiveView("leads");
      await loadAllData();
    }
    initAuth();
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    const username = event.target.username.value.trim();
    const password = event.target.password.value;
    setAuthLoading(true);
    try {
      const email = `${username}@local.minicrm`;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        alert("Hatalı giriş.");
        setAuthLoading(false);
        return;
      }
      await loadAllData();
      window.location.reload(); // Profil state'ini yenilemek için
    } catch (e) {
      alert("Hata oluştu.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setCurrentProfile(null);
    setLeads([]);
  }

  // --- LEAD İŞLEMLERİ ---
  function handleLeadFieldChange(field, value) {
    setLeadForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetLeadForm() {
    setLeadForm(createEmptyLead(currentProfile?.id ?? ""));
    setSelectedLeadId(null);
    setIsLeadModalOpen(false);
  }

  async function upsertLead(event) {
    event.preventDefault();
    if (!currentProfile) return;
    const nowIso = new Date().toISOString();
    const base = {
      name: leadForm.name.trim(),
      phone: leadForm.phone.trim(),
      language: leadForm.language || null,
      source: leadForm.source || null,
      status: leadForm.status,
      stage: leadForm.stage || null,
      quote: leadForm.quote || null,
      owner_id: leadForm.owner_id || currentProfile.id, // Satis yetkisi eklendi
      updated_at: nowIso,
    };

    try {
      if (leadForm.id) {
        await supabase.from("leads").update(base).eq("id", leadForm.id);
      } else {
        const { data } = await supabase.from("leads").insert([{ ...base, created_at: nowIso }]).select().single();
        setSelectedLeadId(data.id);
      }
      if (leadForm.pendingNote.trim()) {
        await addNoteToLeadInternal(leadForm.pendingNote.trim(), leadForm.id);
      }
      await loadAllData();
      resetLeadForm();
    } catch (e) {
      alert("Kaydedilemedi.");
    }
  }

  function editLead(lead) {
    setLeadForm({
      id: lead.id,
      name: lead.name ?? "",
      language: lead.language ?? "",
      phone: lead.phone ?? "",
      source: lead.source ?? "",
      status: lead.status ?? "Yeni",
      stage: lead.stage ?? "",
      owner_id: lead.owner_id ?? currentProfile?.id ?? "",
      pendingNote: "",
      quote: lead.quote ?? "",
    });
    setSelectedLeadId(lead.id);
    setIsLeadModalOpen(true);
  }

  async function addNoteToLeadInternal(text, explicitLeadId) {
    const leadId = explicitLeadId || selectedLeadId;
    await supabase.from("lead_notes").insert([{ lead_id: leadId, author_id: currentProfile.id, text }]);
  }

  async function addNoteToLead() {
    if (!leadForm.pendingNote.trim()) return;
    await addNoteToLeadInternal(leadForm.pendingNote.trim(), selectedLeadId);
    setLeadForm((prev) => ({ ...prev, pendingNote: "" }));
    await loadAllData();
  }

  async function toggleUserActive(id, currentActive) {
    if (!isAdmin) return;
    await supabase.from("profiles").update({ active: !currentActive }).eq("id", id);
    await loadAllData();
  }

  function exportToCsv() {
    const headers = ["ID", "İsim", "Dil", "Telefon", "Kaynak", "Tarih", "Durum", "Sahibi"];
    const rows = filteredLeads.map(l => [l.id, l.name, l.language, l.phone, l.source, l.created_at, l.status, users.find(u => u.id === l.owner_id)?.username]);
    const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // --- RENDER ---
  if (authLoading) return <div className="login-shell"><div className="login-card">Yükleniyor...</div></div>;

  if (!currentProfile) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-title">CRM - DentEste</div>
          <form onSubmit={handleLogin} className="stack">
            <input name="username" className="input" placeholder="Kullanıcı Adı" />
            <input name="password" type="password" className="input" placeholder="Şifre" />
            <button className="btn btn-primary" type="submit">Giriş Yap</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-title">CRM - DentEste</div>
        <div className="stack" style={{ alignItems: "flex-end" }}>
          <div className="stack-row">
            <span className="badge">Toplam: {totalCount}</span>
            <span className="badge">Yeni: {countByStatus["Yeni"] ?? 0}</span>
            <span className="badge">Satış: {countByStatus["Satış"] ?? 0}</span>
          </div>
          <div className="small muted">Oturum: {currentProfile.username} ({isAdmin ? "Admin" : "Satış"})</div>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <button className={`nav-button ${activeView === "leads" ? "nav-button-active" : ""}`} onClick={() => setActiveView("leads")}>📋</button>
          <button className={`nav-button ${activeView === "users" ? "nav-button-active" : ""}`} onClick={() => isAdmin && setActiveView("users")} disabled={!isAdmin}>👤</button>
          <button className="nav-button nav-button-logout" onClick={handleLogout}>⏻</button>
        </aside>

        <div className="content">
          {activeView === "leads" && (
            <section className="card">
              <div className="card-header">
                <div className="card-title">Lead Listesi</div>
                <div className="stack-row">
                  <button className="btn btn-primary" onClick={() => setIsLeadModalOpen(true)}>Ekle</button>
                  <button className="btn btn-ghost" onClick={exportToCsv}>Excel İndir</button>
                </div>
              </div>

              {/* FİLTRE PANELİ */}
              <div className="filters-grid">
                <div className="field">
                  <label className="field-label">Durum</label>
                  <select className="select" value={filters.status} onChange={(e) => setFilters(p => ({ ...p, status: e.target.value }))}>
                    <option value="">Tümü</option>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Lead Sahibi</label>
                  <select className="select" value={filters.ownerId} onChange={(e) => setFilters(p => ({ ...p, ownerId: e.target.value }))}>
                    <option value="">Tümü</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Tarih Aralığı</label>
                  <div className="stack-row">
                    <input type="date" className="input" value={filters.fromDate} onChange={e => setFilters(p => ({ ...p, fromDate: e.target.value }))} />
                    <input type="date" className="input" value={filters.toDate} onChange={e => setFilters(p => ({ ...p, toDate: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* HIZLI FİLTRE BUTONLARI */}
              <div className="chips-row">
                <button className={`chip ${!filters.fromDate && !filters.status ? "chip-active" : ""}`} onClick={() => setFilters({ status: "", ownerId: "", source: "", fromDate: "", toDate: "" })}>Tümü</button>
                
                <button className="chip" onClick={() => {
                  const d = new Date().toISOString().split('T')[0];
                  setFilters(p => ({ ...p, fromDate: d, toDate: d }));
                }}>Bugün</button>

                <button className="chip" onClick={() => {
                  const now = new Date();
                  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                  setFilters(p => ({ ...p, fromDate: firstDay, toDate: "" }));
                }}>Bu Ay</button>

                <button className="chip" onClick={() => {
                  const now = new Date();
                  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split('T')[0];
                  setFilters(p => ({ ...p, fromDate: threeMonthsAgo, toDate: "" }));
                }}>Son 3 Ay</button>

                <button className={`chip ${filters.status === "Yeni" ? "chip-active" : ""}`} onClick={() => setFilters(p => ({ ...p, status: "Yeni" }))}>Sıcak (Yeni)</button>
                <button className="chip" style={{ color: 'red' }} onClick={() => setFilters({ status: "", ownerId: "", source: "", fromDate: "", toDate: "" })}>Filtreleri Temizle</button>
              </div>

              {/* TABLO */}
              <div className="lead-table-wrapper">
                <table className="lead-table">
                  <thead>
                    <tr><th>Lead</th><th>İletişim</th><th>Sahibi</th><th>Durum</th><th>Notlar</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map(lead => (
                      <tr key={lead.id}>
                        <td>
                          <div className="stack">
                            <strong>{lead.name}</strong>
                            <div className="small muted">Oluşturma: {formatDate(lead.created_at)}</div>
                            <div className="small muted">Güncelleme: {formatDate(lead.updated_at)}</div>
                          </div>
                        </td>
                        <td>{lead.phone}<br/><span className="small muted">{lead.language}</span></td>
                        <td>{users.find(u => u.id === lead.owner_id)?.username}</td>
                        <td><span className="lead-pill">{lead.status}</span></td>
                        <td>
                          <div className="timeline">
                            {notes.filter(n => n.lead_id === lead.id).slice(0, 1).map(n => (
                              <div key={n.id} className="small">{n.text}</div>
                            ))}
                          </div>
                        </td>
                        <td><button className="btn btn-ghost" onClick={() => editLead(lead)}>Düzenle</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeView === "users" && isAdmin && (
            <section className="card">
              <div className="card-title">Kullanıcı Yönetimi</div>
              <table className="lead-table">
                <thead><tr><th>Kullanıcı</th><th>Rol</th><th>Durum</th><th>Aksiyon</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>{u.role}</td>
                      <td>{u.active ? "Aktif" : "Pasif"}</td>
                      <td>
                        {u.id !== currentProfile.id && (
                          <button className="btn btn-ghost" onClick={() => toggleUserActive(u.id, u.active)}>{u.active ? "Pasif Et" : "Aktif Et"}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </main>

      {/* LEAD MODAL */}
      {isLeadModalOpen && (
        <div className="modal-backdrop" onClick={resetLeadForm}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{leadForm.id ? "Güncelle" : "Yeni Kayıt"}</div>
              <button onClick={resetLeadForm}>Kapat</button>
            </div>
            <form onSubmit={upsertLead} className="modal-body">
              <div className="form-grid">
                <div className="field"><label>İsim</label><input className="input" value={leadForm.name} onChange={e => handleLeadFieldChange("name", e.target.value)} required /></div>
                <div className="field"><label>Telefon</label><input className="input" value={leadForm.phone} onChange={e => handleLeadFieldChange("phone", e.target.value)} required /></div>
                <div className="field"><label>Durum</label>
                  <select className="select" value={leadForm.status} onChange={e => handleLeadFieldChange("status", e.target.value)}>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field"><label>Lead Sahibi</label>
                  <select className="select" value={leadForm.owner_id} onChange={e => handleLeadFieldChange("owner_id", e.target.value)}>
                    <option value="">Seçiniz</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                </div>
              </div>
              <div className="field" style={{marginTop: 10}}>
                <label>Not Ekle</label>
                <textarea className="textarea" value={leadForm.pendingNote} onChange={e => handleLeadFieldChange("pendingNote", e.target.value)} />
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" type="submit">Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
