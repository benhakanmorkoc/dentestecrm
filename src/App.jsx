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
  "Yanlış Başvuru",
];

const LEAD_STAGES = ["Çok Uzak", "Çok Pahalı", "Şişli Uzak", "Diğer"];

const LANGUAGES = ["TR", "EN", "DE", "FR", "AR"];

function createEmptyLead(ownerId) {
  return {
    id: null,
    name: "",
    language: "TR",
    phone: "",
    source: "Facebook Reklam",
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
  
  // Modallar
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isBulkOwnerModalOpen, setIsBulkOwnerModalOpen] = useState(false); // Toplu Devir Modalı
  
  // Yeni Kullanıcı State
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "sales" });
  const [editingUserId, setEditingUserId] = useState(null);
  
  // Toplu Seçim State'leri
  const [selectedLeadsForBulk, setSelectedLeadsForBulk] = useState([]);
  const [bulkNewOwnerId, setBulkNewOwnerId] = useState("");

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

      const created = new Date(lead.created_at);

      if (filters.fromDate) {
        const from = new Date(filters.fromDate);
        from.setHours(0, 0, 0, 0); 
        if (Number.isFinite(created.getTime()) && created < from) return false;
      }

      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setHours(23, 59, 59, 999); 
        if (Number.isFinite(created.getTime()) && created > to) return false;
      }

      return true;
    });
  }, [leads, filters]);

  // Filtre değiştiğinde toplu seçimleri temizle (güvenlik için)
  useEffect(() => {
    setSelectedLeadsForBulk([]);
  }, [filters]);

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

  function getLocalDateString(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().split("T")[0];
  }

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
      // alert("Veriler yüklenirken bir hata oluştu.");
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    async function initAuth() {
      const { data: { user } } = await supabase.auth.getUser();
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
        // alert("Kullanıcı pasif durumdadır.");
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
        // alert("Kullanıcı adı veya şifre hatalı.");
        setAuthLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, role, active")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile) {
        // alert("Profil bulunamadı.");
        await supabase.auth.signOut();
        setAuthLoading(false);
        return;
      }

      if (profile.active === false) {
        // alert("Kullanıcı pasif durumdadır.");
        await supabase.auth.signOut();
        setAuthLoading(false);
        return;
      }

      setCurrentProfile(profile);
      setActiveView("leads");
      await loadAllData();
    } catch (e) {
      console.error(e);
      // alert("Giriş yapılırken hata oluştu.");
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
    setSelectedLeadsForBulk([]);
  }

  // TELEFON NUMARASI BOŞLUK TEMİZLEME MANTIĞI BURADADIR
  function handleLeadFieldChange(field, value) {
    let finalValue = value;
    if (field === "phone") {
      // Girilen veya yapıştırılan değerdeki tüm boşlukları temizler
      finalValue = value.replace(/\s+/g, '');
    }
    setLeadForm((prev) => ({ ...prev, [field]: finalValue }));
  }

  function resetLeadForm() {
    setLeadForm(createEmptyLead(currentProfile?.id ?? ""));
    setSelectedLeadId(null);
    setIsLeadModalOpen(false);
  }

  // --- TOPLU İŞLEM FONKSİYONLARI ---
  function toggleSelectAll() {
    if (selectedLeadsForBulk.length === filteredLeads.length && filteredLeads.length > 0) {
      setSelectedLeadsForBulk([]); 
    } else {
      setSelectedLeadsForBulk(filteredLeads.map(lead => lead.id)); 
    }
  }

  function toggleSelectLead(id) {
    setSelectedLeadsForBulk(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleBulkOwnerChange(event) {
    event.preventDefault();
    if (!bulkNewOwnerId) return;
    if (selectedLeadsForBulk.length === 0) return;

    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("leads")
        .update({ owner_id: bulkNewOwnerId, updated_at: nowIso })
        .in("id", selectedLeadsForBulk);

      if (error) throw error;

      setIsBulkOwnerModalOpen(false);
      setSelectedLeadsForBulk([]);
      setBulkNewOwnerId("");
      await loadAllData(); 
    } catch (e) {
      console.error(e);
    }
  }


  // --- LEAD İŞLEMLERİ ---
  async function upsertLead(event) {
    event.preventDefault();
    if (!currentProfile) return;

    const safeName = String(leadForm.name || "").trim();
    const safePhone = String(leadForm.phone || "").trim();
    const safeNote = String(leadForm.pendingNote || "").trim();

    if (!safeName || !safePhone) return;

    const nowIso = new Date().toISOString();
    const base = {
      name: safeName,
      phone: safePhone,
      language: leadForm.language || null,
      source: leadForm.source || null,
      status: leadForm.status,
      stage: leadForm.stage || null,
      quote: String(leadForm.quote || "").trim() || null,
      owner_id: leadForm.owner_id || currentProfile.id,
      updated_at: nowIso,
    };

    try {
      let savedId = leadForm.id;

      if (leadForm.id) {
        const { error } = await supabase.from("leads").update(base).eq("id", leadForm.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("leads")
          .insert([{ ...base, created_at: nowIso }])
          .select()
          .single();
        if (error) throw error;
        savedId = data.id;
        setSelectedLeadId(data.id);
      }

      if (safeNote) {
        await addNoteToLeadInternal(safeNote, savedId);
      }

      await loadAllData();
      resetLeadForm();
    } catch (e) {
      console.error("Kayıt Hatası:", e);
    }
  }

  function editLead(lead) {
    setLeadForm({
      id: lead.id,
      name: lead.name ?? "",
      language: lead.language || "TR",
      phone: lead.phone ?? "",
      source: lead.source || "Facebook Reklam",
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
    if (!isAdmin) return;
    if (!window.confirm("Bu lead kalıcı olarak silinecek. Emin misiniz?")) return;
    try {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
      await loadAllData();
      if (selectedLeadId === id) resetLeadForm();
    } catch (e) {
      console.error(e);
    }
  }

  async function addNoteToLeadInternal(text, explicitLeadId) {
    const leadId = explicitLeadId || selectedLeadId || leadForm.id;
    if (!leadId || !currentProfile) return;
    try {
      const { error } = await supabase.from("lead_notes").insert([{ lead_id: leadId, author_id: currentProfile.id, text }]);
      if (error) throw error;
      await loadAllData();
    } catch (e) {
      console.error(e);
    }
  }

  async function addNoteToLead() {
    const safeNote = String(leadForm.pendingNote || "").trim();
    if (!safeNote) return;
    await addNoteToLeadInternal(safeNote, selectedLeadId);
    setLeadForm((prev) => ({ ...prev, pendingNote: "" }));
  }

  // --- KULLANICI (USER) İŞLEMLERİ ---
  function openEditUser(u) {
    setEditingUserId(u.id);
    setNewUser({ username: u.username, password: "", role: u.role });
    setIsUserModalOpen(true);
  }

  async function handleSaveUser(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const safeUsername = String(newUser.username || "").trim();
    const safePassword = String(newUser.password || "").trim();

    if (!safeUsername) return;

    try {
      if (editingUserId) {
        const { error } = await supabase
          .from("profiles")
          .update({ username: safeUsername, role: newUser.role })
          .eq("id", editingUserId);
        if (error) throw error;
      } else {
        if (!safePassword) return;
        const email = `${safeUsername}@local.minicrm`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password: safePassword,
        });

        if (error) throw error;

        if (data?.user) {
          const { error: profileError } = await supabase.from("profiles").upsert({
            id: data.user.id,
            username: safeUsername,
            role: newUser.role,
            active: true,
          });
          if (profileError) throw profileError;
        }
      }
      
      setIsUserModalOpen(false);
      setNewUser({ username: "", password: "", role: "sales" });
      setEditingUserId(null);
      await loadAllData();
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleUserActive(id, currentActive) {
    if (!isAdmin) return;
    try {
      const { error } = await supabase.from("profiles").update({ active: !currentActive }).eq("id", id);
      if (error) throw error;
      if (id === currentProfile.id && currentActive === true) {
        await handleLogout();
      } else {
        await loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteProfile(id) {
    if (!isAdmin) return;
    if (!window.confirm("Bu kullanıcıyı silmek istediğinize emin misiniz?")) return;

    try {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) {
        if (error.code === '23503') {
          // alert("Bu kullanıcının Lead'leri olduğu için silinemez.");
        } else {
          throw error;
        }
      } else {
        await loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function exportToCsv() {
    if (filteredLeads.length === 0) return;

    const headers = [
      "ID", "İsim", "Dil", "Telefon", "Kaynak", "Oluşturulma Tarihi",
      "Güncelleme Tarihi", "Durum", "Aşama", "Lead Sahibi", "Teklif", "Notlar"
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
        row.map((cell) => {
          const value = String(cell ?? "");
          if (/[",;\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
          return value;
        }).join(";")
      ).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading) return <div className="p-8">Yükleniyor...</div>;

  if (!currentProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded shadow w-full max-w-sm">
          <h2 className="text-2xl font-bold mb-4">CRM - DentEste</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium">Kullanıcı Adı</label>
              <input name="username" className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium">Şifre</label>
              <input name="password" type="password" className="w-full border p-2 rounded" />
            </div>
            <button className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700" type="submit">Giriş Yap</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-blue-800">CRM - DentEste</h1>
          <p className="text-xs text-gray-500">Müşteri Yönetim Sistemi</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">{currentProfile.username}</p>
          <button onClick={handleLogout} className="text-xs text-red-600 font-bold">Güvenli Çıkış</button>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-2xl font-bold">Müşteri Listesi</h2>
            <div className="flex gap-2">
              {selectedLeadsForBulk.length > 0 && (
                <button onClick={() => setIsBulkOwnerModalOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded text-sm">Devret ({selectedLeadsForBulk.length})</button>
              )}
              <button onClick={() => { setLeadForm(createEmptyLead(currentProfile.id)); setIsLeadModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">Yeni Lead</button>
              <button onClick={exportToCsv} className="bg-white border px-4 py-2 rounded text-sm">Excel İndir</button>
            </div>
          </div>

          {/* Filtreler */}
          <div className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">DURUM</label>
              <select className="w-full border p-2 rounded text-sm" value={filters.status} onChange={e => setFilters(prev => ({...prev, status: e.target.value}))}>
                <option value="">Tümü</option>
                {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">SAHİP</label>
              <select className="w-full border p-2 rounded text-sm" value={filters.ownerId} onChange={e => setFilters(prev => ({...prev, ownerId: e.target.value}))}>
                <option value="">Herkes</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">TARİH</label>
              <div className="flex gap-2">
                <input type="date" className="w-full border p-2 rounded text-sm" value={filters.fromDate} onChange={e => setFilters(prev => ({...prev, fromDate: e.target.value}))} />
                <input type="date" className="w-full border p-2 rounded text-sm" value={filters.toDate} onChange={e => setFilters(prev => ({...prev, toDate: e.target.value}))} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded shadow overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b text-xs font-bold text-gray-500">
                  <th className="p-4 w-10"><input type="checkbox" onChange={toggleSelectAll} checked={filteredLeads.length > 0 && selectedLeadsForBulk.length === filteredLeads.length} /></th>
                  <th className="p-4 uppercase">Müşteri Bilgisi</th>
                  <th className="p-4 uppercase">İletişim</th>
                  <th className="p-4 uppercase">Durum</th>
                  <th className="p-4 uppercase">Sorumlu</th>
                  <th className="p-4 uppercase">İşlem</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {filteredLeads.length === 0 ? (
                  <tr><td colSpan="6" className="p-8 text-center text-gray-400">Kayıt bulunamadı.</td></tr>
                ) : (
                  filteredLeads.map(lead => (
                    <tr key={lead.id} className={selectedLeadsForBulk.includes(lead.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                      <td className="p-4"><input type="checkbox" checked={selectedLeadsForBulk.includes(lead.id)} onChange={() => toggleSelectLead(lead.id)} /></td>
                      <td className="p-4">
                        <div className="font-bold">{lead.name}</div>
                        <div className="text-[10px] text-gray-400">{formatDate(lead.created_at)}</div>
                      </td>
                      <td className="p-4">
                        <div>{lead.phone}</div>
                        <div className="text-[10px] text-gray-400">{lead.language} • {lead.source}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${lead.status === 'Satış' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{lead.status}</span>
                      </td>
                      <td className="p-4 text-gray-600">{users.find(u => u.id === lead.owner_id)?.username || '-'}</td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button onClick={() => editLead(lead)} className="text-blue-600 hover:underline">Düzenle</button>
                          {isAdmin && <button onClick={() => deleteLead(lead.id)} className="text-red-600 hover:underline">Sil</button>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Lead Modal */}
      {isLeadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 font-bold">
              <h3>{leadForm.id ? 'Lead Güncelle' : 'Yeni Lead'}</h3>
              <button onClick={() => setIsLeadModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={upsertLead} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold mb-1">MÜŞTERİ ADI *</label>
                <input required className="w-full border p-2 rounded text-sm" value={leadForm.name} onChange={e => handleLeadFieldChange("name", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">TELEFON *</label>
                <input required className="w-full border p-2 rounded text-sm" placeholder="Boşluksuz giriniz" value={leadForm.phone} onChange={e => handleLeadFieldChange("phone", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">DİL</label>
                <select className="w-full border p-2 rounded text-sm" value={leadForm.language} onChange={e => handleLeadFieldChange("language", e.target.value)}>
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">DURUM</label>
                <select className="w-full border p-2 rounded text-sm" value={leadForm.status} onChange={e => handleLeadFieldChange("status", e.target.value)}>
                  {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">KAYNAK</label>
                <select className="w-full border p-2 rounded text-sm" value={leadForm.source} onChange={e => handleLeadFieldChange("source", e.target.value)}>
                  {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold mb-1">AÇIKLAMA</label>
                <textarea className="w-full border p-2 rounded text-sm h-24" value={leadForm.pendingNote} onChange={e => handleLeadFieldChange("pendingNote", e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={() => setIsLeadModalOpen(false)} className="px-4 py-2 border rounded text-sm">İptal</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold">Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Devir Modalı */}
      {isBulkOwnerModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-lg mb-4">Sorumlu Değiştir</h3>
            <p className="text-sm text-gray-500 mb-6">{selectedLeadsForBulk.length} adet kaydı kime devretmek istersiniz?</p>
            <select className="w-full border p-2 rounded text-sm mb-6" value={bulkNewOwnerId} onChange={e => setBulkNewOwnerId(e.target.value)}>
              <option value="">Seçiniz...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setIsBulkOwnerModalOpen(false)} className="flex-1 py-2 border rounded text-sm">Vazgeç</button>
              <button onClick={handleBulkOwnerChange} className="flex-1 py-2 bg-blue-600 text-white rounded text-sm font-bold">Onayla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
