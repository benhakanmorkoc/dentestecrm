import React, { useEffect, useMemo, useState } from "react";

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

// --- MOCK (SAHTE) VERİLER - Supabase yerine Canvas'ta test edebilmek için ---
const INITIAL_USERS = [
  { id: "admin-id", username: "admin", role: "admin", active: true },
  { id: "satis-id", username: "Satis1", role: "sales", active: true }
];

const INITIAL_LEADS = [
  { id: "lead-1", name: "Ahmet Yılmaz", language: "TR", phone: "05551234567", source: "Facebook Reklam", status: "Yeni", stage: "", owner_id: "satis-id", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), quote: "" },
  { id: "lead-2", name: "John Doe", language: "EN", phone: "+44 123 456 789", source: "Direk Arama", status: "Sıcak", stage: "Şişli Uzak", owner_id: "admin-id", created_at: new Date(Date.now() - 86400000).toISOString(), updated_at: new Date().toISOString(), quote: "1500$" },
  { id: "lead-3", name: "Ayşe Kaya", language: "TR", phone: "05329876543", source: "Referans", status: "Satış", stage: "", owner_id: "admin-id", created_at: new Date(Date.now() - 172800000).toISOString(), updated_at: new Date().toISOString(), quote: "₺20.000" }
];

const INITIAL_NOTES = [
  { id: "note-1", lead_id: "lead-2", author_id: "admin-id", text: "Müşteri İngiltere'den aradı, fiyat teklifi gönderildi.", created_at: new Date().toISOString() }
];

