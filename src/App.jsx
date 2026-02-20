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

  // --- FİLTRELEME MANTIĞI (DÜZELTİLDİ) ---
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.ownerId && lead.owner_id !== filters.ownerId) return false;
      if (filters.source && lead.source !== filters.source) return false;

      const created = new Date(lead.created_at);

      if (filters.fromDate) {
        const from = new Date(filters.fromDate);
        from.setHours(0, 0, 0, 0); // Günün başlangıcı
        if (created < from) return false;
      }

      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setHours(23, 59, 59, 999); // Günün sonu (Kritik Düzeltme)
        if (created > to) return false;
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

  // --- YEREL TARİH FORMATLAYICI (Yardımcı Fonksiyon) ---
  function getLocalDateString(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  }

  async function loadAllData() {
    setLoadingData(true);
    try {
      const [{ data: usersData }, { data: leadsData }, { data: notesData }] =
        await Promise.all([
          supabase.from("profiles").select("id, username, role, active").order("username"),
          supabase.from("leads").select("*").order("created_at", { ascending: false }),
          supabase.from("lead_notes").select("*").order("created_at", { ascending: false }),
        ]);
      setUsers(usersData ?? []);
      setLeads(leadsData ?? []);
      setNotes(notesData ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    async function initAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!profile || profile.active === false) {
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
    const email = `${username}@local.minicrm`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert("Giriş başarısız.");
      setAuthLoading(false);
    } else {
      window.location.reload();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.reload();
  }

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
    const base = {
      ...leadForm,
      owner_id: leadForm.owner_id || currentProfile.id,
      updated_at: new Date().toISOString()
    };
    delete base.pendingNote;

    if (leadForm.id) {
      await supabase.from("leads").update(base).eq("id", leadForm.id);
    } else {
      await supabase.from("leads").insert([{ ...base, created_at: new Date().toISOString() }]);
    }
    await loadAllData();
    resetLeadForm();
  }

  function editLead(lead) {
    setLeadForm({ ...lead, pendingNote: "" });
    setSelectedLeadId(lead.id);
    setIsLeadModalOpen(true);
  }

  async function toggleUserActive(id, currentActive) {
    await supabase.from("profiles").update({ active: !currentActive }).eq("id", id);
    await loadAllData();
  }

  if (authLoading) return <div className="login-shell">Yükleniyor...</div>;
  if (!currentProfile) {
    return (
      <div className="login-shell">
        <form onSubmit={handleLogin} className="login-card stack">
          <h3>CRM Giriş</h3>
          <input name="username" className="input" placeholder="Kullanıcı Adı" />
          <input name="password" type="password" className="input" placeholder="Şifre" />
          <button className="btn btn-primary" type="submit">Giriş Yap</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-title">CRM - DentEste</div>
        <div className="stack-row">
          <span className="badge">Toplam: {totalCount}</span>
          <span className="badge">Yeni: {countByStatus["Yeni"] ?? 0}</span>
          <div className="small muted">{currentProfile.username} ({isAdmin ? "Admin" : "Satış"})</div>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <button className="nav-button" onClick={() => setActiveView("leads")}>📋</button>
          {isAdmin && <button className="nav-button" onClick={() => setActiveView("users")}>👤</button>}
          <button className="nav-button" onClick={handleLogout}>⏻</button>
        </aside>

        <div className="content">
          {activeView === "leads" && (
            <section className="card">
              <div className="card-header">
                <div className="card-title">Lead Listesi</div>
                <button className="btn btn-primary" onClick={() => setIsLeadModalOpen(true)}>Ekle</button>
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

              {/* HIZLI FİLTRE BUTONLARI (DÜZELTİLDİ) */}
              <div className="chips-row" style={{ marginTop: '10px' }}>
                <button 
                  className={`chip ${!filters.fromDate && !filters.toDate ? "chip-active" : ""}`} 
                  onClick={() => setFilters(p => ({ ...p, fromDate: "", toDate: "" }))}
                >Tümü</button>
                
                <button className="chip" onClick={() => {
                  const d = getLocalDateString(new Date());
                  setFilters(p => ({ ...p, fromDate: d, toDate: d }));
                }}>Bugün</button>

                <button className="chip" onClick={() => {
                  const now = new Date();
                  const firstDay = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
                  setFilters(p => ({ ...p, fromDate: firstDay, toDate: "" }));
                }}>Bu Ay</button>

                <button className="chip" onClick={() => {
                  const now = new Date();
                  const threeMonthsAgo = getLocalDateString(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()));
                  setFilters(p => ({ ...p, fromDate: threeMonthsAgo, toDate: "" }));
                }}>Son 3 Ay</button>

                <button 
                  className="chip" 
                  style={{ backgroundColor: '#fee2e2', color: '#dc2626' }} 
                  onClick={() => setFilters({ status: "", ownerId: "", source: "", fromDate: "", toDate: "" })}
                >Temizle</button>
              </div>

              {/* TABLO */}
              <div className="lead-table-wrapper">
                <table className="lead-table">
                  <thead>
                    <tr><th>Lead Bilgisi</th><th>İletişim</th><th>Sahibi</th><th>Durum</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map(lead => (
                      <tr key={lead.id}>
                        <td>
                          <strong>{lead.name}</strong><br/>
                          <span className="small muted">{formatDate(lead.created_at)}</span>
                        </td>
                        <td>{lead.phone}</td>
                        <td>{users.find(u => u.id === lead.owner_id)?.username}</td>
                        <td><span className="lead-pill">{lead.status}</span></td>
                        <td><button className="btn btn-ghost" onClick={() => editLead(lead)}>Düzenle</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeView === "users" && (
            <section className="card">
              <h3>Kullanıcılar</h3>
              <table className="lead-table">
                <thead><tr><th>Kullanıcı</th><th>Durum</th><th></th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>{u.active ? "Aktif" : "Pasif"}</td>
                      <td>
                        {u.id !== currentProfile.id && (
                          <button className="btn btn-ghost" onClick={() => toggleUserActive(u.id, u.active)}>Durum Değiştir</button>
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

      {/* MODAL */}
      {isLeadModalOpen && (
        <div className="modal-backdrop" onClick={resetLeadForm}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={upsertLead} className="stack">
              <h3>{leadForm.id ? "Güncelle" : "Yeni Lead"}</h3>
              <input className="input" placeholder="İsim" value={leadForm.name} onChange={e => handleLeadFieldChange("name", e.target.value)} required />
              <input className="input" placeholder="Telefon" value={leadForm.phone} onChange={e => handleLeadFieldChange("phone", e.target.value)} required />
              <select className="select" value={leadForm.status} onChange={e => handleLeadFieldChange("status", e.target.value)}>
                {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="select" value={leadForm.owner_id} onChange={e => handleLeadFieldChange("owner_id", e.target.value)}>
                <option value="">Lead Sahibi Seçin</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
              <button className="btn btn-primary" type="submit">Kaydet</button>
              <button className="btn btn-ghost" type="button" onClick={resetLeadForm}>İptal</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
