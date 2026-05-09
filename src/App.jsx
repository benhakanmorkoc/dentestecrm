import React, { useEffect, useMemo, useState } from "react";
// =========================================================================
// 🚀 CANLI ORTAMA (Vercel/GitHub) YÜKLERKEN AŞAĞIDAKİ YORUMU KALDIRIN:
import { supabase } from "./supabaseClient"; 
// =========================================================================
import { 
  LayoutDashboard, 
  Users, 
  LogOut, 
  Search, 
  Plus, 
  X, 
  Download, 
  UserPlus,
  Phone,
  MessageSquare,
  CreditCard,
  Edit,
  Trash2,
  Clock,
  History,
  CheckSquare,
  Shield,
  Power,
  PowerOff,
  Filter,
  Info,
  Bell,
  BarChart2,
  GitCompare
} from "lucide-react";

// --- CONSTANTS ---
const LEAD_SOURCES = ["Facebook Reklam", "Direk Arama", "Referans", "Direk Mesaj-Instagram", "Eski Data"];
const LEAD_STATUSES = ["Yeni", "Cevapsız", "Sıcak", "Satış", "İptal", "Yabancı", "Türk", "Düşünüp Geri Dönüş Sağlayacak", "İletişimde", "İstanbul Dışı", "Vazgeçti", "Randevu Verilen", "Randevu Gelen", "Randevu Gelmeyen", "Yanlış Başvuru"];
const LEAD_STAGES = ["Çok Uzak", "Çok Pahalı", "Şişli Uzak", "Diğer"];
const LANGUAGES = ["TR", "EN", "DE", "FR", "AR"];

const QUICK_FILTERS = [
  { id: "Sıcak", label: "🔥 Sıcak" },
  { id: "Satıldı", label: "✅ Satıldı" },
  { id: "Bugün", label: "📅 Bugün" },
  { id: "Bu Ay", label: "📊 Bu Ay" },
  { id: "Geçen Ay", label: "📆 Geçen Ay" },
  { id: "Son 3 Ay", label: "🕒 Son 3 Ay" }
];

function filterLeadsForReport(leads, start, end, source, lang, ownerId) {
  return leads.filter((l) => {
    let matchDate = true;
    if (start || end) {
      const created = new Date(l.created_at);
      if (start) {
        const from = new Date(start);
        from.setHours(0, 0, 0, 0);
        if (Number.isFinite(created.getTime()) && created < from) matchDate = false;
      }
      if (end && matchDate) {
        const to = new Date(`${end}T23:59:59.999`);
        if (Number.isFinite(created.getTime()) && created > to) matchDate = false;
      }
    }
    const matchSrc = source === "Tümü" || l.source === source;
    const matchLang = lang === "Tümü" || l.language === lang;
    const matchOwner = !ownerId || l.owner_id === ownerId;
    return matchDate && matchSrc && matchLang && matchOwner;
  });
}

function statusCountsFromLeads(leadList) {
  const counts = {};
  for (const s of LEAD_STATUSES) counts[s] = 0;
  let diger = 0;
  for (const l of leadList) {
    const st = l.status || "";
    if (st in counts) counts[st]++;
    else diger++;
  }
  return { counts, diger, total: leadList.length };
}

