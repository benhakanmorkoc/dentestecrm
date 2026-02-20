import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// --- SABİTLER ---
const LEAD_SOURCES = ["Facebook Reklam", "Direk Arama", "Referans", "Direk Mesaj-Instagram", "Eski Data"];
const LEAD_STATUSES = [
  "Yeni", "Cevapsız", "Sıcak", "Satış", "İptal", "Yabancı", "Türk", 
  "Düşünüp Geri Dönüş Sağlayacak", "İletişimde", "İstanbul Dışı", 
  "Vazgeçti", "Randevu Verilen", "Randevu Gelen", "Randevu Gelmeyen"
];
const LEAD_STAGES = ["Çok Uzak", "Çok Pahalı", "Şişli Uzak", "Diğer"];
const LANGUAGES = ["TR", "EN", "DE", "FR", "AR"];

function createEmptyLead(ownerId) {
  return {
    id: null, name: "", language: "", phone: "", source: "",
    status: "Yeni", stage: "", owner_id: ownerId ?? "", pendingNote: "", quote: ""
  };
}

export function App() {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [notes, setNotes] = useState([]);
  const [leadForm, setLeadForm] = useState(() => createEmptyLead(""));
  const [filters, setFilters] = useState({ status: "", ownerId: "", source: "", fromDate: "", toDate: "" });
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [activeView, setActiveView] = useState("leads");
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  const isAdmin = currentProfile?.role === "admin";

  // --- FİLTRELEME ---
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (filters.status && lead.status !== filters.status) return false;
      if (filters.ownerId && lead.owner_id !== filters.ownerId) return false;
      if (filters.source && lead.source !== filters.source) return false;
      const created = new Date(lead.created_at);
      if (filters.fromDate) {
        const from = new Date(filters.fromDate);
        from.setHours(0, 0, 0, 0);
        if (created < from) return false;
      }
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setHours(23, 59, 59, 999);
        if (created > to) return false;
      }
      return true;
    });
  }, [leads, filters]);

  // --- YARDIMCI FONKSİYONLAR ---
  function getLocalDateString(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  }

  function formatDate(dateIso) {
    if (!dateIso) return "";
    const date = new Date(dateIso);
    return date.toLocaleString("tr-TR");
  }

  // --- VERİ ÇEKME ---
  async function loadAllData() {
    setLoadingData(true);
    try {
      const [{ data: p }, { data: l }, { data: n }] = await Promise.all([
        supabase.from("profiles").select("*").order("username"),
        supabase.from("leads").select("*").order("created_at", { ascending: false }),
        supabase.from("lead_notes").select("*").order("created_at", { ascending: false })
      ]);
      setUsers(p ?? []);
      setLeads(l ?? []);
      setNotes(n ?? []);
    } finally {
      setLoadingData(false);
    }
  }

  // --- AUTH ---
  useEffect(() => {
    async function initAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthLoading(false); return; }
      const { data: pr } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (!pr || pr.active === false) { await supabase.auth.signOut(); setAuthLoading(false); return; }
      setCurrentProfile(pr);
      setAuthLoading(false);
      await loadAllData();
    }
    initAuth();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email: `${e.target.username.value}@local.minicrm`,
      password: e.target.password.value
    });
    if (error) alert("Giriş hatalı."); else window.location.reload();
  }

  // --- KAYIT (UPSERT) ---
  async function upsertLead(e) {
    e.preventDefault();
    const now = new Date().toISOString();
    const baseData = {
      name: leadForm.name,
      phone: leadForm.phone,
      status: leadForm.status,
      language: leadForm.language,
      source: leadForm.source,
      owner_id: leadForm.owner_id || currentProfile.id,
      updated_at: now
    };

    try {
      let savedId = leadForm.id;
      if (leadForm.id) {
        await supabase.from("leads").update(baseData).eq("id", leadForm.id);
      } else {
        const { data } = await supabase.from("leads").insert([{ ...baseData, created_at: now }]).select().single();
        savedId = data.id;
      }

      // Not Ekleme Kısmı (Düzeltildi)
      if (leadForm.pendingNote.trim()) {
        await supabase.from("lead_notes").insert([{
          lead_id: savedId,
          author_id: currentProfile.id,
          text: leadForm.pendingNote.trim()
        }]);
      }

      await loadAllData();
      resetLeadForm();
    } catch (err) {
      alert("Hata oluştu.");
    }
  }

  function editLead(lead) {
    setLeadForm({ ...lead, pendingNote: "" });
    setSelectedLeadId(lead.id);
    setIsLeadModalOpen(true);
  }

  if (authLoading) return <div className="login-shell">Yükleniyor...</div>;
  if (!currentProfile) return (
    <div className="login-shell">
      <form onSubmit={handleLogin} className="login-card stack">
        <h2>CRM Giriş</h2>
        <input name="username" className="input" placeholder="Kullanıcı Adı" required />
        <input name="password" type="password" className="input" placeholder="Şifre" required />
        <button className="btn btn-primary">Giriş Yap</button>
      </form>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-title">CRM - DentEste</div>
        <div className="stack-row">
          <span className="badge">Toplam: {leads.length}</span>
          <div className="small muted">{currentProfile.username} ({isAdmin ? "Admin" : "Satış"})</div>
          <button className="btn btn-ghost" onClick={() => supabase.auth.signOut().then(() => window.location.reload())}>Çıkış</button>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <button className="nav-button" onClick={() => setActiveView("leads")}>📋</button>
          {isAdmin && <button className="nav-button" onClick={() => setActiveView("users")}>👤</button>}
        </aside>

        <div className="content">
          {activeView === "leads" && (
            <section className="card">
              <div className="card-header">
                <h3>Lead Listesi</h3>
                <button className="btn btn-primary" onClick={() => { resetLeadForm(); setIsLeadModalOpen(true); }}>Ekle</button>
              </div>

              {/* FİLTRELER */}
              <div className="filters-grid">
                <select className="select" value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
                  <option value="">Tüm Durumlar</option>
                  {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="select" value={filters.ownerId} onChange={e => setFilters(p => ({ ...p, ownerId: e.target.value }))}>
                  <option value="">Tüm Sahipler</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
                <div className="stack-row">
                  <input type="date" className="input" value={filters.fromDate} onChange={e => setFilters(p => ({ ...p, fromDate: e.target.value }))} />
                  <input type="date" className="input" value={filters.toDate} onChange={e => setFilters(p => ({ ...p, toDate: e.target.value }))} />
                </div>
              </div>

              {/* HIZLI BUTONLAR */}
              <div className="chips-row">
                <button className="chip" onClick={() => { const d = getLocalDateString(new Date()); setFilters(p => ({ ...p, fromDate: d, toDate: d })); }}>Bugün</button>
                <button className="chip" onClick={() => { const d = new Date(); setFilters(p => ({ ...p, fromDate: getLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1)), toDate: "" })); }}>Bu Ay</button>
                <button className="chip" onClick={() => setFilters({ status: "", ownerId: "", source: "", fromDate: "", toDate: "" })}>Temizle</button>
              </div>

              {/* TABLO */}
              <div className="lead-table-wrapper">
                <table className="lead-table">
                  <thead>
                    <tr><th>Lead</th><th>Sahibi</th><th>Durum</th><th>Tarihçe (Notlar)</th><th>Aksiyon</th></tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map(l => (
                      <tr key={l.id}>
                        <td><strong>{l.name}</strong><br/><span className="small muted">{l.phone}</span></td>
                        <td>{users.find(u => u.id === l.owner_id)?.username}</td>
                        <td><span className="lead-pill">{l.status}</span></td>
                        <td>
                          <div className="timeline">
                            {notes.filter(n => n.lead_id === l.id).map(n => (
                              <div key={n.id} className="timeline-item">
                                <span className="small muted">{formatDate(n.created_at)}:</span> {n.text}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td><button className="btn btn-ghost" onClick={() => editLead(l)}>Düzenle</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeView === "users" && isAdmin && (
            <section className="card">
              <h3>Kullanıcılar</h3>
              {users.map(u => (
                <div key={u.id} className="stack-row" style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                  <span>{u.username} ({u.role})</span>
                  <button className="btn btn-ghost" onClick={async () => {
                    await supabase.from("profiles").update({ active: !u.active }).eq("id", u.id);
                    loadAllData();
                  }}>{u.active ? "Pasif Et" : "Aktif Et"}</button>
                </div>
              ))}
            </section>
          )}
        </div>
      </main>

      {/* MODAL */}
      {isLeadModalOpen && (
        <div className="modal-backdrop" onClick={resetLeadForm}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={upsertLead} className="stack">
              <h3>{leadForm.id ? "Güncelle" : "Yeni Kayıt"}</h3>
              <input className="input" placeholder="İsim" value={leadForm.name} onChange={e => setLeadForm(p => ({ ...p, name: e.target.value }))} required />
              <input className="input" placeholder="Telefon" value={leadForm.phone} onChange={e => setLeadForm(p => ({ ...p, phone: e.target.value }))} required />
              <select className="select" value={leadForm.status} onChange={e => setLeadForm(p => ({ ...p, status: e.target.value }))}>
                {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="select" value={leadForm.owner_id} onChange={e => setLeadForm(p => ({ ...p, owner_id: e.target.value }))}>
                <option value="">Sahip Seçin</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
              <textarea className="textarea" placeholder="Yeni not ekleyin..." value={leadForm.pendingNote} onChange={e => setLeadForm(p => ({ ...p, pendingNote: e.target.value }))} />
              <button className="btn btn-primary" type="submit">Kaydet</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