export default function App() {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Veritabanı State'leri (Supabase yerine yerel state kullanıyoruz)
  const [users, setUsers] = useState(INITIAL_USERS);
  const [leads, setLeads] = useState(INITIAL_LEADS);
  const [notes, setNotes] = useState(INITIAL_NOTES);

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
  const [isBulkOwnerModalOpen, setIsBulkOwnerModalOpen] = useState(false);
  
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
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Yeniden eskiye sırala
  }, [leads, filters]);

  // Filtre değiştiğinde toplu seçimleri temizle
  useEffect(() => {
    setSelectedLeadsForBulk([]);
  }, [filters]);

  const totalCount = leads.length;

  const countByStatus = useMemo(() => {
    const result = {};
    for (const s of LEAD_STATUSES) result[s] = 0;
    // "Satıldı" custom statüsünü de saymak için ekliyoruz, orijinal dizinde "Satış" var.
    result["Satıldı"] = 0; 
    result["Teklif Verildi"] = 0;

    for (const lead of leads) {
      if (result[lead.status] == null) result[lead.status] = 0;
      result[lead.status] += 1;
      
      if(lead.status === "Satış") result["Satıldı"] += 1; // Başlık "Satıldı" olduğu için mapping yaptık
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

  // Canvas versiyonunda veriler zaten state'te olduğu için simüle ediyoruz
  async function loadAllData() {
    setLoadingData(true);
    setTimeout(() => {
      setLoadingData(false);
    }, 300);
  }

  useEffect(() => {
    // Uygulama açılış simülasyonu
    setTimeout(() => {
      setAuthLoading(false);
    }, 800);
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    const username = event.target.username.value.trim();
    // const password = event.target.password.value; // Mock testte şifre sormuyoruz
    if (!username) return;

    setAuthLoading(true);
    setTimeout(async () => {
      try {
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (!user) {
          alert("Kullanıcı adı bulunamadı. (Test için 'admin' yazabilirsiniz)");
          setAuthLoading(false);
          return;
        }

        if (user.active === false) {
          alert("Kullanıcı pasif durumdadır.");
          setAuthLoading(false);
          return;
        }

        setCurrentProfile(user);
        setActiveView("leads");
        await loadAllData();
      } catch (e) {
        console.error(e);
      } finally {
        setAuthLoading(false);
      }
    }, 600);
  }

  async function handleLogout() {
    setCurrentProfile(null);
    setSelectedLeadId(null);
    setSelectedLeadsForBulk([]);
  }

  function handleLeadFieldChange(field, value) {
    let processedValue = value;
    // Eğer güncellenen alan telefonsa, tüm boşlukları temizle
    if (field === "phone") {
      processedValue = processedValue.replace(/\s+/g, "");
    }
    setLeadForm((prev) => ({ ...prev, [field]: processedValue }));
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
    if (!bulkNewOwnerId) {
      alert("Lütfen devredilecek yeni kullanıcıyı seçin.");
      return;
    }
    if (selectedLeadsForBulk.length === 0) return;

    try {
      const nowIso = new Date().toISOString();
      
      // Mock veritabanı güncelleme
      setLeads(prevLeads => prevLeads.map(lead => {
        if (selectedLeadsForBulk.includes(lead.id)) {
          return { ...lead, owner_id: bulkNewOwnerId, updated_at: nowIso };
        }
        return lead;
      }));

      alert(`${selectedLeadsForBulk.length} kaydın sahibi başarıyla güncellendi.`);
      setIsBulkOwnerModalOpen(false);
      setSelectedLeadsForBulk([]); 
      setBulkNewOwnerId("");
    } catch (e) {
      console.error(e);
      alert("Toplu devir işlemi sırasında bir hata oluştu.");
    }
  }


  // --- LEAD İŞLEMLERİ ---
  async function upsertLead(event) {
    event.preventDefault();
    if (!currentProfile) return;

    const safeName = String(leadForm.name || "").trim();
    const safePhone = String(leadForm.phone || "").trim();
    const safeNote = String(leadForm.pendingNote || "").trim();

    if (!safeName || !safePhone) {
      alert("İsim ve Telefon zorunludur.");
      return;
    }

    // Telefon benzersizlik kontrolü mock
    const isPhoneExists = leads.some(l => l.phone === safePhone && l.id !== leadForm.id);
    if(isPhoneExists) {
        alert("Girilen telefon numarası sistemde zaten mevcut. Lütfen farklı bir numara giriniz.");
        return;
    }

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
        // Mock Güncelleme
        setLeads(prev => prev.map(l => l.id === leadForm.id ? { ...l, ...base } : l));
      } else {
        // Mock Ekleme
        savedId = `lead-${Date.now()}`;
        const newLead = { ...base, id: savedId, created_at: nowIso };
        setLeads(prev => [newLead, ...prev]);
        setSelectedLeadId(savedId);
      }

      if (safeNote) {
        await addNoteToLeadInternal(safeNote, savedId);
      }

      resetLeadForm();
    } catch (e) {
      console.error("Kayıt Hatası:", e);
      alert("Lead kaydedilirken bir hata oluştu: " + (e?.message || "Bilinmeyen hata."));
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
      setLeads(prev => prev.filter(l => l.id !== id));
      setNotes(prev => prev.filter(n => n.lead_id !== id)); // İlişkili notları sil
      if (selectedLeadId === id) resetLeadForm();
    } catch (e) {
      console.error(e);
      alert("Lead silinirken bir hata oluştu.");
    }
  }

  async function addNoteToLeadInternal(text, explicitLeadId) {
    const leadId = explicitLeadId || selectedLeadId || leadForm.id;
    if (!leadId || !currentProfile) return;
    try {
      const newNote = {
          id: `note-${Date.now()}`,
          lead_id: leadId,
          author_id: currentProfile.id,
          text: text,
          created_at: new Date().toISOString()
      };
      setNotes(prev => [newNote, ...prev]);
    } catch (e) {
      console.error(e);
      alert("Not eklenirken hata oluştu.");
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

    if (!safeUsername) {
      alert("Kullanıcı adı zorunludur.");
      return;
    }

    try {
      if (editingUserId) {
        setUsers(prev => prev.map(u => u.id === editingUserId ? { ...u, username: safeUsername, role: newUser.role } : u));
        alert("Kullanıcı bilgileri güncellendi.");
      } else {
        if (!safePassword) {
          alert("Yeni kullanıcı için şifre zorunludur.");
          return;
        }
        
        const isExists = users.some(u => u.username === safeUsername);
        if(isExists) {
            alert("Bu kullanıcı adı zaten mevcut.");
            return;
        }

        const newCreatedUser = {
            id: `user-${Date.now()}`,
            username: safeUsername,
            role: newUser.role,
            active: true
        };
        setUsers(prev => [...prev, newCreatedUser]);
        alert("Kullanıcı başarıyla oluşturuldu.");
      }
      
      setIsUserModalOpen(false);
      setNewUser({ username: "", password: "", role: "sales" });
      setEditingUserId(null);
    } catch (e) {
      console.error(e);
      alert("Kullanıcı kaydedilirken hata oluştu. " + (e?.message || ""));
    }
  }

  async function toggleUserActive(id, currentActive) {
    if (!isAdmin) return;
    try {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, active: !currentActive } : u));
      if (id === currentProfile.id && currentActive === true) {
        await handleLogout();
      }
    } catch (e) {
      console.error(e);
      alert("Kullanıcı durumu güncellenirken hata oluştu.");
    }
  }

  async function deleteProfile(id) {
    if (!isAdmin) return;
    if (!window.confirm("Bu kullanıcıyı silmek istediğinize emin misiniz?\n\nDİKKAT: Kullanıcıya ait 'Lead'ler varsa sistem silmenize izin vermeyecektir.")) return;

    try {
      const hasLeads = leads.some(l => l.owner_id === id);
      if(hasLeads) {
        alert("Bu kullanıcının sistemde üzerine kayıtlı Lead'leri olduğu için silinemez. Lütfen önce Lead'leri devredin veya kullanıcıyı 'Pasif Et' seçeneği ile dondurun.");
        return;
      }

      setUsers(prev => prev.filter(u => u.id !== id));
      alert("Kullanıcı başarıyla silindi.");
    } catch (e) {
      console.error(e);
      alert("Kullanıcı silinirken bir hata oluştu.");
    }
  }

  function exportToCsv() {
    if (filteredLeads.length === 0) {
      alert("Dışa aktarılacak kayıt bulunamadı.");
      return;
    }

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
    const datePart = new Date().toISOString().slice(0, 10);
    a.download = `leads_${datePart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- TASARIM İÇİN CSS EKLENTİSİ ---
  // Uygulamanın düzgün görünmesi için Canvas ortamına CSS basıyoruz.
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      :root {
        --primary: #4f46e5;
        --primary-hover: #4338ca;
        --bg-color: #f3f4f6;
        --surface: #ffffff;
        --text-main: #111827;
        --text-muted: #6b7280;
        --border-color: #e5e7eb;
        --danger: #dc2626;
        --success: #16a34a;
      }
      body {
        margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background-color: var(--bg-color); color: var(--text-main);
      }
      .app-shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
      .app-header { background: var(--surface); border-bottom: 1px solid var(--border-color); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05); z-index: 10;}
      .app-header-title { font-size: 1.25rem; font-weight: 600; color: var(--primary); margin-bottom: 4px; }
      .app-header-subtitle { font-size: 0.875rem; color: var(--text-muted); }
      .app-main { display: flex; flex: 1; overflow: hidden; }
      .sidebar { width: 70px; background: var(--surface); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: center; padding: 20px 0; gap: 16px; z-index: 5; }
      .sidebar-title { font-size: 0.75rem; font-weight: bold; color: var(--text-muted); margin-bottom: 10px; letter-spacing: 1px; }
      .nav-button { background: transparent; border: none; width: 44px; height: 44px; border-radius: 8px; font-size: 1.25rem; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-muted); transition: all 0.2s; }
      .nav-button:hover { background: var(--bg-color); color: var(--primary); }
      .nav-button-active { background: #e0e7ff; color: var(--primary); }
      .nav-button-logout { margin-top: auto; color: var(--danger); }
      .nav-button-logout:hover { background: #fee2e2; color: var(--danger); }
      
      .content { flex: 1; overflow-y: auto; padding: 24px; }
      .card { background: var(--surface); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 24px; margin-bottom: 24px; }
      .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
      .card-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 4px; }
      .card-subtitle { font-size: 0.875rem; color: var(--text-muted); }
      
      .stack { display: flex; flex-direction: column; gap: 16px; }
      .stack-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .filters-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
      .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
      
      .field { display: flex; flex-direction: column; gap: 6px; }
      .field-label { font-size: 0.875rem; font-weight: 500; color: var(--text-main); }
      .field-helper { font-size: 0.75rem; color: var(--text-muted); }
      .input, .select, .textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.875rem; background: #fff; color: var(--text-main); outline: none; transition: border-color 0.2s; box-sizing: border-box; }
      .input:focus, .select:focus, .textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
      .textarea { min-height: 80px; resize: vertical; }
      
      .btn { padding: 10px 16px; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; border: 1px solid transparent; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; }
      .btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .btn-primary { background: var(--primary); color: white; border-color: var(--primary); }
      .btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
      .btn-ghost { background: transparent; border-color: var(--border-color); color: var(--text-main); }
      .btn-ghost:hover:not(:disabled) { background: var(--bg-color); }
      
      .badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; background: #e0e7ff; color: var(--primary); }
      
      .chips-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; margin-bottom: 8px; }
      .chip { padding: 6px 12px; border-radius: 9999px; border: 1px solid var(--border-color); background: var(--surface); font-size: 0.75rem; cursor: pointer; color: var(--text-main); transition: all 0.2s; }
      .chip:hover { background: var(--bg-color); }
      .chip-active { background: var(--primary); color: white; border-color: var(--primary); }
      .chip-active:hover { background: var(--primary-hover); }
      
      .lead-table-wrapper { width: 100%; overflow-x: auto; margin-top: 16px; border: 1px solid var(--border-color); border-radius: 8px; }
      .lead-table { width: 100%; border-collapse: collapse; min-width: 800px; }
      .lead-table th { background: #f9fafb; padding: 12px 16px; text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border-color); }
      .lead-table td { padding: 16px; border-bottom: 1px solid var(--border-color); font-size: 0.875rem; vertical-align: top; }
      .lead-table tr:last-child td { border-bottom: none; }
      .lead-table tr:hover { background: #f9fafb; }
      
      .lead-pill { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 500; }
      .lead-pill-status-default { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
      .lead-pill-status-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
      .lead-pill-status-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
      
      .timeline { display: flex; flex-direction: column; gap: 8px; max-height: 120px; overflow-y: auto; padding-right: 8px; }
      .timeline-item { border-left: 2px solid var(--border-color); padding-left: 10px; position: relative; }
      .timeline-item::before { content: ''; position: absolute; left: -5px; top: 4px; width: 8px; height: 8px; border-radius: 50%; background: var(--border-color); }
      .timeline-date { font-size: 0.7rem; color: var(--text-muted); margin-bottom: 2px; }
      .timeline-text { font-size: 0.8rem; line-height: 1.4; }
      
      .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; backdrop-filter: blur(2px); }
      .modal { background: var(--surface); border-radius: 12px; width: 100%; max-width: 600px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
      .modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
      .modal-title { font-size: 1.25rem; font-weight: 600; }
      .modal-body { padding: 24px; overflow-y: auto; flex: 1; }
      .modal-footer { padding: 16px 24px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; background: #f9fafb; border-radius: 0 0 12px 12px; }
      
      .login-shell { display: flex; align-items: center; justify-content: center; height: 100vh; background: #e0e7ff; }
      .login-card { background: var(--surface); padding: 40px; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
      .login-title { font-size: 1.5rem; font-weight: bold; color: var(--primary); margin-bottom: 8px; }
      .login-subtitle { font-size: 0.875rem; color: var(--text-muted); margin-bottom: 32px; }
      .login-card .field { text-align: left; }
      .login-card .button-row { margin-top: 24px; }
      .login-card .btn { width: 100%; }
      
      .small { font-size: 0.875rem; }
      .muted { color: var(--text-muted); }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  if (authLoading) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-title">CRM - DentEste</div>
          <div className="login-subtitle">Yükleniyor... Lütfen bekleyin.</div>
        </div>
      </div>
    );
  }

  if (!currentProfile) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-title">CRM - DentEste</div>
          <div className="login-subtitle">Test için kullanıcı adı: <strong>admin</strong><br/>(Şifre alanına rastgele bir şey yazabilirsiniz)</div>
          <form onSubmit={handleLogin} className="stack">
            <div className="field">
              <label className="field-label">Kullanıcı Adı</label>
              <input name="username" className="input" placeholder="admin" autoComplete="username" defaultValue="admin" required />
            </div>
            <div className="field">
              <label className="field-label">Şifre</label>
              <input name="password" type="password" className="input" placeholder="****" autoComplete="current-password" />
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
        <div className="stack" style={{ alignItems: "flex-end", gap: '8px' }}>
          <div className="stack-row">
            <span className="badge">Toplam Lead: {totalCount}</span>
            <span className="badge">Yeni: {countByStatus["Yeni"] ?? 0}</span>
            <span className="badge">Sıcak: {countByStatus["Sıcak"] ?? 0}</span>
            <span className="badge" style={{background: '#dcfce7', color: '#166534'}}>Satıldı: {countByStatus["Satıldı"] ?? 0}</span>
          </div>
          <div className="small muted" style={{ fontWeight: 500 }}>
            👤 Oturum: {currentProfile.username} ({currentProfile.role === "admin" ? "Admin" : "Satış"})
          </div>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <div className="sidebar-title">MENÜ</div>
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
            style={{ opacity: !isAdmin ? 0.3 : 1 }}
            title={isAdmin ? "Kullanıcı Tanımları" : "Sadece admin görebilir"}
          >
            <span>👥</span>
          </button>
          <button className="nav-button nav-button-logout" type="button" onClick={handleLogout} title="Sistemden Çıkış">
            <span>⏻</span>
          </button>
        </aside>

        <div className="content">
          {activeView === "leads" && (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Lead Listesi ve Filtreler</div>
                  <div className="card-subtitle">Oluşturulma tarihi, durum, kaynak ve lead sahibi ile filtreleyin.</div>
                </div>
                <div className="stack-row">
                  {/* TOPLU DEVİR BUTONU: Sadece 1 veya daha fazla kayıt seçiliyse görünür */}
                  {selectedLeadsForBulk.length > 0 && (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => setIsBulkOwnerModalOpen(true)}
                    >
                      Seçilileri Devret ({selectedLeadsForBulk.length})
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      const satis1User = users.find((u) => u.username === "Satis1");
                      const defaultOwnerId = satis1User ? satis1User.id : currentProfile.id;
                      setLeadForm(createEmptyLead(defaultOwnerId));
                      setSelectedLeadId(null);
                      setIsLeadModalOpen(true);
                    }}
                  >
                    + Yeni Lead Ekle
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={exportToCsv}>
                    📥 Excel (CSV)
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
                      onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="">Tümü</option>
                      {LEAD_STATUSES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Lead Sahibi</label>
                    <select
                      className="select"
                      value={filters.ownerId}
                      onChange={(e) => setFilters((prev) => ({ ...prev, ownerId: e.target.value }))}
                    >
                      <option value="">Tümü</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.username}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Kaynak</label>
                    <select
                      className="select"
                      value={filters.source}
                      onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}
                    >
                      <option value="">Tümü</option>
                      {LEAD_SOURCES.map((src) => (
                        <option key={src} value={src}>{src}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Oluşturulma Tarihi Aralığı</label>
                    <div className="stack-row">
                      <input
                        className="input"
                        type="date"
                        value={filters.fromDate}
                        onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
                        title="Başlangıç Tarihi"
                      />
                      <span className="muted">-</span>
                      <input
                        className="input"
                        type="date"
                        value={filters.toDate}
                        onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
                        title="Bitiş Tarihi"
                      />
                    </div>
                  </div>
                </div>

                <div className="chips-row">
                  <button
                    className={`chip ${!filters.status && !filters.fromDate ? "chip-active" : ""}`}
                    type="button"
                    onClick={() => setFilters({ status: "", ownerId: "", source: "", fromDate: "", toDate: "" })}
                  >
                    Tümü
                  </button>

                  <button
                    className="chip"
                    type="button"
                    onClick={() => {
                      const d = getLocalDateString(new Date());
                      setFilters(prev => ({ ...prev, fromDate: d, toDate: d }));
                    }}
                  >
                    Bugün
                  </button>

                  <button
                    className="chip"
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const firstDay = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
                      setFilters(prev => ({ ...prev, fromDate: firstDay, toDate: "" }));
                    }}
                  >
                    Bu Ay
                  </button>

                  <button
                    className="chip"
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const threeMonthsAgo = getLocalDateString(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()));
                      setFilters(prev => ({ ...prev, fromDate: threeMonthsAgo, toDate: "" }));
                    }}
                  >
                    Son 3 Ay
                  </button>

                  <button
                    className={`chip ${filters.status === "Sıcak" ? "chip-active" : ""}`}
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        status: prev.status === "Sıcak" ? "" : "Sıcak",
                      }))
                    }
                  >
                    🔥 Sıcak
                  </button>

                  <button
                    className={`chip ${filters.status === "Satış" ? "chip-active" : ""}`}
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        status: prev.status === "Satış" ? "" : "Satış",
                      }))
                    }
                  >
                    💰 Satılanlar
                  </button>

                  <button
                    className="chip"
                    type="button"
                    style={{ marginLeft: 'auto', border: 'none', textDecoration: 'underline' }}
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
                    Filtreleri Temizle
                  </button>
                </div>

                <div className="small muted">Gösterilen kayıt: <strong>{filteredLeads.length}</strong> / {totalCount}</div>
              </div>

              <div className="lead-table-wrapper">
                <table className="lead-table">
                  <thead>
                    <tr>
                      {/* TOPLU SEÇİM BAŞLIĞI */}
                      <th style={{ width: 40, textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          style={{ cursor: "pointer", width: 16, height: 16 }}
                          title="Filtrelenen Tümünü Seç/Bırak"
                          checked={filteredLeads.length > 0 && selectedLeadsForBulk.length === filteredLeads.length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>Lead</th>
                      <th>İletişim</th>
                      <th>Kaynak / Sahip</th>
                      <th>Durum</th>
                      <th style={{ width: '25%' }}>Tarihçeler</th>
                      <th>Teklif</th>
                      <th style={{ textAlign: 'right' }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                          {loadingData ? "Kayıtlar yükleniyor..." : "Henüz kayıt yok veya filtrelere uyan lead bulunamadı."}
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => {
                        const ownerName = users.find((u) => u.id === lead.owner_id)?.username ?? "-";
                        const statusClass =
                          lead.status === "Satış"
                            ? "lead-pill-status-success"
                            : lead.status === "Vazgeçti" || lead.status === "İptal" || lead.status === "Yanlış Başvuru"
                            ? "lead-pill-status-danger"
                            : "lead-pill-status-default";

                        return (
                          <tr key={lead.id} style={{ backgroundColor: selectedLeadsForBulk.includes(lead.id) ? "#eef2ff" : "" }}>
                            {/* TEKİL SEÇİM KUTUCUĞU */}
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="checkbox"
                                style={{ cursor: "pointer", width: 16, height: 16 }}
                                checked={selectedLeadsForBulk.includes(lead.id)}
                                onChange={() => toggleSelectLead(lead.id)}
                              />
                            </td>
                            <td>
                              <div className="stack" style={{ gap: '4px' }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{lead.name}</div>
                                <div className="small muted">Oluşturma: {formatDate(lead.created_at)}</div>
                                <div className="small muted">Güncelleme: {formatDate(lead.updated_at)}</div>
                              </div>
                            </td>
                            <td>
                              <div className="stack" style={{ gap: '4px' }}>
                                <div>{lead.phone}</div>
                                <div className="badge" style={{ display: 'inline-block', width: 'fit-content' }}>{lead.language}</div>
                              </div>
                            </td>
                            <td>
                              <div className="stack" style={{ gap: '4px' }}>
                                <div className="small muted">{lead.source || "-"}</div>
                                <div style={{ fontWeight: 500 }}>{ownerName}</div>
                              </div>
                            </td>
                            <td>
                              <div className="stack" style={{ gap: '6px' }}>
                                <span className={`lead-pill ${statusClass}`}>{lead.status}</span>
                                {lead.stage && <span className="lead-pill lead-pill-status-default">{lead.stage}</span>}
                              </div>
                            </td>
                            <td>
                              <div className="timeline">
                                {notes.filter((n) => n.lead_id === lead.id).length === 0 ? (
                                  <div className="timeline-item">
                                    <div className="timeline-text muted small">Henüz açıklama yok.</div>
                                  </div>
                                ) : (
                                  notes
                                    .filter((note) => note.lead_id === lead.id)
                                    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at)) // Notları yeniden eskiye sırala
                                    .map((note) => (
                                      <div key={note.id} className="timeline-item">
                                        <div className="timeline-date">{formatDate(note.created_at)}</div>
                                        <div className="timeline-text">{note.text}</div>
                                      </div>
                                    ))
                                )}
                              </div>
                            </td>
                            <td><div style={{ fontWeight: 600 }}>{lead.quote || "-"}</div></td>
                            <td>
                              <div className="stack-row" style={{ justifyContent: 'flex-end', gap: '4px' }}>
                                <button className="btn btn-ghost" style={{ padding: '6px 10px' }} type="button" onClick={() => editLead(lead)}>Düzenle</button>
                                {isAdmin && (
                                  <button className="btn btn-ghost" style={{ padding: '6px 10px', color: 'var(--danger)' }} type="button" onClick={() => deleteLead(lead.id)}>Sil</button>
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
                  <div className="card-title">Kullanıcı Yönetimi</div>
                  <div className="card-subtitle">Admin kullanıcılar sisteme yeni kullanıcı ekleyebilir ve yönetebilir.</div>
                </div>
                {isAdmin && (
                  <button 
                    className="btn btn-primary" 
                    type="button" 
                    onClick={() => {
                      setEditingUserId(null);
                      setNewUser({ username: "", password: "", role: "sales" });
                      setIsUserModalOpen(true);
                    }}
                  >
                    + Yeni Kullanıcı Ekle
                  </button>
                )}
              </div>

              {!isAdmin ? (
                <div className="small muted" style={{ padding: '20px', textAlign: 'center', background: 'var(--bg-color)', borderRadius: '8px' }}>
                  Bu ekrana sadece admin profiline sahip kullanıcılar erişebilir.
                </div>
              ) : (
                <div className="lead-table-wrapper">
                  <table className="lead-table">
                    <thead>
                      <tr><th>Kullanıcı Adı</th><th>Profil</th><th>Durum</th><th style={{ textAlign: 'right' }}>İşlemler</th></tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 500 }}>{u.username}</td>
                          <td>
                            <span className="badge" style={{ background: u.role === 'admin' ? '#fee2e2' : '#e0e7ff', color: u.role === 'admin' ? '#991b1b' : '#3730a3' }}>
                              {u.role === "admin" ? "Admin" : "Satış"}
                            </span>
                          </td>
                          <td>
                            <span className="lead-pill" style={{ background: u.active === false ? '#f3f4f6' : '#dcfce7', color: u.active === false ? '#6b7280' : '#166534' }}>
                              {u.active === false ? "Pasif" : "Aktif"}
                            </span>
                          </td>
                          <td>
                            {u.id !== currentProfile.id && (
                              <div className="stack-row" style={{ justifyContent: 'flex-end', gap: '4px' }}>
                                <button className="btn btn-ghost" type="button" onClick={() => openEditUser(u)}>
                                  Güncelle
                                </button>
                                <button className="btn btn-ghost" type="button" onClick={() => toggleUserActive(u.id, u.active)}>
                                  {u.active === false ? "Aktif Et" : "Pasif Et"}
                                </button>
                                <button className="btn btn-ghost" style={{ color: "var(--danger)" }} type="button" onClick={() => deleteProfile(u.id)}>
                                  Sil
                                </button>
                              </div>
                            )}
                            {u.id === currentProfile.id && (
                               <div className="muted small" style={{ textAlign: 'right', paddingRight: '16px' }}>Kendi Profiliniz</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* TOPLU DEVİR MODALI */}
      {isBulkOwnerModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsBulkOwnerModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Toplu Sahip Değiştirme</div>
              <button className="btn btn-ghost" style={{ padding: '6px' }} type="button" onClick={() => setIsBulkOwnerModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleBulkOwnerChange} id="bulk-form">
                <div className="stack">
                  <div className="small muted" style={{ background: '#eef2ff', padding: '12px', borderRadius: '6px', color: '#4f46e5' }}>
                    Seçili <strong>{selectedLeadsForBulk.length}</strong> adet kaydın sorumlusunu değiştirmek üzeresiniz.
                  </div>
                  <div className="field">
                    <label className="field-label">Yeni Lead Sahibi <span className="muted">*</span></label>
                    <select
                      className="select"
                      value={bulkNewOwnerId}
                      onChange={(e) => setBulkNewOwnerId(e.target.value)}
                      required
                    >
                      <option value="">Lütfen Bir Sahip Seçiniz</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.username} ({user.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </form>
            </div>
            <div className="modal-footer">
               <button className="btn btn-ghost" type="button" onClick={() => setIsBulkOwnerModalOpen(false)}>İptal</button>
               <button className="btn btn-primary" type="submit" form="bulk-form">Devret</button>
            </div>
          </div>
        </div>
      )}

      {/* YENİ KULLANICI EKLEME / GÜNCELLEME MODALI */}
      {isUserModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsUserModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editingUserId ? "Kullanıcıyı Güncelle" : "Yeni Kullanıcı Oluştur"}</div>
              <button className="btn btn-ghost" style={{ padding: '6px' }} type="button" onClick={() => setIsUserModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSaveUser} id="user-form">
                <div className="stack">
                  <div className="field">
                    <label className="field-label">Kullanıcı Adı <span className="muted">*</span></label>
                    <input 
                      className="input" 
                      placeholder="Örn: ahmet" 
                      value={newUser.username} 
                      onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))} 
                      required
                    />
                    <span className="field-helper">Giriş yaparken bu ismi kullanacaktır.</span>
                  </div>
                  
                  {!editingUserId && (
                    <div className="field">
                      <label className="field-label">Şifre <span className="muted">*</span></label>
                      <input 
                        className="input" 
                        type="password"
                        placeholder="En az 6 karakter" 
                        value={newUser.password} 
                        onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))} 
                        required={!editingUserId}
                      />
                    </div>
                  )}

                  {editingUserId && (
                    <div className="small muted" style={{ background: '#fffbeb', padding: '12px', borderRadius: '6px', color: '#b45309' }}>
                      * Şifre güvenliği veritabanında saklanır. Buradan sadece Kullanıcı Adı ve Rol güncelleyebilirsiniz.
                    </div>
                  )}

                  <div className="field">
                    <label className="field-label">Rol</label>
                    <select 
                      className="select" 
                      value={newUser.role} 
                      onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                    >
                      <option value="sales">Satış</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              </form>
            </div>
            <div className="modal-footer">
               <button className="btn btn-ghost" type="button" onClick={() => setIsUserModalOpen(false)}>İptal</button>
               <button className="btn btn-primary" type="submit" form="user-form">
                 {editingUserId ? "Değişiklikleri Kaydet" : "Kullanıcıyı Oluştur"}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* LEAD EKLEME / GÜNCELLEME MODALI */}
      {isLeadModalOpen && (
        <div className="modal-backdrop" onClick={resetLeadForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <div className="modal-title">{leadForm.id ? "Lead Güncelle" : "Yeni Lead Oluştur"}</div>
              <button className="btn btn-ghost" style={{ padding: '6px' }} type="button" onClick={resetLeadForm}>✕</button>
            </div>
            <div className="modal-body">
              <form onSubmit={upsertLead} id="lead-form">
                <div className="form-grid">
                  <div className="field">
                    <label className="field-label">İsim <span className="muted">*</span></label>
                    <input className="input" placeholder="Müşteri adı" value={leadForm.name} onChange={(e) => handleLeadFieldChange("name", e.target.value)} required />
                  </div>

                  <div className="field">
                    <label className="field-label">Telefon <span className="muted">*</span></label>
                    <input className="input" placeholder="0555..." value={leadForm.phone} onChange={(e) => handleLeadFieldChange("phone", e.target.value)} required />
                  </div>

                  <div className="field">
                    <label className="field-label">Dil</label>
                    <select className="select" value={leadForm.language} onChange={(e) => handleLeadFieldChange("language", e.target.value)}>
                      <option value="">Seçiniz</option>
                      {LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Kaynak</label>
                    <select className="select" value={leadForm.source} onChange={(e) => handleLeadFieldChange("source", e.target.value)}>
                      <option value="">Seçiniz</option>
                      {LEAD_SOURCES.map((src) => <option key={src} value={src}>{src}</option>)}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Durum</label>
                    <select className="select" value={leadForm.status} onChange={(e) => handleLeadFieldChange("status", e.target.value)}>
                      {LEAD_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Aşama</label>
                    <select className="select" value={leadForm.stage} onChange={(e) => handleLeadFieldChange("stage", e.target.value)}>
                      <option value="">Seçiniz</option>
                      {LEAD_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Lead Sahibi</label>
                    <select className="select" value={leadForm.owner_id} onChange={(e) => handleLeadFieldChange("owner_id", e.target.value)}>
                      <option value="">Seçiniz</option>
                      {users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label">Teklif</label>
                    <input className="input" placeholder="Teklif özeti veya tutar" value={leadForm.quote} onChange={(e) => handleLeadFieldChange("quote", e.target.value)} />
                  </div>
                </div>

                <div className="field" style={{ marginTop: 24 }}>
                  <label className="field-label">Açıklama (son not)</label>
                  <textarea
                    className="textarea"
                    placeholder="Görüşme notu, itirazlar, aksiyonlar..."
                    value={leadForm.pendingNote}
                    onChange={(e) => handleLeadFieldChange("pendingNote", e.target.value)}
                  />
                  <span className="field-helper">Kaydettikten sonra lead altında tarihçede görebilirsiniz. Yalnızca not eklemek için sağ alttaki butonu kullanabilirsiniz.</span>
                </div>
              </form>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-ghost" type="button" onClick={resetLeadForm}>İptal</button>
              <div style={{ flex: 1 }}></div>
              {selectedLead && (
                <button className="btn btn-ghost" style={{ background: '#e0e7ff', color: 'var(--primary)', borderColor: 'transparent' }} type="button" onClick={addNoteToLead} disabled={!String(leadForm.pendingNote || "").trim()}>
                  Yalnızca Not Ekle
                </button>
              )}
              <button className="btn btn-primary" type="submit" form="lead-form">
                {leadForm.id ? "Lead Kaydet / Güncelle" : "Lead Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