function parseSpendInput(val) {
  if (val == null || val === "") return 0;
  const n = parseFloat(String(val).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatTryAmount(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

function createEmptyLead(ownerId) {
  return { id: null, name: "", language: "TR", phone: "", source: "Facebook Reklam", status: "Yeni", stage: "Diğer", owner_id: ownerId || "", quote: "", pendingNote: "", notes: [] };
}
function createEmptyUser() {
  return { id: null, username: "", active: true, role: "sales" };
}

export function App() {
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView] = useState("leads");
  const [authLoading, setAuthLoading] = useState(true);
  
  // Lead States
  const [leads, setLeads] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("Tümü");
  const [filterLanguage, setFilterLanguage] = useState("Tümü");
  const [filterSource, setFilterSource] = useState("Tümü");
  const [quickFilter, setQuickFilter] = useState(""); 
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportSource, setReportSource] = useState("Tümü");
  const [reportLanguage, setReportLanguage] = useState("Tümü");
  const [reportOwnerId, setReportOwnerId] = useState("");

  const [reportSubView, setReportSubView] = useState("dashboard");
  const [compareStartA, setCompareStartA] = useState("");
  const [compareEndA, setCompareEndA] = useState("");
  const [compareStartB, setCompareStartB] = useState("");
  const [compareEndB, setCompareEndB] = useState("");
  const [compareSource, setCompareSource] = useState("Tümü");
  const [compareLanguage, setCompareLanguage] = useState("Tümü");
  const [compareOwnerId, setCompareOwnerId] = useState("");
  const [compareSpendA, setCompareSpendA] = useState("");
  const [compareSpendB, setCompareSpendB] = useState("");

  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [leadForm, setLeadForm] = useState(createEmptyLead(null));
  const [reminders, setReminders] = useState([]);
  const [reminderAmount, setReminderAmount] = useState(1);
  const [reminderUnit, setReminderUnit] = useState("gun");

  // User States
  const [appUsers, setAppUsers] = useState([]); 
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userFilterStatus, setUserFilterStatus] = useState("Tümü");
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState(createEmptyUser());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) { 
        fetchData(); 
        fetchUsers(session.user.id); 
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) { 
        fetchData(); 
        fetchUsers(session.user.id); 
      } else {
        setCurrentUser(null);
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async () => {
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error("Lead çekme hatası:", error);
    } else if (data) {
      setLeads(data);
    }
  };

  const fetchDueReminders = async () => {
    if (!currentUser?.id) return;
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("lead_reminders")
      .select("id, lead_id, remind_at, is_done, created_by")
      .eq("created_by", currentUser.id)
      .eq("is_done", false)
      .lte("remind_at", nowIso)
      .order("remind_at", { ascending: true });

    if (error) {
      console.error("Hatırlatıcı çekme hatası:", error);
      return;
    }

    setReminders(data || []);
  };

  const fetchUsers = async (sessionId) => {
    // profiles tablosunda artık name değil username olduğu için sıralamayı username'e göre yapıyoruz.
    const { data, error } = await supabase.from('profiles').select('*').order('username');
    
    if (error) {
      console.error("Kullanıcı çekme hatası:", error);
      setAuthLoading(false);
      return;
    }
    
    if (data) {
      setAppUsers(data);
      if (sessionId) {
        const activeUser = data.find(u => u.id === sessionId);
        setCurrentUser(activeUser);
        if (activeUser?.role !== 'admin' && activeView === 'users') {
          setActiveView('leads');
        }
      }
      setAuthLoading(false);
    }
  };

  async function handleLogin(event) {
    event.preventDefault();
    const username = event.target.username.value.trim();
    const password = event.target.password.value;
    if (!username || !password) return;

    setAuthLoading(true);
    try {
      // E-posta girilmezse projenizdeki yapıya göre default domain ekliyoruz
      const email = username.includes('@') ? username : `${username}@local.minicrm`;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        alert("Kullanıcı adı veya şifre hatalı.");
        setAuthLoading(false);
        return;
      }
    } catch (e) {
      console.error(e);
      alert("Giriş yapılırken beklenmeyen bir hata oluştu.");
      setAuthLoading(false);
    }
  }

  // --- LEAD FUNCTIONS ---
  const handlePhoneChange = (val) => {
    const cleaned = val.replace(/\D/g, '');
    setLeadForm({ ...leadForm, phone: cleaned });
  };

  const handleDeleteLead = async (id) => {
    if (currentUser?.role !== 'admin') { 
      alert("Bu işlem için yetkiniz bulunmamaktadır."); 
      return; 
    }
    if(!window.confirm("Bu kaydı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;
    
    const { error } = await supabase.from('leads').delete().match({ id });
    if (error) {
      alert("Silme işlemi başarısız: " + error.message);
      return;
    }
    fetchData();
  };

  const handleEditLead = async (lead) => {
    setLeadForm({ ...lead, pendingNote: "", notes: [] });
    setIsModalOpen(true);

    const { data: notesData, error } = await supabase
      .from('lead_notes')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Notları çekerken hata oluştu:", error);
    } else if (notesData) {
      setLeadForm(prev => ({ ...prev, notes: notesData }));
    }
  };

  const handleSaveLead = async () => {
    const { id, pendingNote, notes, created_at, updated_at, ...restOfLead } = leadForm;
    const payloadToSave = { ...restOfLead };
    
    if (id) {
      payloadToSave.id = id;
    }

    const { data: savedLead, error: leadError } = await supabase
      .from('leads')
      .upsert(payloadToSave)
      .select()
      .single();

    if (leadError) {
      alert("Lead kayıt hatası: " + leadError.message);
      return;
    }

    const currentLeadId = savedLead?.id || id;

    // Yeni not varsa lead_notes tablosuna ekle (author_id kolonunu kullanarak)
    if (pendingNote && pendingNote.trim() !== "" && currentLeadId) {
      const { error: noteError } = await supabase.from('lead_notes').insert([{
        lead_id: currentLeadId,
        text: pendingNote,
        author_id: currentUser?.id
      }]);
      if (noteError) console.error("Not kaydedilemedi:", noteError);
    }

    setIsModalOpen(false);
    fetchData();
  };

  const handleAddReminder = async () => {
    if (!leadForm.id) {
      alert("Hatırlatıcı eklemek için önce kaydı oluşturup kaydetmelisiniz.");
      return;
    }
    const safeAmount = Number(reminderAmount);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      alert("Lütfen geçerli bir hatırlatma süresi giriniz.");
      return;
    }
    const durationMs = reminderUnit === "gun"
      ? safeAmount * 24 * 60 * 60 * 1000
      : safeAmount * 60 * 60 * 1000;
    const remindAt = new Date(Date.now() + durationMs).toISOString();
    const { error } = await supabase.from("lead_reminders").insert([{
      lead_id: leadForm.id,
      remind_at: remindAt,
      is_done: false,
      created_by: currentUser?.id
    }]);
    if (error) {
      alert("Hatırlatıcı eklenemedi: " + error.message);
      return;
    }
    alert("Hatırlatıcı eklendi.");
    fetchDueReminders();
  };

  const markReminderDone = async (id) => {
    const { error } = await supabase.from("lead_reminders").update({ is_done: true }).match({ id });
    if (error) {
      alert("Hatırlatıcı güncellenemedi: " + error.message);
      return;
    }
    fetchDueReminders();
  };

  const openLeadFromReminder = async (reminder, markAsDone = false) => {
    if (!reminder?.lead_id) {
      alert("Bu hatırlatıcıya bağlı lead bilgisi bulunamadı.");
      return;
    }

    setActiveView("leads");

    const existingLead = leads.find((l) => String(l.id) === String(reminder.lead_id));
    const targetLead = existingLead
      ? existingLead
      : await (async () => {
          const { data, error } = await supabase
            .from("leads")
            .select("*")
            .eq("id", reminder.lead_id)
            .single();
          if (error) return null;
          return data;
        })();

    if (!targetLead) {
      alert("İlgili lead kaydı bulunamadı.");
      return;
    }

    setLeadForm({ ...targetLead, pendingNote: "", notes: [] });
    setIsModalOpen(true);

    const { data: notesData, error: notesError } = await supabase
      .from("lead_notes")
      .select("*")
      .eq("lead_id", targetLead.id)
      .order("created_at", { ascending: false });

    if (notesError) {
      console.error("Notları çekerken hata oluştu:", notesError);
      return;
    }

    setLeadForm((prev) => ({ ...prev, notes: notesData || [] }));

    if (markAsDone) {
      // Kullanıcı Kaydı Aç dediğinde popup'ın anında kapanması için listeden düşürüyoruz.
      setReminders((prev) => prev.filter((r) => r.id !== reminder.id));
      const { error: doneError } = await supabase
        .from("lead_reminders")
        .update({ is_done: true })
        .match({ id: reminder.id });
      if (doneError) {
        console.error("Hatırlatıcı tamamlandı işaretlenemedi:", doneError);
      }
      fetchDueReminders();
    }
  };

  const handleSelectAll = (e) => { e.target.checked ? setSelectedLeadIds(filteredLeads.map(l => l.id)) : setSelectedLeadIds([]); };
  const handleSelectOne = (id) => { setSelectedLeadIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); };

  const handleBulkTransfer = async () => {
    if (!targetUserId || selectedLeadIds.length === 0) return;
    
    const promises = selectedLeadIds.map(id => 
      supabase.from('leads').update({ owner_id: targetUserId }).match({ id })
    );
    
    await Promise.all(promises);
    
    alert(`${selectedLeadIds.length} kayıt başarıyla yeni temsilciye aktarıldı.`);
    setSelectedLeadIds([]);
    setIsTransferModalOpen(false);
    fetchData();
  };

  const exportToCSV = () => { 
    if (currentUser?.role !== 'admin') {
      alert("Bu işlem için yetkiniz bulunmamaktadır.");
      return; 
    }
    
    const headers = ["İsim,Telefon,Dil,Kaynak,Durum,Alt Durum,Teklif,Sahibi,Tarih"];
    const rows = filteredLeads.map(l => {
      const ownerObj = appUsers.find(u => u.id === l.owner_id);
      const ownerName = ownerObj ? ownerObj.username : "Atanmamış";
      return `${l.name || ''},${l.phone || ''},${l.language || ''},${l.source || ''},${l.status || ''},${l.stage || ''},${l.quote || ''},${ownerName},${l.created_at || ''}`;
    });
    
    const csvData = headers.concat(rows).join("\n");
    const BOM = "\uFEFF"; 
    const csvContent = BOM + csvData;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    link.setAttribute("download", `denteste_leads_${new Date().toLocaleDateString('tr-TR')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const matchSearch = (l.name?.toLowerCase().includes(searchQuery.toLowerCase()) || l.phone?.toString().includes(searchQuery));
      const matchStatus = filterStatus === "Tümü" || l.status === filterStatus;
      const matchLanguage = filterLanguage === "Tümü" || l.language === filterLanguage;
      const matchSource = filterSource === "Tümü" || l.source === filterSource;

      let matchDateRange = true;
      if (filterStartDate || filterEndDate) {
        const created = new Date(l.created_at);
        if (filterStartDate) {
          const from = new Date(filterStartDate);
          from.setHours(0, 0, 0, 0);
          if (Number.isFinite(created.getTime()) && created < from) matchDateRange = false;
        }
        if (filterEndDate && matchDateRange) {
          const to = new Date(`${filterEndDate}T23:59:59.999`);
          if (Number.isFinite(created.getTime()) && created > to) matchDateRange = false;
        }
      }
      
      let matchQuick = true;
      if (quickFilter) {
        const createdDate = new Date(l.created_at);
        const today = new Date();
        
        if (quickFilter === "Sıcak") matchQuick = l.status === "Sıcak";
        else if (quickFilter === "Satıldı") matchQuick = l.status === "Satış";
        else if (quickFilter === "Bugün") {
          matchQuick = createdDate.toDateString() === today.toDateString();
        } 
        else if (quickFilter === "Bu Ay") {
          matchQuick = createdDate.getMonth() === today.getMonth() && createdDate.getFullYear() === today.getFullYear();
        }
        else if (quickFilter === "Geçen Ay") {
          const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
          matchQuick = createdDate >= firstDayLastMonth && createdDate <= lastDayLastMonth;
        }
        else if (quickFilter === "Son 3 Ay") {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(today.getMonth() - 3);
          matchQuick = createdDate >= threeMonthsAgo;
        }
      }
      
      return matchSearch && matchStatus && matchLanguage && matchSource && matchDateRange && matchQuick;
    });
  }, [leads, searchQuery, filterStatus, filterLanguage, filterSource, quickFilter, filterStartDate, filterEndDate]);

  const reportFilteredLeads = useMemo(() => {
    return leads.filter((l) => {
      let matchDate = true;
      if (reportStartDate || reportEndDate) {
        const created = new Date(l.created_at);
        if (reportStartDate) {
          const from = new Date(reportStartDate);
          from.setHours(0, 0, 0, 0);
          if (Number.isFinite(created.getTime()) && created < from) matchDate = false;
        }
        if (reportEndDate && matchDate) {
          const to = new Date(`${reportEndDate}T23:59:59.999`);
          if (Number.isFinite(created.getTime()) && created > to) matchDate = false;
        }
      }
      const matchSrc = reportSource === "Tümü" || l.source === reportSource;
      const matchLang = reportLanguage === "Tümü" || l.language === reportLanguage;
      const matchOwner = !reportOwnerId || l.owner_id === reportOwnerId;
      return matchDate && matchSrc && matchLang && matchOwner;
    });
  }, [leads, reportStartDate, reportEndDate, reportSource, reportLanguage, reportOwnerId]);

  const reportStatusMatrix = useMemo(() => {
    const counts = {};
    for (const s of LEAD_STATUSES) counts[s] = 0;
    let diger = 0;
    for (const l of reportFilteredLeads) {
      const st = l.status || "";
      if (st in counts) counts[st]++;
      else diger++;
    }
    return { counts, diger, total: reportFilteredLeads.length };
  }, [reportFilteredLeads]);

  const compareLeadsA = useMemo(() => {
    if (!compareStartA || !compareEndA) return [];
    return filterLeadsForReport(leads, compareStartA, compareEndA, compareSource, compareLanguage, compareOwnerId);
  }, [leads, compareStartA, compareEndA, compareSource, compareLanguage, compareOwnerId]);

  const compareLeadsB = useMemo(() => {
    if (!compareStartB || !compareEndB) return [];
    return filterLeadsForReport(leads, compareStartB, compareEndB, compareSource, compareLanguage, compareOwnerId);
  }, [leads, compareStartB, compareEndB, compareSource, compareLanguage, compareOwnerId]);

  const compareMatrixA = useMemo(() => statusCountsFromLeads(compareLeadsA), [compareLeadsA]);
  const compareMatrixB = useMemo(() => statusCountsFromLeads(compareLeadsB), [compareLeadsB]);

  const compareReady = Boolean(compareStartA && compareEndA && compareStartB && compareEndB);

  const compareSpendNumA = useMemo(() => parseSpendInput(compareSpendA), [compareSpendA]);
  const compareSpendNumB = useMemo(() => parseSpendInput(compareSpendB), [compareSpendB]);

  const compareCplA = useMemo(() => {
    if (!compareReady || compareMatrixA.total <= 0) return null;
    return compareSpendNumA / compareMatrixA.total;
  }, [compareReady, compareMatrixA.total, compareSpendNumA]);

  const compareCplB = useMemo(() => {
    if (!compareReady || compareMatrixB.total <= 0) return null;
    return compareSpendNumB / compareMatrixB.total;
  }, [compareReady, compareMatrixB.total, compareSpendNumB]);

  const compareSpendBreakdownA = useMemo(() => {
    const perStatus = {};
    for (const s of LEAD_STATUSES) perStatus[s] = null;
    if (!compareReady || compareMatrixA.total <= 0) return { perStatus, diger: null };
    const perLead = compareSpendNumA / compareMatrixA.total;
    for (const s of LEAD_STATUSES) perStatus[s] = perLead * compareMatrixA.counts[s];
    return { perStatus, diger: perLead * compareMatrixA.diger };
  }, [compareReady, compareMatrixA, compareSpendNumA]);

  const compareSpendBreakdownB = useMemo(() => {
    const perStatus = {};
    for (const s of LEAD_STATUSES) perStatus[s] = null;
    if (!compareReady || compareMatrixB.total <= 0) return { perStatus, diger: null };
    const perLead = compareSpendNumB / compareMatrixB.total;
    for (const s of LEAD_STATUSES) perStatus[s] = perLead * compareMatrixB.counts[s];
    return { perStatus, diger: perLead * compareMatrixB.diger };
  }, [compareReady, compareMatrixB, compareSpendNumB]);

  const reportDashboardBars = useMemo(() => {
    const rows = [];
    for (const s of LEAD_STATUSES) {
      const v = reportStatusMatrix.counts[s];
      if (v > 0) rows.push({ label: s, value: v });
    }
    if (reportStatusMatrix.diger > 0) {
      rows.push({ label: "Diğer", value: reportStatusMatrix.diger });
    }
    rows.sort((a, b) => b.value - a.value);
    return rows;
  }, [reportStatusMatrix]);

  const reportDashboardMax = useMemo(() => {
    if (!reportDashboardBars.length) return 1;
    return Math.max(...reportDashboardBars.map((r) => r.value), 1);
  }, [reportDashboardBars]);

  // --- USER FUNCTIONS ---
  const handleSaveUser = async () => {
    if (currentUser?.role !== 'admin') return;
    
    // Yalnızca profiles tablosunda var olan kolonları gönderiyoruz.
    const profileData = {
      username: userForm.username,
      role: userForm.role,
      active: userForm.active
    };

    if (userForm.id) profileData.id = userForm.id;
    
    const { error } = await supabase.from('profiles').upsert(profileData);
    
    if (error) {
      alert("Kullanıcı profil bilgileri kaydedilemedi: " + error.message);
    } else {
      setIsUserModalOpen(false);
      fetchUsers(session?.user?.id);
    }
  };

  const handleDeleteUser = async (id) => {
    if (currentUser?.role !== 'admin') return;
    if(!window.confirm("Bu kullanıcı profilini silmek istediğinize emin misiniz?")) return;
    
    await supabase.from('profiles').delete().match({ id });
    fetchUsers(session?.user?.id);
  };

  const handleToggleUserStatus = async (user) => {
    if (currentUser?.role !== 'admin') return;
    const newStatus = !user.active; // boolean toggle
    if(!window.confirm(`Kullanıcı durumunu '${newStatus ? 'Aktif' : 'Pasif'}' olarak değiştirmek istediğinize emin misiniz?`)) return;
    
    await supabase.from('profiles').update({ active: newStatus }).match({ id: user.id });
    fetchUsers(session?.user?.id);
  };

  const filteredUsers = useMemo(() => {
    return appUsers.filter(u => {
      const matchSearch = u.username?.toLowerCase().includes(userSearchQuery.toLowerCase());
      
      let matchStatus = true;
      if (userFilterStatus === "Aktif") matchStatus = u.active === true;
      if (userFilterStatus === "Pasif") matchStatus = u.active === false;
      
      return matchSearch && matchStatus;
    });
  }, [appUsers, userSearchQuery, userFilterStatus]);

  useEffect(() => {
    if (!currentUser?.id) return;
    fetchDueReminders();
    const intervalId = setInterval(fetchDueReminders, 30000);
    return () => clearInterval(intervalId);
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.role !== "admin" && reportSubView !== "dashboard") {
      setReportSubView("dashboard");
    }
  }, [currentUser?.role, reportSubView]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="p-8 bg-white rounded-2xl shadow-xl w-96 text-center border border-gray-100">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!session || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="p-8 bg-white rounded-2xl shadow-xl w-96 border border-gray-100">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
              <span className="text-white font-bold text-2xl">D</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Denteste CRM</h1>
            <p className="text-gray-500 text-sm mt-1">Lütfen giriş yapın</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
              <input name="username" type="text" required className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="admin" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
              <input name="password" type="password" required className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="••••••" />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-md mt-4">
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-gray-800 overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-800 text-gray-300 flex flex-col border-r border-slate-900 z-30 shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-slate-700 bg-slate-900">
          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center mr-3 shadow-sm">
            <span className="text-white font-bold text-xs">D</span>
          </div>
          <h1 className="text-sm font-semibold text-white tracking-wide">Denteste-CRM</h1>
        </div>
        
        <nav className="flex-1 py-4">
          <ul className="space-y-1">
            <li>
              <button onClick={() => setActiveView("leads")} className={`w-full flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${activeView === "leads" ? "bg-blue-600 text-white border-l-4 border-blue-400 font-medium" : "hover:bg-slate-700 border-l-4 border-transparent"}`}>
                <LayoutDashboard size={16} /> Lead Havuzu
              </button>
            </li>
            <li>
              <button onClick={() => setActiveView("reports")} className={`w-full flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${activeView === "reports" ? "bg-blue-600 text-white border-l-4 border-blue-400 font-medium" : "hover:bg-slate-700 border-l-4 border-transparent"}`}>
                <BarChart2 size={16} /> Raporlar
              </button>
            </li>
            {currentUser?.role === 'admin' && (
              <li>
                <button onClick={() => setActiveView("users")} className={`w-full flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${activeView === "users" ? "bg-blue-600 text-white border-l-4 border-blue-400 font-medium" : "hover:bg-slate-700 border-l-4 border-transparent"}`}>
                  <Users size={16} /> Kullanıcılar
                </button>
              </li>
            )}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-700 bg-slate-900/50">
          <div className="mb-4 px-2">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${currentUser.active ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
              <p className="text-xs font-bold text-white truncate">{currentUser.username}</p>
            </div>
            <p className="text-[10px] font-semibold text-blue-400 mt-1 uppercase tracking-wider">{currentUser.role === 'admin' ? 'Admin' : 'Satış Personeli'}</p>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs transition-colors border border-slate-600">
            <LogOut size={14} /> Oturumu Kapat
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden relative bg-gray-50">
        
        {/* HEADER */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-20 shrink-0 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800">
            {activeView === "leads"
              ? "Müşteri Adayı Yönetimi"
              : activeView === "reports"
                ? (reportSubView === "dashboard"
                    ? "Raporlar — Dashboard"
                    : "Raporlar — Karşılaştırma-Maliyet")
                : "Sistem Kullanıcıları"}
          </h2>
          
          <div className="flex items-center gap-3">
            {activeView === "leads" ? (
              <>
                {currentUser?.role === 'admin' && (
                  <button onClick={exportToCSV} className="flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded text-sm transition-colors shadow-sm">
                    <Download size={14} /> Dışa Aktar
                  </button>
                )}
                <button onClick={() => { setLeadForm(createEmptyLead(currentUser.id)); setIsModalOpen(true); }} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm transition-colors shadow-sm">
                  <Plus size={14} /> Yeni Kayıt
                </button>
              </>
            ) : activeView === "reports" ? (
              <button type="button" onClick={() => fetchData()} className="flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded text-sm transition-colors shadow-sm">
                <Clock size={14} /> Verileri yenile
              </button>
            ) : (
              currentUser?.role === 'admin' && (
                <button onClick={() => { setUserForm(createEmptyUser()); setIsUserModalOpen(true); }} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm transition-colors shadow-sm">
                  <UserPlus size={14} /> Profil Ekle
                </button>
              )
            )}
          </div>
        </header>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 custom-scrollbar">
          
          {/* === LEADS VIEW === */}
          {activeView === "leads" && (
            <div className="space-y-4 max-w-[1600px] mx-auto">
              
              {/* HIZLI FİLTRELER */}
              <div className="flex items-center flex-wrap gap-2 mb-2">
                <span className="text-xs font-bold text-gray-500 mr-2 flex items-center gap-1">
                  <Filter size={14} /> HIZLI FİLTRE:
                </span>
                {QUICK_FILTERS.map(qf => (
                  <button
                    key={qf.id}
                    onClick={() => setQuickFilter(qf.id)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                      quickFilter === qf.id
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                    }`}
                  >
                    {qf.label}
                  </button>
                ))}
                {quickFilter && (
                  <button
                    onClick={() => setQuickFilter("")}
                    className="px-3 py-1 rounded-full text-[11px] font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-all flex items-center gap-1 ml-auto md:ml-2"
                  >
                    <X size={12} /> Temizle
                  </button>
                )}
              </div>

              {/* DETAYLI FILTERS */}
              <div className="bg-white p-4 rounded border border-gray-200 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Arama</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input type="text" placeholder="İsim, Tel..." className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                </div>
                <div className="w-full sm:w-48">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Durum</label>
                  <select className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="Tümü">Tümü</option>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="w-full sm:w-32">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Dil</label>
                  <select className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={filterLanguage} onChange={e => setFilterLanguage(e.target.value)}>
                    <option value="Tümü">Tümü</option>
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="w-full sm:w-48">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Kaynak</label>
                  <select className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                    <option value="Tümü">Tümü</option>
                    {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="w-full sm:w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Oluşturulma (başlangıç)</label>
                  <input type="date" className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500 text-gray-600" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
                </div>
                <div className="w-full sm:w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Oluşturulma (bitiş)</label>
                  <input type="date" className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500 text-gray-600" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
                </div>
              </div>

              {/* BULK ACTIONS */}
              {selectedLeadIds.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 p-2 rounded flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                  <span className="text-sm text-blue-800 font-medium ml-2">
                    <CheckSquare size={16} className="inline mr-1" /> {selectedLeadIds.length} kayıt seçili
                  </span>
                  <button onClick={() => setIsTransferModalOpen(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-700 transition-colors">
                    Seçilenleri Temsilciye Aktar
                  </button>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 pb-1 px-1">
                <span className="text-sm font-bold text-gray-700">Müşteri Havuzu</span>
                <div className="flex gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-600 bg-white px-2.5 py-1 rounded-md border border-gray-200 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    Toplam: <strong className="text-gray-800">{leads.length}</strong>
                  </div>
                  <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Filtre sonucu: <strong className="text-blue-800">{filteredLeads.length}</strong>
                  </div>
                </div>
              </div>

              {/* LEAD TABLE */}
              <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden flex flex-col relative z-0">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="min-w-full divide-y divide-gray-200 text-left whitespace-nowrap">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2.5 w-10 text-center sticky left-0 bg-gray-100 z-10 border-r border-gray-200">
                          <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" checked={selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0} onChange={handleSelectAll} />
                        </th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 border-r border-gray-200">Müşteri</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 border-r border-gray-200">İletişim</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 border-r border-gray-200">Dil / Kaynak</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 border-r border-gray-200">Durum / Aşama</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 border-r border-gray-200">Teklif</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 border-r border-gray-200">Temsilci</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 sticky right-0 bg-gray-100 z-10 border-l border-gray-300 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] text-center w-28">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {filteredLeads.map((l) => (
                        <tr key={l.id} className="hover:bg-blue-50/60 transition-colors group">
                          <td className="px-4 py-2 text-center sticky left-0 bg-white group-hover:bg-blue-50 z-10 border-r border-gray-100">
                            <input type="checkbox" className="rounded border-gray-300 text-blue-600 cursor-pointer" checked={selectedLeadIds.includes(l.id)} onChange={() => handleSelectOne(l.id)} />
                          </td>
                          <td className="px-4 py-2 border-r border-gray-100">
                            <div className="text-sm font-medium text-gray-900">{l.name}</div>
                            <div className="text-[10px] text-gray-400">{new Date(l.created_at).toLocaleDateString('tr-TR')}</div>
                          </td>
                          <td className="px-4 py-2 border-r border-gray-100 text-sm text-gray-600">{l.phone}</td>
                          <td className="px-4 py-2 border-r border-gray-100">
                            <div className="text-xs text-gray-800 font-medium">{l.language}</div>
                            <div className="text-[10px] text-gray-500">{l.source}</div>
                          </td>
                          <td className="px-4 py-2 border-r border-gray-100">
                            <div className="flex flex-col gap-1 items-start">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${l.status === 'Yeni' ? 'bg-blue-100 text-blue-800 border border-blue-200' : l.status === 'Sıcak' ? 'bg-amber-100 text-amber-800 border border-amber-200' : l.status === 'İptal' ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                                {l.status}
                              </span>
                              <span className="text-[10px] text-gray-500 truncate w-full">{l.stage}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 border-r border-gray-100 text-sm font-semibold text-emerald-600">{l.quote || "-"}</td>
                          <td className="px-4 py-2 border-r border-gray-100 text-xs text-gray-700">{appUsers.find(u => u.id === l.owner_id)?.username || "Atanmamış"}</td>
                          <td className="px-4 py-2 sticky right-0 bg-white group-hover:bg-blue-50/60 z-10 border-l border-gray-200 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.03)]">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => handleEditLead(l)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded border border-transparent hover:border-blue-200 transition-colors" title="Düzenle / Not Ekle">
                                <Edit size={16} />
                              </button>
                              
                              {currentUser?.role === 'admin' && (
                                <button onClick={() => handleDeleteLead(l.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded border border-transparent hover:border-red-200 transition-colors" title="Sil">
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredLeads.length === 0 && <div className="py-8 text-center text-sm text-gray-500">Kriterlere uygun kayıt bulunamadı.</div>}
                </div>
              </div>
            </div>
          )}

          {/* === REPORTS === */}
          {activeView === "reports" && (
            <div className="space-y-4 max-w-[1800px] mx-auto animate-in fade-in duration-300">
              <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
                <button
                  type="button"
                  onClick={() => setReportSubView("dashboard")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${reportSubView === "dashboard" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"}`}
                >
                  <BarChart2 size={16} /> Dashboard
                </button>
                {currentUser?.role === "admin" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setReportSubView("comparison")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${reportSubView === "comparison" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"}`}
                    >
                      <GitCompare size={16} /> Karşılaştırma-Maliyet
                    </button>
                  </>
                )}
              </div>

              {reportSubView === "dashboard" && (
                <>
                  <div className="bg-white p-4 rounded border border-gray-200 shadow-sm flex flex-wrap gap-4 items-end">
                    <div className="w-full sm:w-36">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Oluşturulma (başlangıç)</label>
                      <input type="date" className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500 text-gray-600" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
                    </div>
                    <div className="w-full sm:w-36">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Oluşturulma (bitiş)</label>
                      <input type="date" className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500 text-gray-600" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
                    </div>
                    <div className="w-full sm:w-48">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Kaynak</label>
                      <select className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={reportSource} onChange={e => setReportSource(e.target.value)}>
                        <option value="Tümü">Tümü</option>
                        {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="w-full sm:w-32">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Dil</label>
                      <select className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={reportLanguage} onChange={e => setReportLanguage(e.target.value)}>
                        <option value="Tümü">Tümü</option>
                        {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="w-full sm:w-48">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Temsilci</label>
                      <select className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={reportOwnerId} onChange={e => setReportOwnerId(e.target.value)}>
                        <option value="">Tümü</option>
                        {appUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setReportStartDate(""); setReportEndDate(""); setReportSource("Tümü"); setReportLanguage("Tümü"); setReportOwnerId(""); }}
                      className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 bg-red-50 rounded hover:bg-red-100"
                    >
                      Rapor filtrelerini sıfırla
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 px-3 py-1.5 rounded-md border border-blue-200 font-medium">
                      <BarChart2 size={16} /> Filtrelenen toplam: <strong>{reportStatusMatrix.total}</strong> kayıt
                    </span>
                    <span className="text-xs text-gray-500">Durumlara göre kayıt adedi; çubuklar büyükten küçüğe sıralıdır.</span>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-[#f0f1f4] shadow-sm overflow-hidden">
                    {reportDashboardBars.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-16 px-4">Bu filtrelerle gösterilecek durum dağılımı yok (tüm adetler sıfır).</div>
                    ) : (
                      <div className="overflow-x-auto custom-scrollbar px-4 pt-6 pb-2">
                        <div
                          className="flex items-end justify-center gap-2 sm:gap-4 mx-auto"
                          style={{ minWidth: `${Math.max(reportDashboardBars.length * 56, 280)}px`, minHeight: "300px" }}
                        >
                          {reportDashboardBars.map(({ label, value }, barIdx) => {
                            const pct = reportDashboardMax > 0 ? (value / reportDashboardMax) * 100 : 0;
                            const shortLabel = label.length > 16 ? `${label.slice(0, 14)}…` : label;
                            return (
                              <div key={`report-bar-${barIdx}`} className="flex flex-col items-center flex-1 min-w-[48px] max-w-[120px]">
                                <div className="mb-1 px-2 py-0.5 bg-white rounded text-[11px] font-bold text-gray-900 shadow-sm tabular-nums whitespace-nowrap">
                                  {value}
                                </div>
                                <div className="w-full flex flex-col justify-end h-[220px]">
                                  <div
                                    className="w-[78%] mx-auto rounded-t-[2px] bg-[#1a2f4a] min-h-[3px] transition-[height] duration-300"
                                    style={{ height: `${Math.max(pct, 0)}%` }}
                                    title={`${label}: ${value}`}
                                  />
                                </div>
                                <div className="relative mt-3 h-16 w-full flex justify-center">
                                  <span
                                    className="absolute top-0 left-1/2 text-[10px] sm:text-[11px] text-gray-900 font-medium leading-snug text-center whitespace-nowrap origin-top -rotate-45 -translate-x-1/2"
                                    style={{ maxWidth: "140px" }}
                                    title={label}
                                  >
                                    {shortLabel}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {reportSubView === "comparison" && currentUser?.role === "admin" && (
                <>
                  <div className="bg-amber-50/80 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900 space-y-1">
                    <p><strong>Karşılaştırma-Maliyet:</strong> <strong>1. dönem</strong> satırı <span className="font-semibold text-yellow-800">sarı</span>, <strong>2. dönem</strong> satırı <span className="font-semibold text-purple-800">mor</span> renkte gösterilir. Her iki dönem için başlangıç ve bitiş tarihlerini seçin.</p>
                    <p>Her dönem için <strong>toplam harcama (TL)</strong> girerseniz <strong>CPL = harcama ÷ lead adedi</strong> hesaplanır; harcama durum kolonlarında, o durumdaki lead sayısına göre <strong>orantılı</strong> dağıtılarak gösterilir (sütun toplamı girilen harcamaya eşittir).</p>
                  </div>

                  <div className="bg-white p-4 rounded border border-gray-200 shadow-sm flex flex-col gap-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-yellow-300 bg-yellow-50/40 p-3 space-y-3">
                        <p className="text-xs font-bold text-yellow-900 uppercase tracking-wide">1. tarih aralığı (sarı)</p>
                        <div className="flex flex-wrap gap-3 items-end">
                          <div className="w-full sm:w-40">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Başlangıç</label>
                            <input type="date" className="w-full px-3 py-1.5 border border-yellow-400 rounded text-sm bg-white" value={compareStartA} onChange={e => setCompareStartA(e.target.value)} />
                          </div>
                          <div className="w-full sm:w-40">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Bitiş</label>
                            <input type="date" className="w-full px-3 py-1.5 border border-yellow-400 rounded text-sm bg-white" value={compareEndA} onChange={e => setCompareEndA(e.target.value)} />
                          </div>
                          <div className="w-full min-w-[200px]">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Toplam harcama (TL)</label>
                            <input type="number" min="0" step="0.01" placeholder="0" className="w-full px-3 py-1.5 border border-yellow-400 rounded text-sm bg-white" value={compareSpendA} onChange={e => setCompareSpendA(e.target.value)} />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-purple-300 bg-purple-50/40 p-3 space-y-3">
                        <p className="text-xs font-bold text-purple-900 uppercase tracking-wide">2. tarih aralığı (mor)</p>
                        <div className="flex flex-wrap gap-3 items-end">
                          <div className="w-full sm:w-40">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Başlangıç</label>
                            <input type="date" className="w-full px-3 py-1.5 border border-purple-400 rounded text-sm bg-white" value={compareStartB} onChange={e => setCompareStartB(e.target.value)} />
                          </div>
                          <div className="w-full sm:w-40">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Bitiş</label>
                            <input type="date" className="w-full px-3 py-1.5 border border-purple-400 rounded text-sm bg-white" value={compareEndB} onChange={e => setCompareEndB(e.target.value)} />
                          </div>
                          <div className="w-full min-w-[200px]">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Toplam harcama (TL)</label>
                            <input type="number" min="0" step="0.01" placeholder="0" className="w-full px-3 py-1.5 border border-purple-400 rounded text-sm bg-white" value={compareSpendB} onChange={e => setCompareSpendB(e.target.value)} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 items-end border-t border-gray-100 pt-4">
                      <div className="w-full sm:w-48">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Kaynak (her iki dönem)</label>
                        <select className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" value={compareSource} onChange={e => setCompareSource(e.target.value)}>
                          <option value="Tümü">Tümü</option>
                          {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="w-full sm:w-32">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Dil</label>
                        <select className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" value={compareLanguage} onChange={e => setCompareLanguage(e.target.value)}>
                          <option value="Tümü">Tümü</option>
                          {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="w-full sm:w-48">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Temsilci</label>
                        <select className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm" value={compareOwnerId} onChange={e => setCompareOwnerId(e.target.value)}>
                          <option value="">Tümü</option>
                          {appUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCompareStartA(""); setCompareEndA(""); setCompareStartB(""); setCompareEndB("");
                          setCompareSource("Tümü"); setCompareLanguage("Tümü"); setCompareOwnerId("");
                          setCompareSpendA(""); setCompareSpendB("");
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 bg-red-50 rounded hover:bg-red-100"
                      >
                        Karşılaştırma-Maliyet filtrelerini sıfırla
                      </button>
                    </div>
                  </div>

                  {!compareReady && (
                    <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-4 py-3">
                      Karşılaştırma-Maliyet tablosunu görmek için <strong>her iki dönem</strong> için başlangıç ve bitiş tarihlerini seçin.
                    </div>
                  )}

                  {compareReady && (
                    <div className="flex flex-col sm:flex-row flex-wrap gap-3 text-sm">
                      <div className="inline-flex flex-col gap-1 bg-yellow-100 text-yellow-950 px-3 py-2 rounded-md border border-yellow-300 font-medium max-w-lg">
                        <span>1. dönem lead: <strong>{compareMatrixA.total}</strong> · Harcama: <strong>{formatTryAmount(compareSpendNumA)}</strong></span>
                        <span className="text-xs sm:text-sm">
                          CPL = {compareCplA != null ? <strong>{formatTryAmount(compareCplA)}</strong> : <strong className="text-yellow-800">—</strong>}
                          {compareMatrixA.total <= 0 && <span className="font-normal text-yellow-800"> (lead yok)</span>}
                        </span>
                      </div>
                      <div className="inline-flex flex-col gap-1 bg-purple-100 text-purple-950 px-3 py-2 rounded-md border border-purple-300 font-medium max-w-lg">
                        <span>2. dönem lead: <strong>{compareMatrixB.total}</strong> · Harcama: <strong>{formatTryAmount(compareSpendNumB)}</strong></span>
                        <span className="text-xs sm:text-sm">
                          CPL = {compareCplB != null ? <strong>{formatTryAmount(compareCplB)}</strong> : <strong className="text-purple-800">—</strong>}
                          {compareMatrixB.total <= 0 && <span className="font-normal text-purple-800"> (lead yok)</span>}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="min-w-max w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-gray-200">
                            <th className="sticky left-0 z-20 bg-slate-100 px-3 py-2 text-xs font-semibold text-gray-600 border-r border-gray-200 min-w-[120px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                              Dönem
                            </th>
                            {LEAD_STATUSES.map((st) => (
                              <th key={st} className="px-2 py-2 text-[10px] font-semibold text-gray-700 border-r border-gray-200 whitespace-nowrap max-w-[120px] align-bottom" title={st}>
                                <span className="line-clamp-2">{st}</span>
                              </th>
                            ))}
                            <th className="px-2 py-2 text-[10px] font-semibold text-amber-800 bg-amber-50 border-r border-amber-200 whitespace-nowrap">
                              Diğer
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-yellow-100/90 hover:bg-yellow-100">
                            <td className="sticky left-0 z-10 bg-yellow-100 px-3 py-2 text-xs font-bold text-yellow-950 border-r border-yellow-300 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                              1. dönem — adet
                            </td>
                            {LEAD_STATUSES.map((st) => (
                              <td key={st} className="px-2 py-2 text-center text-sm font-bold text-yellow-950 border-r border-yellow-200/80 tabular-nums bg-yellow-50/80">
                                {compareReady ? compareMatrixA.counts[st] : "—"}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center text-sm font-bold text-yellow-950 bg-amber-100/80 border-r border-amber-200 tabular-nums">
                              {compareReady ? compareMatrixA.diger : "—"}
                            </td>
                          </tr>
                          <tr className="bg-yellow-50/95 hover:bg-yellow-50 border-t border-yellow-200">
                            <td className="sticky left-0 z-10 bg-yellow-50 px-3 py-2 text-xs font-bold text-yellow-950 border-r border-yellow-300 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                              1. dönem — harcama (TL)
                            </td>
                            {LEAD_STATUSES.map((st) => (
                              <td key={st} className="px-2 py-2 text-center text-xs font-semibold text-yellow-950 border-r border-yellow-200/80 tabular-nums bg-yellow-50/90">
                                {compareReady ? formatTryAmount(compareSpendBreakdownA.perStatus[st]) : "—"}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center text-xs font-semibold text-yellow-950 bg-amber-50/90 border-r border-amber-200 tabular-nums">
                              {compareReady ? formatTryAmount(compareSpendBreakdownA.diger) : "—"}
                            </td>
                          </tr>
                          <tr className="bg-purple-100/90 hover:bg-purple-100">
                            <td className="sticky left-0 z-10 bg-purple-100 px-3 py-2 text-xs font-bold text-purple-950 border-r border-purple-300 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                              2. dönem — adet
                            </td>
                            {LEAD_STATUSES.map((st) => (
                              <td key={st} className="px-2 py-2 text-center text-sm font-bold text-purple-950 border-r border-purple-200/80 tabular-nums bg-purple-50/80">
                                {compareReady ? compareMatrixB.counts[st] : "—"}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center text-sm font-bold text-purple-950 bg-violet-100/80 border-r border-violet-200 tabular-nums">
                              {compareReady ? compareMatrixB.diger : "—"}
                            </td>
                          </tr>
                          <tr className="bg-purple-50/95 hover:bg-purple-50 border-t border-purple-200">
                            <td className="sticky left-0 z-10 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-950 border-r border-purple-300 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                              2. dönem — harcama (TL)
                            </td>
                            {LEAD_STATUSES.map((st) => (
                              <td key={st} className="px-2 py-2 text-center text-xs font-semibold text-purple-950 border-r border-purple-200/80 tabular-nums bg-purple-50/90">
                                {compareReady ? formatTryAmount(compareSpendBreakdownB.perStatus[st]) : "—"}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center text-xs font-semibold text-purple-950 bg-violet-100/80 border-r border-violet-200 tabular-nums">
                              {compareReady ? formatTryAmount(compareSpendBreakdownB.diger) : "—"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

            </div>
          )}

          {/* === USERS VIEW === */}
          {activeView === "users" && currentUser?.role === 'admin' && (
            <div className="space-y-4 max-w-[1200px] mx-auto animate-in fade-in duration-300">
              
              <div className="bg-white p-4 rounded border border-gray-200 shadow-sm flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Kullanıcı Ara</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input type="text" placeholder="Kullanıcı adı..." className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={userSearchQuery} onChange={e => setUserSearchQuery(e.target.value)} />
                  </div>
                </div>
                <div className="w-full sm:w-48">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Sistem Durumu</label>
                  <select className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={userFilterStatus} onChange={e => setUserFilterStatus(e.target.value)}>
                    <option value="Tümü">Tümü</option>
                    <option value="Aktif">Aktif Kullanıcılar</option>
                    <option value="Pasif">Pasif (Askıda)</option>
                  </select>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden flex flex-col relative z-0">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="min-w-full divide-y divide-gray-200 text-left whitespace-nowrap">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-600 border-r border-gray-200 w-16 text-center">Profil</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-600 border-r border-gray-200">Kullanıcı Adı</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-600 border-r border-gray-200 text-center">Sistem Rolü</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-600 border-r border-gray-200 text-center">Durum</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-600 text-center w-32">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-blue-50/40 transition-colors group">
                          <td className="px-6 py-3 border-r border-gray-100 flex justify-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${u.active ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                              {(u.username || "?").charAt(0).toUpperCase()}
                            </div>
                          </td>
                          <td className="px-6 py-3 border-r border-gray-100 text-sm font-medium text-gray-900">{u.username}</td>
                          <td className="px-6 py-3 border-r border-gray-100 text-center">
                            <span className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                              u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {u.role === 'admin' ? 'Admin' : 'Satış'}
                            </span>
                          </td>
                          <td className="px-6 py-3 border-r border-gray-100 text-center">
                            <span className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${
                              u.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-300'
                            }`}>
                              {u.active ? 'Aktif' : 'Pasif'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => { setUserForm({ id: u.id, username: u.username, role: u.role, active: u.active }); setIsUserModalOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded border border-transparent hover:border-blue-200 transition-colors" title="Kullanıcıyı Düzenle">
                                <Edit size={16} />
                              </button>
                              <button onClick={() => handleToggleUserStatus(u)} className={`p-1.5 rounded border border-transparent transition-colors ${u.active ? 'text-amber-600 hover:bg-amber-100 hover:border-amber-200' : 'text-emerald-600 hover:bg-emerald-100 hover:border-emerald-200'}`} title={u.active ? "Pasife Al (Erişimi Kes)" : "Aktif Et (Erişim Ver)"}>
                                {u.active ? <PowerOff size={16} /> : <Power size={16} />}
                              </button>
                              <button onClick={() => handleDeleteUser(u.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded border border-transparent hover:border-red-200 transition-colors" title="Kalıcı Olarak Sil">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && <div className="py-10 text-center text-sm text-gray-500">Kriterlere uygun kullanıcı bulunamadı.</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ======================= MODALS ======================= */}

      {/* USER MODAL */}
      {isUserModalOpen && currentUser?.role === 'admin' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded shadow-2xl w-full max-w-lg border border-gray-300 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Shield size={18} className="text-blue-600" />
                <h3 className="text-base font-semibold text-gray-800">{userForm.id ? "Kullanıcı Profili Düzenle" : "Yeni Profil Kaydı"}</h3>
              </div>
              <button onClick={() => setIsUserModalOpen(false)} className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"><X size={20} /></button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2 text-blue-700 text-xs font-medium mb-4">
                <Info size={16} className="mt-0.5 flex-shrink-0" />
                <p>Güvenlik nedeniyle şifre ve e-posta tanımlamaları yalnızca Supabase "Authentication" paneli üzerinden yapılmalıdır. Bu alandan sadece sistem içi profil bilgileri yönetilir.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kullanıcı Adı (Sistemde Görünecek İsim)</label>
                <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={userForm.username || ''} onChange={e => setUserForm({...userForm, username: e.target.value})} placeholder="Örn: Ayşe Demir" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Kullanıcı Rolü (Yetki)</label>
                  <select className="w-full px-3 py-2 border border-blue-300 bg-blue-50/30 rounded text-sm focus:outline-none focus:border-blue-500 font-medium text-blue-900" value={userForm.role || 'sales'} onChange={e => setUserForm({...userForm, role: e.target.value})}>
                    <option value="sales">Satış Personeli</option>
                    <option value="admin">Sistem Yöneticisi (Admin)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Sistem Durumu</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={userForm.active ? 'true' : 'false'} onChange={e => setUserForm({...userForm, active: e.target.value === 'true'})}>
                    <option value="true">Aktif (Sistemi Kullanabilir)</option>
                    <option value="false">Pasif (Erişim Engelli)</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded text-sm font-medium hover:bg-gray-100 transition-colors">İptal</button>
              <button onClick={handleSaveUser} className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
                <CheckSquare size={16} /> Profili Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEAD MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded shadow-2xl w-full max-w-5xl flex flex-col h-[90vh] sm:h-[85vh] border border-gray-300 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3"><Edit size={18} className="text-blue-600" /><h3 className="text-base font-semibold text-gray-800">{leadForm.id ? `Kayıt Düzenle: ${leadForm.name}` : "Yeni Müşteri Adayı Kaydı"}</h3></div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              <div className="flex-1 p-6 overflow-y-auto custom-scrollbar border-r border-gray-200 flex flex-col bg-white">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">Müşteri Detayları</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Ad Soyad</label><input type="text" className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={leadForm.name} onChange={e => setLeadForm({...leadForm, name: e.target.value})} /></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Telefon</label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input type="text" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={leadForm.phone} onChange={e => handlePhoneChange(e.target.value)} /></div></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Dil</label><select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={leadForm.language} onChange={e => setLeadForm({...leadForm, language: e.target.value})}>{LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Kaynak</label><select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={leadForm.source} onChange={e => setLeadForm({...leadForm, source: e.target.value})}>{LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Durum</label><select className="w-full px-3 py-2 border border-blue-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-blue-50/50 text-blue-900 font-semibold" value={leadForm.status} onChange={e => setLeadForm({...leadForm, status: e.target.value})}>{LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Alt Durum</label><select className="w-full px-3 py-2 border border-blue-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-blue-50/50 text-blue-900 font-semibold" value={leadForm.stage} onChange={e => setLeadForm({...leadForm, stage: e.target.value})}>{LEAD_STAGES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Temsilci</label><select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={leadForm.owner_id} onChange={e => setLeadForm({...leadForm, owner_id: e.target.value})}><option value="">Seçiniz...</option>{appUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}</select></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Verilen Teklif</label><div className="relative"><CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input type="text" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500 font-semibold" value={leadForm.quote || ''} onChange={e => setLeadForm({...leadForm, quote: e.target.value})} /></div></div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200 shrink-0">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-blue-700 mb-2"><MessageSquare size={14} /> YENİ GÖRÜŞME NOTU EKLE</label>
                  <textarea rows="3" className="w-full px-3 py-2 border border-blue-200 rounded text-sm focus:outline-none focus:border-blue-500 resize-none bg-blue-50/30 text-gray-800" value={leadForm.pendingNote} onChange={e => setLeadForm({...leadForm, pendingNote: e.target.value})}></textarea>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200 shrink-0">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-2"><Bell size={14} /> HATIRLATICI EKLE</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="w-24 px-3 py-2 border border-amber-200 rounded text-sm focus:outline-none focus:border-amber-500 bg-amber-50/30 text-gray-800"
                      value={reminderAmount}
                      onChange={e => setReminderAmount(e.target.value)}
                    />
                    <select
                      className="px-3 py-2 border border-amber-200 rounded text-sm focus:outline-none focus:border-amber-500 bg-amber-50/30 text-gray-800"
                      value={reminderUnit}
                      onChange={e => setReminderUnit(e.target.value)}
                    >
                      <option value="saat">Saat</option>
                      <option value="gun">Gün</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddReminder}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-sm font-medium transition-colors"
                    >
                      Hatırlatıcı Ekle
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-80 bg-gray-50 p-0 flex flex-col border-t md:border-t-0 border-gray-200 shrink-0">
                <div className="p-4 border-b border-gray-200 bg-gray-100 flex items-center justify-between shrink-0">
                  <h4 className="text-xs font-bold text-gray-600 uppercase flex items-center gap-1.5"><History size={14}/> İşlem & Not Geçmişi</h4>
                  <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-300">{leadForm.notes?.length || 0} Kayıt</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {leadForm.notes && leadForm.notes.length > 0 ? (
                    leadForm.notes.map((n) => {
                      const noteAuthor = appUsers.find(u => u.id === n.author_id)?.username || "Bilinmiyor";
                      return (
                        <div key={n.id} className="bg-white p-3 rounded border border-gray-200 shadow-sm relative before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-blue-500 before:rounded-l">
                          <div className="flex justify-between items-start mb-1.5 pl-2">
                            <span className="text-[11px] font-bold text-blue-700">{noteAuthor}</span>
                            <span className="text-[10px] text-gray-500 font-medium">
                              {new Date(n.created_at).toLocaleDateString('tr-TR')} {new Date(n.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 whitespace-pre-wrap pl-2 leading-relaxed">{n.text}</p>
                        </div>
                      )
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center py-10 opacity-60"><Clock size={32} className="text-gray-400 mb-2" /><span className="text-xs text-gray-500 font-medium">Bu müşteri için henüz bir işlem<br/>geçmişi bulunmuyor.</span></div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 border border-gray-300 text-gray-700 bg-white rounded text-sm font-medium hover:bg-gray-100 hover:text-gray-900 transition-colors shadow-sm">Vazgeç</button>
              <button onClick={handleSaveLead} className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"><CheckSquare size={16} /> Değişiklikleri Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSFER MODAL */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded shadow-2xl w-full max-w-sm p-6 border border-gray-300 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-semibold text-gray-800 mb-4 border-b border-gray-100 pb-2 flex items-center gap-2"><Users size={18} className="text-blue-600" /> Toplu Kayıt Aktarımı</h3>
            <div className="space-y-4">
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Seçilen Kayıt Sayısı</label><div className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded border border-blue-100">{selectedLeadIds.length} Lead Aktarılacak</div></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Aktarılacak Temsilci Seçin</label><select className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500" value={targetUserId} onChange={e => setTargetUserId(e.target.value)}><option value="">Lütfen Temsilci Seçiniz...</option>{appUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}</select></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setIsTransferModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50 transition-colors">İptal</button>
              <button onClick={handleBulkTransfer} disabled={!targetUserId} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Aktar</button>
            </div>
          </div>
        </div>
      )}

      {reminders.length > 0 && (
        <div className="fixed bottom-4 right-4 w-80 max-h-[50vh] overflow-auto z-[120] space-y-2">
          {reminders.map((reminder) => {
            const leadName = leads.find((l) => l.id === reminder.lead_id)?.name || "Bilinmeyen Lead";
            return (
              <div key={reminder.id} className="bg-white border border-amber-300 rounded-lg shadow-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-amber-700 flex items-center gap-1">
                      <Bell size={12} /> Hatırlatma Zamanı
                    </p>
                    <button
                      type="button"
                      onClick={() => openLeadFromReminder(reminder)}
                      className="text-sm font-semibold text-left text-blue-700 mt-1 hover:underline"
                      title="Lead kaydını aç"
                    >
                      {leadName}
                    </button>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {new Date(reminder.remind_at).toLocaleDateString("tr-TR")}{" "}
                      {new Date(reminder.remind_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => openLeadFromReminder(reminder, true)}
                      className="text-[11px] px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                    >
                      Kaydı Aç
                    </button>
                    <button
                      type="button"
                      onClick={() => markReminderDone(reminder.id)}
                      className="text-[11px] px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    >
                      Tamamlandı
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 10px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; border: 2px solid #f8fafc; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}

export default App;
