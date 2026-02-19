import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

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
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "sales" });
  const [activeView, setActiveView] = useState("leads");
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  const isAdmin = currentProfile?.role === "admin";

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId]
  );

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

  async function loadAllData() {
    setLoadingData(true);
    try {
      const [{ data: usersData }, { data: leadsData }, { data: notesData }] =
        await Promise.all([
          supabase.from("profiles").select("id, username, role, active").order("username"),
          supabase
            .from("leads")
            .select(
              "id, name, language, phone, source, status, stage, quote, created_at, updated_at, owner_id"
            )
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
      // eslint-disable-next-line no-console
      console.error(e);
      alert("Veriler yüklenirken bir hata oluştu.");
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    async function initAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, username, role, active")
        .eq("id", user.id)
        .single();

      if (error || !profile) {
        await supabase.auth.signOut();
        setAuthLoading(false);
        return;
      }

      if (profile.active === false) {
        await supabase.auth.signOut();
        alert("Kullanıcı pasif durumdadır.");
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
    if (!username || !password) return;

    setAuthLoading(true);
    try {
      const email = `${username}@local.minicrm`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.user) {
        alert("Kullanıcı adı veya şifre hatalı.");
        setAuthLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, role, active")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile) {
        alert("Profil bulunamadı.");
        await supabase.auth.signOut();
        setAuthLoading(false);
        return;
      }

      if (profile.active === false) {
        alert("Kullanıcı pasif durumdadır.");
        await supabase.auth.signOut();
        setAuthLoading(false);
        return;
      }

      setCurrentProfile(profile);
      setActiveView("leads");
      await loadAllData();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      alert("Giriş yapılırken hata oluştu.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setCurrentProfile(null);
    setLeads([]);
    setNotes([]);
    setUsers([]);
    setSelectedLeadId(null);
  }

  function handleLeadFieldChange(field, value) {
    setLeadForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function resetLeadForm() {
    setLeadForm(createEmptyLead(currentProfile?.id ?? ""));
    setSelectedLeadId(null);
    setIsLeadModalOpen(false);
  }

  async function upsertLead(event) {
    event.preventDefault();
    if (!currentProfile) return;

    if (!leadForm.name.trim() || !leadForm.phone.trim()) {
      alert("İsim ve Telefon zorunludur.");
      return;
    }

    const nowIso = new Date().toISOString();
    const base = {
      name: leadForm.name.trim(),
      phone: leadForm.phone.trim(),
      language: leadForm.language || null,
      source: leadForm.source || null,
      status: leadForm.status,
      stage: leadForm.stage || null,
      quote: leadForm.quote || null,
      owner_id: leadForm.owner_id || currentProfile.id,
      updated_at: nowIso,
    };

    try {
      if (leadForm.id) {
        const { error } = await supabase
          .from("leads")
          .update(base)
          .eq("id", leadForm.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("leads")
          .insert([{ ...base, created_at: nowIso }])
          .select()
          .single();
        if (error) throw error;
        setSelectedLeadId(data.id);
      }

      if (leadForm.pendingNote.trim()) {
        await addNoteToLeadInternal(leadForm.pendingNote.trim(), leadForm.id);
      }

      await loadAllData();
      resetLeadForm();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      alert("Lead kaydedilirken bir hata oluştu.");
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

  async function deleteLead(id) {
    if (!isAdmin) {
      alert("Lead silme yetkisi sadece admin kullanıcılara aittir.");
      return;
    }
    if (!window.confirm("Bu lead kalıcı olarak silinecek. Emin misiniz?")) return;
    try {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
      await loadAllData();
      if (selectedLeadId === id) {
        resetLeadForm();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      alert("Lead silinirken bir hata oluştu.");
    }
  }

  async function addNoteToLeadInternal(text, explicitLeadId) {
    const leadId = explicitLeadId || selectedLeadId || leadForm.id;
    if (!leadId || !currentProfile) return;
    try {
      const { error } = await supabase.from("lead_notes").insert([
        {
          lead_id: leadId,
          author_id: currentProfile.id,
          text,
        },
      ]);
      if (error) throw error;
      await loadAllData();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      alert("Not eklenirken hata oluştu.");
    }
  }

  async function addNoteToLead() {
    if (!leadForm.pendingNote.trim()) return;
    await addNoteToLeadInternal(leadForm.pendingNote.trim(), selectedLeadId);
    setLeadForm((prev) => ({ ...prev, pendingNote: "" }));
  }

  async function toggleUserActive(id, currentActive) {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ active: !currentActive })
        .eq("id", id);
      if (error) throw error;
      if (id === currentProfile.id && currentActive === true) {
        await handleLogout();
      } else {
        await loadAllData();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      alert("Kullanıcı durumu güncellenirken hata oluştu.");
    }
  }

  function exportToCsv() {
    if (filteredLeads.length === 0) {
      alert("Dışa aktarılacak kayıt bulunamadı.");
      return;
    }

    const headers = [
      "ID",
      "İsim",
      "Dil",
      "Telefon",
      "Kaynak",
      "Oluşturulma Tarihi",
      "Güncelleme Tarihi",
      "Durum",
      "Aşama",
      "Lead Sahibi",
      "Teklif",
      "Notlar (son not ilk)",
    ];

    const rows = filteredLeads.map((lead) => {
      const ownerName = users.find((u) => u.id === lead.owner_id)?.username ?? "";
      const leadNotes = notes
        .filter((n) => n.lead_id === lead.id)
        .map((n) => `${formatDate(n.created_at)} - ${n.text}`)
        .join(" | ");

      return [
        lead.id ?? "",
        lead.name ?? "",
        lead.language ?? "",
        lead.phone ?? "",
        lead.source ?? "",
        lead.created_at ?? "",
        lead.updated_at ?? "",
        lead.status ?? "",
        lead.stage ?? "",
        ownerName,
        lead.quote ?? "",
        leadNotes,
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? "");
            if (/[",;\n]/.test(value)) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(";")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const datePart = new Date().toISOString().slice(0, 10);
    a.download = `leads_${datePart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-title">CRM - DentEste</div>
          <div className="login-subtitle">Yükleniyor...</div>
        </div>
      </div>
    );
  }

  if (!currentProfile) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-title">CRM - DentEste</div>
          <div className="login-subtitle">Lütfen kullanıcı adınız ve şifreniz ile giriş yapın.</div>
          <form onSubmit={handleLogin} className="stack">
            <div className="field">
              <label className="field-label">Kullanıcı Adı</label>
              <input
                name="username"
                className="input"
                placeholder="Kullanıcı Adı"
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label className="field-label">Şifre</label>
              <input
                name="password"
                type="password"
                className="input"
                placeholder="Şifre"
                autoComplete="current-password"
              />
            </div>
            <div className="button-row">
              <button className="btn btn-primary" type="submit" disabled={authLoading}>
                {authLoading ? "Giriş Yapılıyor..." : "Giriş Yap"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-header-title">CRM - DentEste</div>
          <div className="app-header-subtitle">
            Lead kaydı, filtreleme ve Excel&apos;e aktarım için hafif CRM.
          </div>
        </div>
        <div className="stack" style={{ alignItems: "flex-end" }}>
          <div className="stack-row">
            <span className="badge">Toplam Lead: {totalCount}</span>
            <span className="badge">Yeni: {countByStatus["Yeni"] ?? 0}</span>
            <span className="badge">
              Teklif Verildi: {countByStatus["Teklif Verildi"] ?? 0}
            </span>
            <span className="badge">Satıldı: {countByStatus["Satıldı"] ?? 0}</span>
          </div>
          <div className="small muted">
            Oturum: {currentProfile.username} (
            {currentProfile.role === "admin" ? "Admin" : "Satış"})
          </div>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <div className="sidebar-title">CRM</div>
          <button
            className={`nav-button ${activeView === "leads" ? "nav-button-active" : ""}`}
            type="button"
            onClick={() => setActiveView("leads")}
            title="Leadler"
          >
            <span>📋</span>
          </button>
          <button
            className={`nav-button ${activeView === "users" ? "nav-button-active" : ""}`}
            type="button"
            onClick={() => isAdmin && setActiveView("users")}
            disabled={!isAdmin}
            title={isAdmin ? "Kullanıcı Tanımları" : "Sadece admin görebilir"}
          >
            <span>👤</span>
          </button>
          <button
            className="nav-button nav-button-logout"
            type="button"
            onClick={handleLogout}
            title="Sistemden Çıkış"
          >
            <span>⏻</span>
          </button>
        </aside>

        <div className="content">
          {activeView === "leads" && (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Lead Listesi ve Filtreler</div>
                  <div className="card-subtitle">
                    Oluşturulma tarihi, durum, kaynak ve lead sahibi ile filtreleyin.
                  </div>
                </div>
                <div className="stack-row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      setLeadForm(createEmptyLead(currentProfile.id));
                      setSelectedLeadId(null);
                      setIsLeadModalOpen(true);
                    }}
                  >
                    Ekle
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={exportToCsv}
                  >
                    Excel (CSV) İndir
                  </button>
                </div>
              </div>

              <div className="stack">
                <div className="filters-grid">
              <div className="field">
                <label className="field-label">Durum</label>
                <select
                  className="select"
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, status: e.target.value }))
                  }
                >
                  <option value="">Tümü</option>
                  {LEAD_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
  <label className="field-label">Lead Sahibi</label>
  <select
    className="select"
    value={filters.ownerId}
    onChange={(e) =>
      setFilters((prev) => ({ ...prev, ownerId: e.target.value }))
    }
  >
    <option value="">Tümü</option>
    {users.map((user) => (
      <option key={user.id} value={user.id}>
        {user.username} {/* DOĞRUSU BU */}
      </option>
    ))}
  </select>
</div>

              <div className="field">
                <label className="field-label">Kaynak</label>
                <select
                  className="select"
                  value={filters.source}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, source: e.target.value }))
                  }
                >
                  <option value="">Tümü</option>
                  {LEAD_SOURCES.map((src) => (
                    <option key={src} value={src}>
                      {src}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label">Tarih Aralığı (Oluşturulma)</label>
                <div className="stack-row">
                  <input
                    className="input"
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, fromDate: e.target.value }))
                    }
                  />
                  <input
                    className="input"
                    type="date"
                    value={filters.toDate}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, toDate: e.target.value }))
                    }
                  />
                </div>
              </div>
                </div>

                <div className="chips-row">
              <button
                className={`chip ${!filters.status ? "chip-active" : ""}`}
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, status: "" }))}
              >
                Tümü
              </button>
              <button
                className={`chip ${
                  filters.status === "Yeni" || filters.status === "Cevapsız"
                    ? "chip-active"
                    : ""
                }`}
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    status:
                      prev.status === "Yeni" || prev.status === "Cevapsız" ? "" : "Yeni",
                  }))
                }
              >
                Sıcak (Yeni / Cevapsız)
              </button>
              
              <button
                className={`chip ${filters.status === "Satıldı" ? "chip-active" : ""}`}
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    status: prev.status === "Satıldı" ? "" : "Satıldı",
                  }))
                }
              >
                Satılanlar
              </button>
              <button
                className="chip"
                type="button"
                onClick={() =>
                  setFilters({
                    status: "",
                    ownerId: "",
                    source: "",
                    fromDate: "",
                    toDate: "",
                  })
                }
              >
            {/* Bugün Filtresi */}
<button
  className="chip"
  type="button"
  onClick={() => {
    const d = new Date().toISOString().split('T')[0];
    setFilters(prev => ({ ...prev, fromDate: d, toDate: d }));
  }}
>
  Bugün
</button>

{/* Bu Ay Filtresi */}
<button
  className={`chip ${filters.fromDate === new Date().toISOString().split('T')[0] ? "chip-active" : ""}`}
  type="button"
  onClick={() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    setFilters(prev => ({ ...prev, fromDate: firstDay, toDate: "" }));
  }}
>
  Bu Ay
</button>

{/* Son 3 Ay Filtresi */}
<button
  className={`chip ${filters.fromDate === new Date().toISOString().split('T')[0] ? "chip-active" : ""}`}
  type="button"
  onClick={() => {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split('T')[0];
    setFilters(prev => ({ ...prev, fromDate: threeMonthsAgo, toDate: "" }));
  }}
>
  Son 3 Ay
</button>


                
                Filtreleri Temizle
              </button>
                </div>

                <div className="small muted">
                  Gösterilen kayıt: {filteredLeads.length} / {totalCount}
                </div>
              </div>

              <div className="lead-table-wrapper">
                <table className="lead-table">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>İletişim</th>
                      <th>Kaynak / Sahip</th>
                      <th>Durum</th>
                      <th>Tarihçeler</th>
                      <th>Teklif</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: 16 }}>
                          {loadingData
                            ? "Kayıtlar yükleniyor..."
                            : "Henüz kayıt yok veya filtrelere uyan lead bulunamadı."}
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => {
                        const ownerName =
                          users.find((u) => u.id === lead.owner_id)?.username ?? "-";
                        const statusClass =
                          lead.status === "Satıldı"
                            ? "lead-pill-status-success"
                            : lead.status === "Vazgeçti"
                            ? "lead-pill-status-danger"
                            : "lead-pill-status-default";

                        return (
                          <tr key={lead.id}>
                            <td>
                              <div className="stack">
                                <div>{lead.name}</div>
                                <div className="small muted">
                                  Oluşturma: {formatDate(lead.created_at)}
                                </div>
                                <div className="small muted">
                                  Güncelleme: {formatDate(lead.updated_at)}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="stack">
                                <div>{lead.phone}</div>
                                <div className="small muted">{lead.language}</div>
                              </div>
                            </td>
                            <td>
                              <div className="stack">
                                <div className="small muted">{lead.source || "-"}</div>
                                <div className="small">{ownerName}</div>
                              </div>
                            </td>
                            <td>
                              <div className="stack">
                                <span className={`lead-pill ${statusClass}`}>
                                  {lead.status}
                                </span>
                                {lead.stage && (
                                  <span className="lead-pill lead-pill-status-default">
                                    {lead.stage}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="timeline">
                                {notes.filter((n) => n.lead_id === lead.id).length === 0 ? (
                                  <div className="timeline-item">
                                    <div className="timeline-text muted small">
                                      Henüz açıklama yok.
                                    </div>
                                  </div>
                                ) : (
                                  notes
                                    .filter((note) => note.lead_id === lead.id)
                                    .map((note) => (
                                      <div key={note.id} className="timeline-item">
                                        <div className="timeline-date">
                                          {formatDate(note.created_at)}
                                        </div>
                                        <div className="timeline-text">{note.text}</div>
                                      </div>
                                    ))
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="small">{lead.quote || "-"}</div>
                            </td>
                            <td>
                              <div className="stack-row">
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => editLead(lead)}
                                >
                                  Düzenle
                                </button>
                                {isAdmin && (
                                  <button
                                    className="btn btn-ghost"
                                    type="button"
                                    onClick={() => deleteLead(lead.id)}
                                  >
                                    Sil
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeView === "users" && (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Kullanıcılar</div>
                  <div className="card-subtitle">
                    Admin kullanıcılar yeni kullanıcı ekleyebilir. Satış kullanıcıları bu
                    ekrana erişemez.
                  </div>
                </div>
              </div>

              {!isAdmin ? (
                <div className="small muted">
                  Bu ekrana sadece admin profiline sahip kullanıcılar erişebilir.
                </div>
              ) : (
                <>
                  <div className="lead-table-wrapper">
                    <table className="lead-table">
                      <thead>
                        <tr>
                          <th>Kullanıcı Adı</th>
                          <th>Profil</th>
                          <th>Durum</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td>{u.username}</td>
                            <td>{u.role === "admin" ? "Admin" : "Satış"}</td>
                            <td>{u.active === false ? "Pasif" : "Aktif"}</td>
                            <td>
                              {u.id !== currentProfile.id && (
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  onClick={() => toggleUserActive(u.id, u.active)}
                                >
                                  {u.active === false ? "Aktif Et" : "Pasif Et"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </main>

      {isLeadModalOpen && (
        <div className="modal-backdrop" onClick={resetLeadForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {leadForm.id ? "Lead Güncelle" : "Yeni Lead Oluştur"}
              </div>
              <button className="btn btn-ghost" type="button" onClick={resetLeadForm}>
                Kapat
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={upsertLead}>
                <div className="form-grid">
                  <div className="field">
                    <label className="field-label">
                      İsim <span className="muted">*</span>
                    </label>
                    <input
                      className="input"
                      placeholder="Müşteri adı"
                      value={leadForm.name}
                      onChange={(e) => handleLeadFieldChange("name", e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">
                      Telefon <span className="muted">*</span>
                    </label>
                    <input
                      className="input"
                      placeholder="+90 ..."
                      value={leadForm.phone}
                      onChange={(e) => handleLeadFieldChange("phone", e.target.value)}
                      disabled={leadForm.id && !isAdmin}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">Dil</label>
                    <select
                      className="select"
                      value={leadForm.language}
                      onChange={(e) =>
                        handleLeadFieldChange("language", e.target.value)
                      }
                    >
                      <option value="">Seçiniz</option>
                      {LANGUAGES.map((lang) => (
                        <option key={lang} value={lang}>
                          {lang}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Kaynak</label>
                    <select
                      className="select"
                      value={leadForm.source}
                      onChange={(e) =>
                        handleLeadFieldChange("source", e.target.value)
                      }
                    >
                      <option value="">Seçiniz</option>
                      {LEAD_SOURCES.map((src) => (
                        <option key={src} value={src}>
                          {src}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Durum</label>
                    <select
                      className="select"
                      value={leadForm.status}
                      onChange={(e) =>
                        handleLeadFieldChange("status", e.target.value)
                      }
                    >
                      {LEAD_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Aşama</label>
                    <select
                      className="select"
                      value={leadForm.stage}
                      onChange={(e) =>
                        handleLeadFieldChange("stage", e.target.value)
                      }
                    >
                      <option value="">Seçiniz</option>
                      {LEAD_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Lead Sahibi</label>
                    <select
                      className="select"
                      value={leadForm.owner_id}
                      onChange={(e) =>
                        handleLeadFieldChange("owner_id", e.target.value)
                      }
                      
                    >
                      <option value="">Seçiniz</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.username}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Teklif</label>
                    <input
                      className="input"
                      placeholder="Teklif özeti veya tutar"
                      value={leadForm.quote}
                      onChange={(e) =>
                        handleLeadFieldChange("quote", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="field" style={{ marginTop: 10 }}>
                  <label className="field-label">Açıklama (son not)</label>
                  <textarea
                    className="textarea"
                    placeholder="Görüşme notu, itirazlar, aksiyonlar..."
                    value={leadForm.pendingNote}
                    onChange={(e) =>
                      handleLeadFieldChange("pendingNote", e.target.value)
                    }
                  />
                  <span className="field-helper">
                    Kaydettikten sonra lead altında tarihçede görebilirsiniz.
                  </span>
                </div>

                <div className="modal-footer">
                  {selectedLead && (
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={addNoteToLead}
                      disabled={!leadForm.pendingNote.trim()}
                    >
                      Yalnızca Not Ekle
                    </button>
                  )}
                  <button className="btn btn-primary" type="submit">
                    {leadForm.id ? "Lead Kaydet / Güncelle" : "Lead Oluştur"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

