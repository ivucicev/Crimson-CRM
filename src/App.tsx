import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Mail, 
  Building2, 
  Clock, 
  MessageSquare, 
  ChevronRight, 
  X,
  Trash2,
  CheckCircle2,
  Phone,
  MoreHorizontal,
  Bell,
  Calendar,
  CheckCircle,
  FileText,
  Save,
  Settings,
  Sparkles,
  Globe,
  Linkedin,
  Loader2,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactQuill from 'react-quill-new';
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer } from 'react-leaflet';
import * as XLSX from 'xlsx';
import 'react-quill-new/dist/quill.snow.css';
import { Lead, LeadDetail, Reminder, Template, CustomFieldDefinition, Company, ResearchCandidate } from './types';

const STATUS_COLORS = {
  'New': 'bg-blue-100 text-blue-700 border-blue-200',
  'Contacted': 'bg-amber-100 text-amber-700 border-amber-200',
  'Qualified': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Closed': 'bg-slate-100 text-slate-700 border-slate-200',
};
const STATUS_LABELS: Record<'New' | 'Contacted' | 'Qualified' | 'Closed', string> = {
  New: 'Novi',
  Contacted: 'Kontaktiran',
  Qualified: 'Kvalificiran',
  Closed: 'Zatvoren',
};
const TAB_LABELS: Record<'History' | 'Contacts' | 'Reminders' | 'Custom' | 'Activity' | 'Company', string> = {
  History: 'Povijest',
  Contacts: 'Kontakti',
  Company: 'Tvrtka',
  Reminders: 'Podsjetnici',
  Custom: 'Prilagođeno',
  Activity: 'Aktivnosti',
};

export default function App() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [leadDetail, setLeadDetail] = useState<LeadDetail | null>(null);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [isManagingTemplates, setIsManagingTemplates] = useState(false);
  const [isImportingData, setIsImportingData] = useState(false);
  const [isManagingFields, setIsManagingFields] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isResearchingCompanyContacts, setIsResearchingCompanyContacts] = useState(false);
  const [isScrapingLinkedIn, setIsScrapingLinkedIn] = useState(false);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [isGeneratingSubject, setIsGeneratingSubject] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEditingLead, setIsEditingLead] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isResearchReviewOpen, setIsResearchReviewOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<'crm' | 'registry'>('crm');
  const [isSearchingCroatiaCompanies, setIsSearchingCroatiaCompanies] = useState(false);
  const [isSyncingCroatiaCompanies, setIsSyncingCroatiaCompanies] = useState(false);
  const [activeTab, setActiveTab] = useState<'History' | 'Contacts' | 'Reminders' | 'Custom' | 'Activity' | 'Company'>('History');
  const [leadSortMode, setLeadSortMode] = useState<'smart' | 'next_task' | 'newest' | 'activity'>('smart');
  const [searchQuery, setSearchQuery] = useState('');
  const [newComm, setNewComm] = useState({ type: 'Note', content: '', subject: '' });
  const [newContact, setNewContact] = useState({ name: '', title: '', email: '', linkedin_url: '', bio: '' });
  const [newCompany, setNewCompany] = useState({ name: '', oib: '', mbs: '' });
  const [importText, setImportText] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isRunningAiImport, setIsRunningAiImport] = useState(false);
  const [aiImportReport, setAiImportReport] = useState<{
    summary: {
      companies_created: number;
      companies_matched: number;
      leads_created: number;
      contacts_created: number;
      contacts_matched: number;
      unmatched_count: number;
    };
    imported: Array<{ company: string; lead_id: number; company_id: number; contacts_created: number; contacts_matched: number }>;
    unmatched: Array<{ raw?: string; reason?: string }>;
  } | null>(null);
  const [editingLead, setEditingLead] = useState({
    name: '',
    email: '',
    title: '',
    bio: '',
    website: '',
    linkedin_url: '',
    company_id: ''
  });
  const [newReminder, setNewReminder] = useState({ task: '', due_at: '' });
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [newFieldName, setNewFieldName] = useState('');
  const [researchRunId, setResearchRunId] = useState('');
  const [researchCandidates, setResearchCandidates] = useState<(ResearchCandidate & { selected: boolean })[]>([]);
  const [croatiaCompanyQuery, setCroatiaCompanyQuery] = useState('');
  const [croatiaCompanyResults, setCroatiaCompanyResults] = useState<Array<{
    name: string;
    oib?: string;
    mbs?: string;
    court?: string;
    city?: string;
    county?: string;
    status?: string;
    website?: string;
  }>>([]);
  const [croatiaNkds, setCroatiaNkds] = useState<Array<{ code: string; name?: string }>>([]);
  const [croatiaCounties, setCroatiaCounties] = useState<Array<{ slug: string; name: string; file: string }>>([]);
  const [croatiaNkdQuery, setCroatiaNkdQuery] = useState('');
  const [selectedCroatiaNkds, setSelectedCroatiaNkds] = useState<string[]>([]);
  const [selectedCroatiaNkdMode, setSelectedCroatiaNkdMode] = useState<'any' | 'primary' | 'secondary'>('any');
  const [selectedCroatiaCounty, setSelectedCroatiaCounty] = useState('');
  const [selectedCroatiaCity, setSelectedCroatiaCity] = useState('');
  const [croatiaCountyGeoJson, setCroatiaCountyGeoJson] = useState<any>(null);
  const [isLoadingCroatiaCountyGeoJson, setIsLoadingCroatiaCountyGeoJson] = useState(false);
  const [isLoadingCompanyDetail, setIsLoadingCompanyDetail] = useState(false);
  const [companyAddressQuery, setCompanyAddressQuery] = useState('');
  const [companyAddressCoords, setCompanyAddressCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [isGeocodingCompanyAddress, setIsGeocodingCompanyAddress] = useState(false);
  const [branchMapPoints, setBranchMapPoints] = useState<Array<{ name: string; address: string; lat: number; lon: number }>>([]);
  const [isGeocodingBranches, setIsGeocodingBranches] = useState(false);
  const [crmCompanyAddressQuery, setCrmCompanyAddressQuery] = useState('');
  const [crmCompanyAddressCoords, setCrmCompanyAddressCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [isGeocodingCrmCompanyAddress, setIsGeocodingCrmCompanyAddress] = useState(false);
  const [crmBranchMapPoints, setCrmBranchMapPoints] = useState<Array<{ name: string; address: string; lat: number; lon: number }>>([]);
  const [isGeocodingCrmBranches, setIsGeocodingCrmBranches] = useState(false);
  const [selectedRegistryMbs, setSelectedRegistryMbs] = useState<string>('');
  const [registryDetailError, setRegistryDetailError] = useState<string | null>(null);
  const [selectedCompanyDetail, setSelectedCompanyDetail] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; email: string; tenant?: { id: number; name: string } } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', confirmPassword: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [inviteTenantName, setInviteTenantName] = useState<string | null>(null);
  const [tenantMembers, setTenantMembers] = useState<Array<{ id: number; email: string; role: string }>>([]);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [reminderNotificationsEnabled, setReminderNotificationsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('crmReminderNotificationsEnabled') === '1';
  });
  const [croatiaSyncStatus, setCroatiaSyncStatus] = useState<{
    running: boolean;
    currentPage: number;
    processedCompanies: number;
    importedCompanies: number;
    skippedCompanies?: number;
    cachedCompanies: number;
    cachedNkds?: number;
    importedNkds?: number;
    lastError: string | null;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = String(params.get('invite') || '').trim();
    if (!token) return;
    setInviteToken(token);
    setAuthMode('register');
    fetch(`/api/auth/invite/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Pozivnica nije valjana');
        setInviteTenantName(data?.tenant?.name || null);
      })
      .catch((error: any) => setAuthError(error.message || 'Pozivnica nije valjana'));
  }, []);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          setCurrentUser(null);
          return;
        }
        const data = await res.json();
        setCurrentUser(data.user || null);
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (!authReady || !currentUser) return;
    fetchLeads();
    fetchCompanies();
    fetchTemplates();
    fetchCustomFields();
  }, [authReady, currentUser?.id]);

  useEffect(() => {
    if (!currentUser) {
      setTenantMembers([]);
      return;
    }
    fetch('/api/tenants/members')
      .then((r) => r.json())
      .then((data) => setTenantMembers(Array.isArray(data?.results) ? data.results : []))
      .catch(() => setTenantMembers([]));
  }, [currentUser?.id, currentUser?.tenant?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('crmReminderNotificationsEnabled', reminderNotificationsEnabled ? '1' : '0');
  }, [reminderNotificationsEnabled]);

  useEffect(() => {
    if (!currentUser || !reminderNotificationsEnabled) return;
    const timer = setInterval(() => {
      fetchLeads();
    }, 30_000);
    return () => clearInterval(timer);
  }, [currentUser?.id, reminderNotificationsEnabled]);

  useEffect(() => {
    if (!currentUser) return;
    if (selectedLeadId) {
      fetchLeadDetail(selectedLeadId);
    } else {
      setLeadDetail(null);
    }
  }, [selectedLeadId, currentUser?.id]);

  useEffect(() => {
    if (workspaceMode !== 'registry') return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/registry/hr/sync/status');
        const data = await res.json();
        if (cancelled) return;
        setCroatiaSyncStatus(data);
        setIsSyncingCroatiaCompanies(!!data.running);
      } catch {
        // Ignore transient polling errors in UI loop.
      }
    };

    poll();
    fetch('/api/registry/hr/nkds?limit=150')
      .then((r) => r.json())
      .then((data) => setCroatiaNkds(data.results || []))
      .catch(() => {});
    fetch('/api/registry/hr/counties')
      .then((r) => r.json())
      .then((data) => setCroatiaCounties(data.results || []))
      .catch(() => {});
    setIsLoadingCroatiaCountyGeoJson(true);
    fetch('/api/registry/hr/counties/geojson')
      .then((r) => r.json())
      .then((data) => setCroatiaCountyGeoJson(data || null))
      .catch(() => setCroatiaCountyGeoJson(null))
      .finally(() => setIsLoadingCroatiaCountyGeoJson(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== 'registry') return;
    if (!croatiaCompanyResults.length) {
      setSelectedRegistryMbs('');
      setSelectedCompanyDetail(null);
      return;
    }
    const hasSelected = selectedRegistryMbs && croatiaCompanyResults.some((c) => c.mbs === selectedRegistryMbs);
    if (!hasSelected) {
      const firstMbs = croatiaCompanyResults[0]?.mbs || '';
      if (firstMbs) {
        setSelectedRegistryMbs(firstMbs);
        setSelectedCompanyDetail(null);
      }
    }
  }, [workspaceMode, croatiaCompanyResults]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthSubmitting(true);
    try {
      if (authMode === 'register' && authForm.password !== authForm.confirmPassword) {
        throw new Error('Lozinke se ne podudaraju.');
      }
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authForm.email.trim(),
          password: authForm.password,
          invite_token: authMode === 'register' && inviteToken ? inviteToken : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Prijava nije uspjela');
      }
      setCurrentUser(data.user || null);
      setSelectedLeadId(null);
      setLeadDetail(null);
      setAuthForm({ email: '', password: '', confirmPassword: '' });
    } catch (error: any) {
      setAuthError(error.message || 'Autentikacija nije uspjela');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setCurrentUser(null);
      setSelectedLeadId(null);
      setLeadDetail(null);
      setLeads([]);
      setCompanies([]);
      setTemplates([]);
      setCustomFieldDefs([]);
    }
  };

  const handleCreateInvite = async () => {
    try {
      const res = await fetch('/api/tenants/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_days: 14 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generiranje pozivnice nije uspjelo');
      const url = String(data.invite_url || '');
      if (url && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      alert(url ? `Pozivnica kopirana:\n${url}` : 'Pozivnica je kreirana.');
    } catch (error: any) {
      alert(error.message || 'Generiranje pozivnice nije uspjelo');
    }
  };

  const handleRenameOrganization = async () => {
    if (!currentUser?.tenant?.name) return;
    const name = prompt('Novi naziv organizacije:', currentUser.tenant.name)?.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/tenants/current', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Promjena naziva nije uspjela');
      setCurrentUser((prev) => (prev ? { ...prev, tenant: data.tenant } : prev));
    } catch (error: any) {
      alert(error.message || 'Promjena naziva nije uspjela');
    }
  };

  const requestReminderNotifications = async () => {
    if (typeof Notification === 'undefined') {
      alert('Desktop notifikacije nisu podržane u ovom pregledniku.');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== 'granted') {
      alert('Notifikacije nisu odobrene.');
      return;
    }
    setReminderNotificationsEnabled(true);
  };

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (!currentUser || !reminderNotificationsEnabled || notificationPermission !== 'granted') return;

    const storageKey = 'crmSentReminderNotifications';
    const readSent = (): Record<string, number> => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : {};
        return typeof parsed === 'object' && parsed ? parsed : {};
      } catch {
        return {};
      }
    };
    const writeSent = (data: Record<string, number>) => {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    };
    const sent = readSent();
    const now = Date.now();

    for (const [key, ts] of Object.entries(sent)) {
      if (!Number.isFinite(ts) || now - Number(ts) > 7 * 24 * 60 * 60 * 1000) {
        delete sent[key];
      }
    }

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const triggerNotification = (leadName: string, company: string, uniqueKey: string) => {
      const latest = readSent();
      if (latest[uniqueKey]) return;
      const notification = new Notification(`Podsjetnik: ${leadName}`, {
        body: company ? `Tvrtka: ${company}` : 'Imate dospio podsjetnik.',
      });
      notification.onclick = () => window.focus();
      latest[uniqueKey] = Date.now();
      writeSent(latest);
    };

    leads.forEach((lead) => {
      if (!lead.next_task_due_at) return;
      const dueTs = new Date(lead.next_task_due_at).getTime();
      if (!Number.isFinite(dueTs)) return;
      const uniqueKey = `lead-${lead.id}-${lead.next_task_due_at}`;
      if (dueTs <= now) {
        triggerNotification(lead.name, lead.company || '', uniqueKey);
        return;
      }
      const delay = Math.min(dueTs - now, 2_147_000_000);
      timers.push(
        setTimeout(() => {
          triggerNotification(lead.name, lead.company || '', uniqueKey);
        }, delay)
      );
    });

    writeSent(sent);
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [leads, currentUser?.id, reminderNotificationsEnabled, notificationPermission]);

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm('Ukloniti ovog člana iz organizacije?')) return;
    try {
      const res = await fetch(`/api/tenants/members/${memberId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Uklanjanje člana nije uspjelo');
      setTenantMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (error: any) {
      alert(error.message || 'Uklanjanje člana nije uspjelo');
    }
  };

  const fetchLeads = async () => {
    const res = await fetch('/api/leads');
    const data = await res.json();
    setLeads(data);
  };

  const fetchCompanies = async () => {
    const res = await fetch('/api/companies');
    const data = await res.json();
    setCompanies(data);
  };

  const fetchTemplates = async () => {
    const res = await fetch('/api/templates');
    const data = await res.json();
    setTemplates(data);
  };

  const fetchCustomFields = async () => {
    const res = await fetch('/api/custom-fields');
    const data = await res.json();
    setCustomFieldDefs(data);
  };

  const fetchLeadDetail = async (id: number) => {
    const res = await fetch(`/api/leads/${id}`);
    const data = await res.json();
    setLeadDetail(data);
  };

  const parseJsonFromText = (text: string) => {
    const cleaned = text.replace(/```json|```/gi, '').trim();
    return JSON.parse(cleaned);
  };

  const generateWithAI = async (prompt: string, json = false): Promise<string> => {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, json }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'AI generation failed');
    }
    return data.text || '';
  };

  const handleEnrichLead = async () => {
    if (!leadDetail) return;
    setIsEnriching(true);
    try {
      const text = await generateWithAI(
        `Find professional information about ${leadDetail.name} who works at ${leadDetail.company}.
Return JSON with keys: title, bio, website, linkedin_url.
Only include fields you are reasonably confident about.`,
        true
      );
      const enrichedData = parseJsonFromText(text);
      
      await fetch(`/api/leads/${leadDetail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...enrichedData,
          enriched_at: new Date().toISOString()
        }),
      });

      fetchLeadDetail(leadDetail.id);
      fetchLeads();
    } catch (error) {
      console.error("Enrichment failed:", error);
      alert("Obogaćivanje podataka nije uspjelo. Pokušajte ponovno.");
    } finally {
      setIsEnriching(false);
    }
  };

  const handleLinkedInScrape = async () => {
    if (!leadDetail) return;
    setIsScrapingLinkedIn(true);
    try {
      const text = await generateWithAI(
        `Find the LinkedIn profile for ${leadDetail.name} at ${leadDetail.company}.
Return JSON with keys: title, bio, website, linkedin_url.
If linkedin_url is unknown, set it to an empty string.`,
        true
      );
      const scrapedData = parseJsonFromText(text);
      
      await fetch(`/api/leads/${leadDetail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...scrapedData,
          enriched_at: new Date().toISOString()
        }),
      });

      fetchLeadDetail(leadDetail.id);
      fetchLeads();
    } catch (error) {
      console.error("LinkedIn scrape failed:", error);
      alert("Dohvat LinkedIn podataka nije uspio.");
    } finally {
      setIsScrapingLinkedIn(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId) {
      alert('Prvo odaberite lead tvrtke.');
      return;
    }
    await fetch(`/api/leads/${selectedLeadId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newContact),
    });
    setIsAddingLead(false);
    setNewContact({ name: '', title: '', email: '', linkedin_url: '', bio: '' });
    fetchLeadDetail(selectedLeadId);
  };

  const createCompany = async (): Promise<{ companyId: number; leadId: number } | null> => {
    const payload = {
      name: newCompany.name.trim(),
      oib: newCompany.oib.trim(),
      mbs: newCompany.mbs.trim(),
    };
    if (!payload.name && !payload.oib && !payload.mbs) {
      alert('Unesite barem jedan podatak: naziv tvrtke, OIB ili MBS.');
      return null;
    }
    const res = await fetch('/api/registry/hr/companies/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Brzi uvoz tvrtke nije uspio');
      return null;
    }
    return { companyId: data.company_id as number, leadId: data.lead_id as number };
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await createCompany();
    if (!created) return;

    setNewCompany({ name: '', oib: '', mbs: '' });
    setIsAddingCompany(false);
    setSelectedLeadId(created.leadId);
    fetchLeads();
    fetchCompanies();
  };

  const handleAddCompanyAndResearch = async () => {
    const created = await createCompany();
    if (!created) return;

    setSelectedLeadId(created.leadId);
    setNewCompany({ name: '', oib: '', mbs: '' });
    setIsAddingCompany(false);
    await handleResearchCompanyContacts(created.companyId);
    fetchLeadDetail(created.leadId);
    fetchCompanies();
  };

  const handleRunAiImport = async () => {
    if (!importText.trim() && !importFile) {
      alert('Unesite tekst ili odaberite datoteku za uvoz.');
      return;
    }
    setIsRunningAiImport(true);
    try {
      let payload: any = null;
      if (importFile) {
        const fileName = importFile.name.toLowerCase();
        const isImage = importFile.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(fileName);
        const isCsvOrText = /(\.csv|\.txt)$/i.test(fileName) || importFile.type.includes('csv') || importFile.type.startsWith('text/');
        const isExcel = /(\.xlsx|\.xls)$/i.test(fileName) || importFile.type.includes('spreadsheet') || importFile.type.includes('excel');

        if (isImage) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Čitanje slike nije uspjelo'));
            reader.readAsDataURL(importFile);
          });
          payload = { input_type: 'screenshot', image_data_url: dataUrl };
        } else if (isCsvOrText) {
          const content = await importFile.text();
          payload = { input_type: fileName.endsWith('.csv') ? 'csv' : 'text', content };
        } else if (isExcel) {
          const buffer = await importFile.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) throw new Error('Excel datoteka nema sheet.');
          const worksheet = workbook.Sheets[firstSheetName];
          const csv = XLSX.utils.sheet_to_csv(worksheet);
          payload = { input_type: 'csv', content: csv };
        } else {
          const content = await importFile.text();
          payload = { input_type: 'text', content };
        }
      } else {
        payload = { input_type: 'text', content: importText.trim() };
      }

      const res = await fetch('/api/import/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI uvoz nije uspio');
      setAiImportReport({
        summary: data.summary,
        imported: data.imported || [],
        unmatched: data.unmatched || [],
      });
      fetchLeads();
      fetchCompanies();
    } catch (error: any) {
      alert(error.message || 'AI uvoz nije uspio');
    } finally {
      setIsRunningAiImport(false);
    }
  };

  const handleSearchCroatiaCompanies = async () => {
    const query = croatiaCompanyQuery.trim();
    const city = selectedCroatiaCity.trim();
    const county = selectedCroatiaCounty.trim();
    setIsSearchingCroatiaCompanies(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (selectedCroatiaNkds.length) params.set('nkd_codes', selectedCroatiaNkds.join(','));
      if (selectedCroatiaNkds.length) params.set('nkd_mode', selectedCroatiaNkdMode);
      if (city) params.set('city', city);
      if (county) params.set('county', county);
      params.set('limit', '500');
      const res = await fetch(`/api/registry/hr/companies/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pretraga hrvatskih tvrtki nije uspjela');
      setCroatiaCompanyResults(data.results || []);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSearchingCroatiaCompanies(false);
    }
  };

  useEffect(() => {
    if (workspaceMode !== 'registry') return;
    handleSearchCroatiaCompanies();
  }, [workspaceMode, croatiaCompanyQuery, selectedCroatiaCity, selectedCroatiaCounty, selectedCroatiaNkds.join('|'), selectedCroatiaNkdMode]);

  useEffect(() => {
    if (workspaceMode !== 'registry') return;
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (croatiaNkdQuery.trim()) params.set('q', croatiaNkdQuery.trim());
      params.set('limit', '300');
      fetch(`/api/registry/hr/nkds?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => setCroatiaNkds(data.results || []))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(timeout);
  }, [workspaceMode, croatiaNkdQuery]);

  useEffect(() => {
    if (workspaceMode !== 'registry' || !selectedCompanyDetail?.structured) {
      setCompanyAddressQuery('');
      setCompanyAddressCoords(null);
      setIsGeocodingCompanyAddress(false);
      return;
    }

    const seat = selectedCompanyDetail.structured?.seat || {};
    const parts = [
      [seat?.ulica, seat?.kucni_broj].filter(Boolean).join(' ').trim(),
      seat?.naziv_naselja,
      seat?.naziv_opcine,
      seat?.naziv_zupanije,
      'Croatia',
    ]
      .map((x: any) => String(x || '').trim())
      .filter(Boolean);
    const query = parts.join(', ');

    if (!query) {
      setCompanyAddressQuery('');
      setCompanyAddressCoords(null);
      setIsGeocodingCompanyAddress(false);
      return;
    }
    setCompanyAddressQuery(query);
    setCompanyAddressCoords(null);
    setIsGeocodingCompanyAddress(true);

    const controller = new AbortController();
    fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then((r) => r.json())
      .then((rows) => {
        const first = Array.isArray(rows) ? rows[0] : null;
        const lat = Number(first?.lat);
        const lon = Number(first?.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          setCompanyAddressCoords({ lat, lon });
        }
      })
      .catch(() => {})
      .finally(() => setIsGeocodingCompanyAddress(false));

    return () => controller.abort();
  }, [workspaceMode, selectedCompanyDetail?.mbs, selectedCompanyDetail?.structured]);

  useEffect(() => {
    if (workspaceMode !== 'registry' || !selectedCompanyDetail?.structured) {
      setBranchMapPoints([]);
      setIsGeocodingBranches(false);
      return;
    }
    const branches = Array.isArray(selectedCompanyDetail.structured?.branches) ? selectedCompanyDetail.structured.branches : [];
    if (!branches.length) {
      setBranchMapPoints([]);
      setIsGeocodingBranches(false);
      return;
    }

    const buildAddress = (b: any) => {
      const seat = b?.sjediste_podruznice || {};
      return [
        [seat?.ulica, seat?.kucni_broj].filter(Boolean).join(' ').trim(),
        seat?.naziv_naselja,
        seat?.naziv_opcine,
        seat?.naziv_zupanije,
        'Croatia',
      ]
        .map((x: any) => String(x || '').trim())
        .filter(Boolean)
        .join(', ');
    };

    const controller = new AbortController();
    setBranchMapPoints([]);
    setIsGeocodingBranches(true);

    const limited = branches.slice(0, 25);
    Promise.all(
      limited.map(async (b: any) => {
        const name = String(b?.skraceni_naziv_podruznice?.ime || b?.naziv_podruznice?.ime || 'Podružnica').trim();
        const address = buildAddress(b);
        if (!address) return null;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
            { signal: controller.signal, headers: { Accept: 'application/json' } }
          );
          const rows = await res.json();
          const first = Array.isArray(rows) ? rows[0] : null;
          const lat = Number(first?.lat);
          const lon = Number(first?.lon);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            return { name, address, lat, lon };
          }
          return null;
        } catch {
          return null;
        }
      })
    )
      .then((points) => setBranchMapPoints(points.filter((p): p is { name: string; address: string; lat: number; lon: number } => !!p)))
      .finally(() => setIsGeocodingBranches(false));

    return () => controller.abort();
  }, [workspaceMode, selectedCompanyDetail?.mbs, selectedCompanyDetail?.structured?.branches]);

  useEffect(() => {
    if (workspaceMode !== 'crm' || !leadDetail?.company_registry_structured) {
      setCrmCompanyAddressQuery('');
      setCrmCompanyAddressCoords(null);
      setIsGeocodingCrmCompanyAddress(false);
      return;
    }
    const seat = leadDetail.company_registry_structured?.seat || {};
    const query = [
      [seat?.ulica, seat?.kucni_broj].filter(Boolean).join(' ').trim(),
      seat?.naziv_naselja,
      seat?.naziv_opcine,
      seat?.naziv_zupanije,
      'Croatia',
    ]
      .map((x: any) => String(x || '').trim())
      .filter(Boolean)
      .join(', ');
    if (!query) {
      setCrmCompanyAddressQuery('');
      setCrmCompanyAddressCoords(null);
      setIsGeocodingCrmCompanyAddress(false);
      return;
    }
    setCrmCompanyAddressQuery(query);
    setCrmCompanyAddressCoords(null);
    setIsGeocodingCrmCompanyAddress(true);
    const controller = new AbortController();
    fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then((r) => r.json())
      .then((rows) => {
        const first = Array.isArray(rows) ? rows[0] : null;
        const lat = Number(first?.lat);
        const lon = Number(first?.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          setCrmCompanyAddressCoords({ lat, lon });
        }
      })
      .catch(() => {})
      .finally(() => setIsGeocodingCrmCompanyAddress(false));
    return () => controller.abort();
  }, [workspaceMode, leadDetail?.id, leadDetail?.company_registry_structured?.seat]);

  useEffect(() => {
    if (workspaceMode !== 'crm' || !leadDetail?.company_registry_structured) {
      setCrmBranchMapPoints([]);
      setIsGeocodingCrmBranches(false);
      return;
    }
    const branches = Array.isArray(leadDetail.company_registry_structured?.branches)
      ? leadDetail.company_registry_structured.branches
      : [];
    if (!branches.length) {
      setCrmBranchMapPoints([]);
      setIsGeocodingCrmBranches(false);
      return;
    }
    const buildAddress = (b: any) => {
      const seat = b?.sjediste_podruznice || {};
      return [
        [seat?.ulica, seat?.kucni_broj].filter(Boolean).join(' ').trim(),
        seat?.naziv_naselja,
        seat?.naziv_opcine,
        seat?.naziv_zupanije,
        'Croatia',
      ]
        .map((x: any) => String(x || '').trim())
        .filter(Boolean)
        .join(', ');
    };
    const controller = new AbortController();
    setCrmBranchMapPoints([]);
    setIsGeocodingCrmBranches(true);
    Promise.all(
      branches.slice(0, 25).map(async (b: any) => {
        const name = String(b?.skraceni_naziv_podruznice?.ime || b?.naziv_podruznice?.ime || 'Podružnica').trim();
        const address = buildAddress(b);
        if (!address) return null;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          });
          const rows = await res.json();
          const first = Array.isArray(rows) ? rows[0] : null;
          const lat = Number(first?.lat);
          const lon = Number(first?.lon);
          if (Number.isFinite(lat) && Number.isFinite(lon)) return { name, address, lat, lon };
          return null;
        } catch {
          return null;
        }
      })
    )
      .then((points) => setCrmBranchMapPoints(points.filter((p): p is { name: string; address: string; lat: number; lon: number } => !!p)))
      .finally(() => setIsGeocodingCrmBranches(false));
    return () => controller.abort();
  }, [workspaceMode, leadDetail?.id, leadDetail?.company_registry_structured?.branches]);

  const handleImportCroatiaCompany = async (candidate: {
    name: string;
    oib?: string;
    mbs?: string;
    website?: string;
  }) => {
    const payload = {
      name: String(candidate?.name || '').trim(),
      oib: String(candidate?.oib || '').trim(),
      mbs: String(candidate?.mbs || '').trim(),
      website: String(candidate?.website || '').trim(),
    };
    const res = await fetch('/api/registry/hr/companies/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Uvoz tvrtke nije uspio');
      return;
    }
    setSelectedLeadId(data.lead_id);
    fetchLeads();
    fetchCompanies();
    alert('Tvrtka je uvezena u CRM.');
  };

  const handleOpenCompanyDetail = async (mbs?: string) => {
    if (!mbs) return;
    setSelectedRegistryMbs(mbs);
    setRegistryDetailError(null);
    setIsLoadingCompanyDetail(true);
    try {
      const res = await fetch(`/api/registry/hr/companies/${encodeURIComponent(mbs)}/detail`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Učitavanje detalja tvrtke nije uspjelo');
      setSelectedCompanyDetail(data);
    } catch (error: any) {
      setRegistryDetailError(error.message);
    } finally {
      setIsLoadingCompanyDetail(false);
    }
  };

  const handleResearchCompanyContacts = async (companyId: number) => {
    setIsResearchingCompanyContacts(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/research-contacts`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Istraživanje kontakata nije uspjelo');
      const candidates = (data.contacts || []).map((c: ResearchCandidate) => ({ ...c, selected: true }));
      if (!candidates.length) {
        alert('Nisu pronađeni kandidati visoke pouzdanosti za ovu tvrtku.');
        return;
      }
      setResearchRunId(data.run_id || '');
      setResearchCandidates(candidates);
      setIsResearchReviewOpen(true);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsResearchingCompanyContacts(false);
    }
  };

  const handleApproveResearchCandidates = async () => {
    if (!selectedLeadId) return;
    const approved = researchCandidates.filter(c => c.selected);
    if (!approved.length) {
      alert('Odaberite barem jednog kandidata.');
      return;
    }
    const res = await fetch(`/api/leads/${selectedLeadId}/contacts/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        research_run_id: researchRunId,
        contacts: approved.map(({ selected, ...rest }) => rest),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Dodavanje odobrenih kontakata nije uspjelo');
      return;
    }
    setIsResearchReviewOpen(false);
    setResearchCandidates([]);
    setResearchRunId('');
    alert(`Dodano odobrenih kontakata: ${data.created}.`);
    if (selectedLeadId) fetchLeadDetail(selectedLeadId);
  };

  const startEditLead = () => {
    if (!leadDetail) return;
    setEditingLead({
      name: leadDetail.name || '',
      email: leadDetail.email || '',
      title: leadDetail.title || '',
      bio: leadDetail.bio || '',
      website: leadDetail.website || '',
      linkedin_url: leadDetail.linkedin_url || '',
      company_id: leadDetail.company_id ? String(leadDetail.company_id) : ''
    });
    setIsEditingLead(true);
  };

  const handleSaveLeadEdit = async () => {
    if (!leadDetail) return;
    await fetch(`/api/leads/${leadDetail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editingLead,
        company_id: editingLead.company_id ? parseInt(editingLead.company_id, 10) : null
      }),
    });
    setIsEditingLead(false);
    fetchLeadDetail(leadDetail.id);
    fetchLeads();
  };

  const handleAddComm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId || !newComm.content) return;
    await fetch(`/api/leads/${selectedLeadId}/communications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: newComm.type, content: newComm.content }),
    });
    setNewComm({ type: 'Note', content: '', subject: '' });
    fetchLeadDetail(selectedLeadId);
  };

  const handleSendEmail = async () => {
    if (!leadDetail || !newComm.content || !newComm.subject) return;
    setIsSendingEmail(true);
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadDetail.id,
          to: leadDetail.email,
          subject: newComm.subject,
          content: newComm.content
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send email');
      }
      
      alert("E-mail je uspješno poslan.");
      setNewComm({ type: 'Note', content: '', subject: '' });
      fetchLeadDetail(leadDetail.id);
    } catch (error: any) {
      console.error("Send failed:", error);
      alert(error.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleGenerateTemplate = async () => {
    if (!leadDetail) return;
    setIsGeneratingTemplate(true);
    try {
      const text = await generateWithAI(`Generate a professional, personalized outreach email template for a lead.
        Lead Name: ${leadDetail.name}
        Company: ${leadDetail.company}
        Bio/Context: ${leadDetail.bio || 'N/A'}
        Industry: ${leadDetail.title || 'N/A'}
        
        The email should be concise, friendly, and focused on starting a conversation.`,
      );
      setNewComm(prev => ({ ...prev, type: 'Email', content: text || '' }));
    } catch (error) {
      console.error("Generation failed:", error);
      alert("Generiranje predloška nije uspjelo.");
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  const handleGenerateSubject = async () => {
    if (!leadDetail || !newComm.content) return;
    setIsGeneratingSubject(true);
    try {
      const text = await generateWithAI(`Based on the following email content and lead company, generate a single compelling email subject line.
        Company: ${leadDetail.company}
        Email Content: ${newComm.content}
        
        Return ONLY the subject line text.`,
      );
      setNewComm(prev => ({ ...prev, subject: text.trim() || prev.subject }));
    } catch (error) {
      console.error("Subject generation failed:", error);
    } finally {
      setIsGeneratingSubject(false);
    }
  };

  const handleUpdateCustomValue = async (fieldId: number, value: string) => {
    if (!selectedLeadId) return;
    await fetch(`/api/leads/${selectedLeadId}/custom-values`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field_id: fieldId, value }),
    });
  };

  const handleAddFieldDef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName) return;
    await fetch('/api/custom-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newFieldName }),
    });
    setNewFieldName('');
    fetchCustomFields();
    if (selectedLeadId) fetchLeadDetail(selectedLeadId);
  };

  const handleDeleteFieldDef = async (id: number) => {
    if (!confirm('Obrisati ovo polje za sve leadove?')) return;
    await fetch(`/api/custom-fields/${id}`, { method: 'DELETE' });
    fetchCustomFields();
    if (selectedLeadId) fetchLeadDetail(selectedLeadId);
  };

  const handleSaveTemplate = async () => {
    if (!newComm.content) return;
    const name = prompt('Unesite naziv predloška:');
    if (!name) return;
    
    await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content: newComm.content }),
    });
    fetchTemplates();
  };

  const handleDeleteTemplate = async (id: number) => {
    await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    fetchTemplates();
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId || !newReminder.task || !newReminder.due_at) return;
    await fetch(`/api/leads/${selectedLeadId}/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReminder),
    });
    setNewReminder({ task: '', due_at: '' });
    fetchLeadDetail(selectedLeadId);
  };

  const handleToggleReminder = async (id: number, completed: boolean) => {
    await fetch(`/api/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    if (selectedLeadId) fetchLeadDetail(selectedLeadId);
  };

  const handleDeleteReminder = async (id: number) => {
    await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    if (selectedLeadId) fetchLeadDetail(selectedLeadId);
  };

  const handleUpdateStatus = async (id: number, status: Lead['status']) => {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchLeads();
    if (selectedLeadId === id) fetchLeadDetail(id);
  };

  const handleUpdateAssignment = async (id: number, assigned_to: string) => {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Dodjela nije uspjela');
      return;
    }
    if (selectedLeadId === id) fetchLeadDetail(id);
  };

  const handleDeleteLead = async (id: number) => {
    if (!confirm('Jeste li sigurni da želite obrisati ovaj lead?')) return;
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    setSelectedLeadId(null);
    fetchLeads();
  };

  const toTs = (value?: string | null) => {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const filteredLeads = leads
    .filter(l =>
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.email?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const now = Date.now();
      const aNext = toTs(a.next_task_due_at);
      const bNext = toTs(b.next_task_due_at);
      const aHasNext = aNext > 0;
      const bHasNext = bNext > 0;
      const aOverdue = aHasNext && aNext < now;
      const bOverdue = bHasNext && bNext < now;
      const aLast = toTs(a.last_activity_at);
      const bLast = toTs(b.last_activity_at);
      const aCreated = toTs(a.created_at);
      const bCreated = toTs(b.created_at);

      if (leadSortMode === 'newest') return bCreated - aCreated;
      if (leadSortMode === 'next_task') {
        if (aHasNext !== bHasNext) return aHasNext ? -1 : 1;
        if (aHasNext && bHasNext) return aNext - bNext;
        return bCreated - aCreated;
      }
      if (leadSortMode === 'activity') return bLast - aLast;

      // smart
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      if (aHasNext !== bHasNext) return aHasNext ? -1 : 1;
      if (aHasNext && bHasNext && aNext !== bNext) return aNext - bNext;
      if ((a.has_activity ? 1 : 0) !== (b.has_activity ? 1 : 0)) return (b.has_activity ? 1 : 0) - (a.has_activity ? 1 : 0);
      if (aLast !== bLast) return bLast - aLast;
      return bCreated - aCreated;
    });

  const fmtDate = (value?: string | null) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  };

  const renderValue = (value?: any) => (value === null || value === undefined || value === '' ? 'N/A' : String(value));
  const fmtShortDate = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  };
  const parseCompanyEmails = (raw?: string) => {
    if (!raw) return [] as string[];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x || '').trim()).filter(Boolean);
      }
      return [];
    } catch {
      return [];
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-paper text-ink font-sans flex items-center justify-center">
        <div className="text-sm text-slate-500">Učitavanje...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-slate-100 text-ink font-sans flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-crimson-700 to-rose-600 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/80">Crimson CRM</p>
                <h1 className="text-xl font-bold">{authMode === 'login' ? 'Prijava' : 'Registracija'}</h1>
              </div>
            </div>
            {inviteToken && (
              <p className="text-xs mt-3 text-white/90">
                Pozivnica za organizaciju: <span className="font-semibold">{inviteTenantName || 'Učitavanje...'}</span>
              </p>
            )}
          </div>
          <div className="p-6 space-y-5">
          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
            />
            <input
              type="password"
              placeholder="Lozinka"
              value={authForm.password}
              onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
            />
            {authMode === 'register' && (
              <input
                type="password"
                placeholder="Ponovi lozinku"
                value={authForm.confirmPassword}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
              />
            )}
            {authError && <p className="text-xs text-red-600">{authError}</p>}
            <button
              type="submit"
              disabled={isAuthSubmitting}
              className="w-full bg-crimson-600 hover:bg-crimson-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold"
            >
              {isAuthSubmitting ? 'Molimo pričekajte...' : authMode === 'login' ? 'Prijavi se' : 'Registriraj se'}
            </button>
          </form>
          {!inviteToken && (
            <button
              type="button"
              onClick={() => {
                setAuthError(null);
                setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'));
              }}
              className="text-xs text-crimson-700 font-semibold"
            >
              {authMode === 'login' ? 'Nemaš račun? Registriraj se' : 'Već imaš račun? Prijavi se'}
            </button>
          )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-crimson-600 rounded-lg flex items-center justify-center">
            <Users className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Crimson</h1>
          <div className="ml-3 flex items-center gap-1 bg-slate-100 p-1 rounded-full">
            <button
              onClick={() => setWorkspaceMode('crm')}
              className={`px-3 py-1 text-xs font-bold rounded-full ${workspaceMode === 'crm' ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}
            >
              CRM
            </button>
            <button
              onClick={() => setWorkspaceMode('registry')}
              className={`px-3 py-1 text-xs font-bold rounded-full ${workspaceMode === 'registry' ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}
            >
              Registar
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {workspaceMode === 'crm' ? (
            <>
              <button 
                onClick={() => setIsAddingCompany(true)}
                className="bg-crimson-600 hover:bg-crimson-700 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Uvezi tvrtku
              </button>
              <button
                onClick={() => setIsImportingData(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
              >
                Uvezi podatke
              </button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Pretraži kontakte..." 
                  className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-crimson-500 w-64 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </>
          ) : null}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <details className="relative">
              <summary className="list-none cursor-pointer px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                Račun
              </summary>
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-20">
                <div className="px-3 py-2 border-b border-slate-100 mb-1">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">{currentUser.tenant?.name || 'Organizacija'}</p>
                  <p className="text-[11px] text-slate-700 truncate">{currentUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMembersOpen(true)}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-50"
                >
                  Članovi
                </button>
                <button
                  type="button"
                  onClick={handleCreateInvite}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-50"
                >
                  Pozovi korisnika
                </button>
                <button
                  type="button"
                  onClick={handleRenameOrganization}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-50"
                >
                  Uredi organizaciju
                </button>
                {notificationPermission !== 'granted' ? (
                  <button
                    type="button"
                    onClick={requestReminderNotifications}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-50"
                  >
                    Omogući notifikacije
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReminderNotificationsEnabled((prev) => !prev)}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-50"
                  >
                    {reminderNotificationsEnabled ? 'Isključi notifikacije' : 'Uključi notifikacije'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-50 text-red-700"
                >
                  Odjava
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className={`${workspaceMode === 'crm' ? 'max-w-7xl grid' : 'hidden'} mx-auto p-6 grid-cols-12 gap-6 h-[calc(100vh-80px)]`}>
        {/* Leads List */}
        <div className="col-span-4 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lead pregled ({filteredLeads.length})</h2>
            <select
              value={leadSortMode}
              onChange={(e) => setLeadSortMode(e.target.value as 'smart' | 'next_task' | 'newest' | 'activity')}
              className="text-[11px] px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 outline-none"
              title="Sortiranje leadova"
            >
              <option value="smart">Pametno</option>
              <option value="next_task">Po zadatku</option>
              <option value="activity">Po aktivnosti</option>
              <option value="newest">Najnoviji</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredLeads.map(lead => {
              const nextTask = lead.next_task_due_at ? new Date(lead.next_task_due_at) : null;
              const isOverdue = !!(nextTask && nextTask.getTime() < Date.now());
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`w-full text-left p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedLeadId === lead.id ? 'bg-crimson-50/50 border-l-4 border-l-crimson-600' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{lead.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{lead.company || 'Bez tvrtke'}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[lead.status]}`}>
                      {STATUS_LABELS[lead.status]}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                    <span className="inline-flex items-center gap-1" title={`Dodano: ${fmtDate(lead.created_at)}`}>
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {fmtShortDate(lead.created_at)}
                    </span>
                    <span className="inline-flex items-center gap-1" title={lead.first_contacted_at ? `Prvi kontakt: ${fmtDate(lead.first_contacted_at)}` : 'Prvi kontakt nije evidentiran'}>
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                      {fmtShortDate(lead.first_contacted_at)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${isOverdue ? 'text-red-600 font-semibold' : ''}`}
                      title={lead.next_task_due_at ? `Idući zadatak: ${fmtDate(lead.next_task_due_at)}` : 'Nema otvorenih zadataka'}
                    >
                      <Bell className={`w-3.5 h-3.5 ${isOverdue ? 'text-red-500' : 'text-slate-400'}`} />
                      {fmtShortDate(lead.next_task_due_at)}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      title={lead.has_activity ? `Zadnja aktivnost: ${fmtDate(lead.last_activity_at || null)}` : 'Nema aktivnosti'}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${lead.has_activity ? 'text-emerald-500' : 'text-slate-300'}`} />
                      {lead.has_activity ? 'Aktivno' : 'Bez aktivnosti'}
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredLeads.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Nema pronađenih leadova</p>
              </div>
            )}
          </div>
        </div>

        {/* Lead Detail */}
        <div className="col-span-8 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
          <AnimatePresence mode="wait">
            {leadDetail ? (
              <motion.div 
                key={leadDetail.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col h-full"
              >
                {/* Detail Header */}
                <div className="relative p-6 border-b border-slate-100 flex items-start justify-between">
                  <div className="flex-1 pr-12">
                    <div className="flex flex-wrap items-center gap-3 mb-2 pr-8">
                      <h2 className="text-2xl font-bold text-ink">{leadDetail.name}</h2>
                      <select 
                        value={leadDetail.status}
                        onChange={(e) => handleUpdateStatus(leadDetail.id, e.target.value as Lead['status'])}
                        className={`text-xs px-3 py-1 rounded-full border font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-crimson-500/20 ${STATUS_COLORS[leadDetail.status]}`}
                      >
                        <option value="New">Novi</option>
                        <option value="Contacted">Kontaktiran</option>
                        <option value="Qualified">Kvalificiran</option>
                        <option value="Closed">Zatvoren</option>
                      </select>
                      <button
                        onClick={handleEnrichLead}
                        disabled={isEnriching}
                        className="flex items-center gap-1.5 px-3 py-1 bg-crimson-50 text-crimson-600 border border-crimson-100 rounded-full text-xs font-bold hover:bg-crimson-100 transition-all disabled:opacity-50"
                      >
                        {isEnriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {isEnriching ? 'Obogaćujem...' : 'Obogati lead'}
                      </button>
                      <button
                        onClick={handleLinkedInScrape}
                        disabled={isScrapingLinkedIn}
                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-bold hover:bg-blue-100 transition-all disabled:opacity-50"
                      >
                        {isScrapingLinkedIn ? <Loader2 className="w-3 h-3 animate-spin" /> : <Linkedin className="w-3 h-3" />}
                        {isScrapingLinkedIn ? 'Dohvaćam...' : 'LinkedIn dohvat'}
                      </button>
                      <button
                        onClick={() => {
                          if (!leadDetail.company_id) {
                            alert('Prvo povežite ovaj kontakt s tvrtkom pa pokrenite istraživanje.');
                            return;
                          }
                          handleResearchCompanyContacts(leadDetail.company_id);
                        }}
                        disabled={isResearchingCompanyContacts}
                        className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
                      >
                        {isResearchingCompanyContacts ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                        {isResearchingCompanyContacts ? 'Istražujem...' : 'Istraži osobe'}
                      </button>
                      <div className="flex items-center gap-2 sm:ml-auto">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Dodijeljeno</span>
                        <select 
                          value={leadDetail.assigned_to || ''}
                          onChange={(e) => handleUpdateAssignment(leadDetail.id, e.target.value)}
                          className="text-xs px-3 py-1 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-crimson-500/20"
                        >
                          <option value="">Nedodijeljeno</option>
                          {tenantMembers.map((member) => (
                            <option key={member.id} value={member.email}>
                              {member.email}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    {leadDetail.title && (
                      <p className="text-sm font-medium text-slate-700 mb-2">{leadDetail.title}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4" /> {leadDetail.company}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-4 h-4" /> {leadDetail.email}
                      </span>
                      {leadDetail.website && (
                        <a href={leadDetail.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-crimson-600 hover:underline">
                          <Globe className="w-4 h-4" /> Web stranica
                        </a>
                      )}
                      {!leadDetail.website && leadDetail.company_website && (
                        <a href={leadDetail.company_website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-crimson-600 hover:underline">
                          <Globe className="w-4 h-4" /> Web tvrtke
                        </a>
                      )}
                      {leadDetail.linkedin_url && (
                        <a href={leadDetail.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline">
                          <Linkedin className="w-4 h-4" /> LinkedIn
                        </a>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> Added {new Date(leadDetail.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {(leadDetail.company_oib || leadDetail.company_mbs || leadDetail.company_city || leadDetail.company_county || leadDetail.company_address || leadDetail.company_primary_nkd_code || leadDetail.company_legal_form) && (
                      <div className="mt-4 p-3 bg-white rounded-xl border border-slate-200">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Uvezeni podaci iz registra</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                          <p>OIB: <span className="text-slate-800">{leadDetail.company_oib || 'N/A'}</span></p>
                          <p>MBS: <span className="text-slate-800">{leadDetail.company_mbs || 'N/A'}</span></p>
                          <p>Grad: <span className="text-slate-800">{leadDetail.company_city || 'N/A'}</span></p>
                          <p>Županija: <span className="text-slate-800">{leadDetail.company_county || 'N/A'}</span></p>
                          <p className="col-span-2">Adresa: <span className="text-slate-800">{leadDetail.company_address || 'N/A'}</span></p>
                          <p className="col-span-2">Sud: <span className="text-slate-800">{leadDetail.company_court || 'N/A'}</span></p>
                          <p className="col-span-2">Pravni oblik: <span className="text-slate-800">{leadDetail.company_legal_form || 'N/A'}</span></p>
                          <p className="col-span-2">Primarni NKD: <span className="text-slate-800">{leadDetail.company_primary_nkd_code || 'N/A'}{leadDetail.company_primary_nkd_name ? ` - ${leadDetail.company_primary_nkd_name}` : ''}</span></p>
                        </div>
                        {parseCompanyEmails(leadDetail.company_registry_emails).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {parseCompanyEmails(leadDetail.company_registry_emails).map((email) => (
                              <a
                                key={email}
                                href={`mailto:${email}`}
                                className="px-2 py-1 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 hover:underline"
                              >
                                {email}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {(leadDetail.company_registry_detail || leadDetail.company_registry_raw_json) && (
                      <details className="mt-4 rounded-xl border border-slate-200 bg-white">
                        <summary className="cursor-pointer px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Potpuni uvezeni podaci iz registra
                        </summary>
                        <div className="px-3 pb-3 space-y-2">
                          {leadDetail.company_registry_structured && (
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                              <p>Procedures: <span className="text-slate-800">{(leadDetail.company_registry_structured?.status_procedures || []).length}</span></p>
                              <p>Branches: <span className="text-slate-800">{(leadDetail.company_registry_structured?.branches || []).length}</span></p>
                              <p>Activities: <span className="text-slate-800">{(leadDetail.company_registry_structured?.activities?.evidencijske_djelatnosti || []).length}</span></p>
                              <p>GFI Reports: <span className="text-slate-800">{(leadDetail.company_registry_structured?.financial_reports || []).length}</span></p>
                            </div>
                          )}
                          <pre className="text-xs leading-relaxed bg-slate-950 text-slate-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(leadDetail.company_registry_detail || (() => { try { return JSON.parse(leadDetail.company_registry_raw_json || 'null'); } catch { return null; } })(), null, 2)}
                          </pre>
                        </div>
                      </details>
                    )}

                    {leadDetail.bio && (
                      <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-xs text-slate-600 leading-relaxed italic">"{leadDetail.bio}"</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteLead(leadDetail.id)}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-crimson-600 hover:bg-crimson-50 rounded-lg border border-slate-100 bg-white transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 px-6 bg-white">
                  {['History', 'Contacts', 'Company', 'Reminders', 'Custom', 'Activity'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={`px-4 py-3 text-xs font-bold transition-all border-b-2 -mb-px ${activeTab === tab ? 'border-crimson-600 text-crimson-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                      {TAB_LABELS[tab as keyof typeof TAB_LABELS]}
                    </button>
                  ))}
                </div>

                {/* Content Tabs/Sections */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                  {activeTab === 'History' && (
                    <div className="max-w-3xl mx-auto space-y-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-crimson-500" />
                          Povijest komunikacije
                        </h3>
                      </div>

                      {/* Add Comm Form */}
                      <form onSubmit={handleAddComm} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-8">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex gap-2">
                            {['Note', 'Email', 'Call'].map(type => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setNewComm(prev => ({ ...prev, type, subject: type === 'Email' ? (prev.subject || 'Nastavak komunikacije iz Crimson CRM') : '' }))}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${newComm.type === type ? 'bg-crimson-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                          {newComm.type === 'Email' && templates.length > 0 && (
                            <select 
                              onChange={(e) => {
                                const template = templates.find(t => t.id === Number(e.target.value));
                                if (template) setNewComm(prev => ({ ...prev, content: template.content }));
                              }}
                              className="text-[10px] px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-crimson-500"
                            >
                              <option value="">Primijeni predložak...</option>
                              {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        
                        {newComm.type === 'Email' && (
                          <div className="relative mb-3">
                            <input
                              type="text"
                              placeholder="Predmet e-maila"
                              className="w-full pl-3 pr-24 py-2 text-sm border border-slate-100 rounded-lg focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none"
                              value={newComm.subject}
                              onChange={(e) => setNewComm(prev => ({ ...prev, subject: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={handleGenerateSubject}
                              disabled={isGeneratingSubject || !newComm.content}
                              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-bold text-amber-500 hover:text-amber-600 disabled:opacity-50"
                            >
                              {isGeneratingSubject ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              Predloži
                            </button>
                          </div>
                        )}

                        {newComm.type === 'Email' ? (
                          <div className="mb-4">
                            <ReactQuill 
                              theme="snow"
                              value={newComm.content}
                              onChange={(content) => setNewComm(prev => ({ ...prev, content }))}
                              placeholder="Napiši e-mail..."
                              className="bg-white rounded-lg overflow-hidden border border-slate-100"
                              modules={{
                                toolbar: [
                                  [{ 'header': [1, 2, false] }],
                                  ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                                  [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'indent': '+1'}],
                                  ['link'],
                                  ['clean']
                                ],
                              }}
                            />
                          </div>
                        ) : (
                          <textarea
                            placeholder="Zabilježi novu interakciju..."
                            className="w-full p-3 text-sm border border-slate-100 rounded-lg focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none min-h-[80px] resize-none mb-4"
                            value={newComm.content}
                            onChange={(e) => setNewComm(prev => ({ ...prev, content: e.target.value }))}
                          />
                        )}

                        <div className="flex justify-between mt-3">
                          <div className="flex gap-3">
                            <button 
                              type="button"
                              onClick={handleSaveTemplate}
                              disabled={!newComm.content}
                              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-crimson-600 transition-colors disabled:opacity-0"
                            >
                              <Save className="w-3 h-3" />
                              Spremi kao predložak
                            </button>
                            <button 
                              type="button"
                              onClick={handleGenerateTemplate}
                              disabled={isGeneratingTemplate}
                              className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 hover:text-amber-600 transition-colors"
                            >
                              {isGeneratingTemplate ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              AI generiraj
                            </button>
                            {newComm.type === 'Email' && (
                              <button 
                                type="button"
                                onClick={() => setIsPreviewOpen(true)}
                                disabled={!newComm.content}
                                className="flex items-center gap-1.5 text-[10px] font-bold text-blue-500 hover:text-blue-600 transition-colors"
                              >
                                <FileText className="w-3 h-3" />
                                Pregled
                              </button>
                            )}
                          </div>
                          
                          <div className="flex gap-2">
                            {newComm.type === 'Email' && (
                              <button 
                                type="button"
                                onClick={handleSendEmail}
                                disabled={!newComm.content || !newComm.subject || isSendingEmail}
                                className="bg-crimson-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-crimson-700 disabled:opacity-50 transition-all flex items-center gap-2"
                              >
                                {isSendingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                Pošalji e-mail
                              </button>
                            )}
                            <button 
                              type="submit"
                              disabled={!newComm.content}
                              className="bg-ink text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition-all"
                            >
                              Zabilježi aktivnost
                            </button>
                          </div>
                        </div>
                      </form>

                      {/* History List */}
                      <div className="space-y-4">
                        {leadDetail.communications.map(comm => (
                          <div key={comm.id} className="flex gap-4 group">
                            <div className="flex flex-col items-center">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                                comm.type === 'Call' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                                comm.type === 'Email' ? 'bg-purple-50 border-purple-100 text-purple-600' :
                                'bg-slate-50 border-slate-100 text-slate-600'
                              }`}>
                                {comm.type === 'Call' ? <Phone className="w-4 h-4" /> :
                                 comm.type === 'Email' ? <Mail className="w-4 h-4" /> :
                                 <MessageSquare className="w-4 h-4" />}
                              </div>
                              <div className="w-px flex-1 bg-slate-200 my-1 group-last:hidden" />
                            </div>
                            <div className="flex-1 pb-6">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-ink">{comm.type}</span>
                                <span className="text-[10px] text-slate-400">{new Date(comm.created_at).toLocaleString()}</span>
                              </div>
                              <p className="text-sm text-slate-600 leading-relaxed">{comm.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'Contacts' && (
                    <div className="max-w-2xl mx-auto space-y-3">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-600" />
                          Kontakti tvrtke
                        </h3>
                        <button
                          onClick={() => setIsAddingLead(true)}
                          className="text-xs font-bold text-crimson-600 hover:text-crimson-700"
                        >
                          + Dodaj kontakt
                        </button>
                      </div>
                      {leadDetail.contacts?.map((contact) => (
                        <div key={contact.id} className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-ink">{contact.name}</p>
                              {contact.title && <p className="text-xs text-slate-500">{contact.title}</p>}
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm('Obrisati ovaj kontakt?')) return;
                                await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
                                if (selectedLeadId) fetchLeadDetail(selectedLeadId);
                              }}
                              className="text-slate-300 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="mt-2 space-y-1">
                            {contact.email && <p className="text-xs text-slate-600">{contact.email}</p>}
                            {contact.linkedin_url && (
                              <a className="text-xs text-blue-600 hover:underline" href={contact.linkedin_url} target="_blank" rel="noreferrer">
                                LinkedIn
                              </a>
                            )}
                            {contact.source_url && (
                              <a className="block text-xs text-emerald-700 hover:underline" href={contact.source_url} target="_blank" rel="noreferrer">
                                Evidence
                              </a>
                            )}
                            {typeof contact.confidence === 'number' && (
                              <p className="text-[10px] text-slate-400">Confidence: {Math.round(contact.confidence * 100)}%</p>
                            )}
                            {contact.bio && <p className="text-xs text-slate-500">{contact.bio}</p>}
                          </div>
                        </div>
                      ))}
                      {(!leadDetail.contacts || leadDetail.contacts.length === 0) && (
                        <div className="text-center py-10 text-slate-400 text-sm">Još nema kontakata za ovu tvrtku.</div>
                      )}
                    </div>
                  )}

                  {activeTab === 'Company' && (
                    <div className="max-w-4xl mx-auto space-y-3">
                      {!leadDetail.company_registry_structured ? (
                        <div className="text-center py-10 text-slate-400 text-sm">
                          Još nema uvezenih detalja tvrtke. Prvo uvezite tvrtku iz Registra.
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Identifikatori</p>
                              <p className="text-sm text-ink mt-1">MBS: {renderValue(leadDetail.company_registry_structured?.ids?.potpuni_mbs || leadDetail.company_registry_structured?.ids?.mbs || leadDetail.company_mbs)}</p>
                              <p className="text-sm text-ink">OIB: {renderValue(leadDetail.company_registry_structured?.ids?.potpuni_oib || leadDetail.company_registry_structured?.ids?.oib || leadDetail.company_oib)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Vremenska crta</p>
                              <p className="text-sm text-ink mt-1">Osnovano: {fmtDate(leadDetail.company_registry_structured?.dates?.datum_osnivanja)}</p>
                              <p className="text-sm text-ink">Zadnja promjena: {fmtDate(leadDetail.company_registry_structured?.dates?.vrijeme_zadnje_izmjene)}</p>
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-white border border-slate-200">
                            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Tvrtka</p>
                            <p className="text-sm text-ink mt-1">Puni naziv: {renderValue(leadDetail.company_registry_structured?.company_name?.tvrtka?.ime)}</p>
                            <p className="text-sm text-ink">Skraćeni naziv: {renderValue(leadDetail.company_registry_structured?.company_name?.skracena_tvrtka?.ime)}</p>
                            <p className="text-sm text-ink">Postupak: {renderValue(leadDetail.company_registry_structured?.postupak)}</p>
                            <p className="text-sm text-ink">Pravni oblik: {renderValue(leadDetail.company_registry_structured?.legal_form?.naziv || leadDetail.company_registry_structured?.legal_form)}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-white border border-slate-200">
                            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Sjedište</p>
                              <p className="text-sm text-ink mt-1">{renderValue(leadDetail.company_registry_structured?.seat?.ulica)} {renderValue(leadDetail.company_registry_structured?.seat?.kucni_broj)}</p>
                              <p className="text-sm text-ink">{renderValue(leadDetail.company_registry_structured?.seat?.naziv_naselja)}, {renderValue(leadDetail.company_registry_structured?.seat?.naziv_zupanije)}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-white border border-slate-200">
                            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Sudovi</p>
                              <p className="text-sm text-ink mt-1">Nadlezan: {renderValue(leadDetail.company_registry_structured?.courts?.sud_nadlezan?.naziv)}</p>
                              <p className="text-sm text-ink">Sluzba: {renderValue(leadDetail.company_registry_structured?.courts?.sud_sluzba?.naziv)}</p>
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-white border border-slate-200">
                            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Karta adrese</p>
                            <p className="text-xs text-slate-600 mt-1">{crmCompanyAddressQuery || 'Adresa nije dostupna'}</p>
                            <div className="mt-2 h-56 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                              {!isGeocodingCrmCompanyAddress && crmCompanyAddressCoords ? (
                                <MapContainer center={[crmCompanyAddressCoords.lat, crmCompanyAddressCoords.lon]} zoom={14} scrollWheelZoom className="h-full w-full">
                                  <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                  <CircleMarker center={[crmCompanyAddressCoords.lat, crmCompanyAddressCoords.lon]} radius={8} pathOptions={{ color: '#be123c', fillColor: '#f43f5e', fillOpacity: 0.7 }}>
                                    <Popup>{crmCompanyAddressQuery || 'Adresa tvrtke'}</Popup>
                                  </CircleMarker>
                                </MapContainer>
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                                  {isGeocodingCrmCompanyAddress ? 'Lociram adresu...' : 'Karta adrese nije dostupna'}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-white border border-slate-200">
                            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">NKD</p>
                            <p className="text-sm text-ink mt-1">Primarno: {renderValue(leadDetail.company_registry_structured?.primary_activity?.sifra)} - {renderValue(leadDetail.company_registry_structured?.primary_activity?.puni_naziv)}</p>
                          </div>

                          <details className="rounded-xl border border-slate-200 bg-white">
                            <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                              Statusni Postupci ({(leadDetail.company_registry_structured?.status_procedures || []).length})
                            </summary>
                            <div className="px-3 pb-3 max-h-64 overflow-y-auto space-y-2">
                              {(leadDetail.company_registry_structured?.status_procedures || []).map((sp: any, i: number) => (
                                <div key={`crm-sp-${i}`} className="text-xs text-slate-700 border-b border-slate-100 pb-2">
                                  <p className="font-semibold text-slate-800">{renderValue(sp?.vrsta_statusnog_postupka?.naziv)} #{renderValue(sp?.statusni_postupak_rbr)}</p>
                                  <p className="mt-1">{renderValue(sp?.tekst)}</p>
                                </div>
                              ))}
                            </div>
                          </details>

                          <details className="rounded-xl border border-slate-200 bg-white">
                            <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                              Podružnice ({(leadDetail.company_registry_structured?.branches || []).length})
                            </summary>
                            <div className="px-3 pb-3 space-y-3">
                              <div className="max-h-52 overflow-y-auto space-y-2">
                                {(leadDetail.company_registry_structured?.branches || []).map((b: any, i: number) => (
                                  <div key={`crm-branch-${i}`} className="text-xs text-slate-700 border-b border-slate-100 pb-2">
                                    <p className="font-semibold text-slate-800">{renderValue(b?.naziv_podruznice?.ime || b?.skraceni_naziv_podruznice?.ime)}</p>
                                    <p>{renderValue(b?.skraceni_naziv_podruznice?.ime)}</p>
                                    <p className="mt-1">{renderValue(b?.sjediste_podruznice?.ulica)} {renderValue(b?.sjediste_podruznice?.kucni_broj)}, {renderValue(b?.sjediste_podruznice?.naziv_naselja)}, {renderValue(b?.sjediste_podruznice?.naziv_zupanije)}</p>
                                  </div>
                                ))}
                              </div>
                              <div className="h-64 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                                {!isGeocodingCrmBranches && crmBranchMapPoints.length > 0 ? (
                                  <MapContainer
                                    center={[
                                      crmBranchMapPoints.reduce((sum, p) => sum + p.lat, 0) / crmBranchMapPoints.length,
                                      crmBranchMapPoints.reduce((sum, p) => sum + p.lon, 0) / crmBranchMapPoints.length,
                                    ]}
                                    zoom={7}
                                    scrollWheelZoom
                                    className="h-full w-full"
                                  >
                                    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                    {crmBranchMapPoints.map((p, idx) => (
                                      <CircleMarker key={`crm-branch-point-${idx}`} center={[p.lat, p.lon]} radius={6} pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.75 }}>
                                        <Popup>
                                          <div>
                                            <p className="font-semibold">{p.name}</p>
                                            <p>{p.address}</p>
                                          </div>
                                        </Popup>
                                      </CircleMarker>
                                    ))}
                                  </MapContainer>
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                                    {isGeocodingCrmBranches ? 'Locating branch addresses...' : 'Branch map unavailable'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </details>

                          <details className="rounded-xl border border-slate-200 bg-slate-50">
                            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">Sirovi Sudreg JSON</summary>
                            <pre className="text-xs leading-relaxed bg-slate-950 text-slate-100 p-4 rounded-b-xl overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(leadDetail.company_registry_detail || (() => { try { return JSON.parse(leadDetail.company_registry_raw_json || 'null'); } catch { return null; } })(), null, 2)}
                            </pre>
                          </details>
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === 'Reminders' && (
                    <div className="max-w-2xl mx-auto space-y-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                          <Bell className="w-4 h-4 text-amber-500" />
                          Zadaci i podsjetnici
                        </h3>
                      </div>

                      {/* Add Reminder Form */}
                      <form onSubmit={handleAddReminder} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-8">
                        <div className="space-y-3">
                          <input
                            type="text"
                            placeholder="Što treba napraviti?"
                            className="w-full p-2.5 text-sm border border-slate-100 rounded-lg focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none"
                            value={newReminder.task}
                            onChange={(e) => setNewReminder(prev => ({ ...prev, task: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input
                                type="datetime-local"
                                className="w-full pl-9 pr-2.5 py-2 text-xs border border-slate-100 rounded-lg focus:ring-2 focus:ring-crimson-500/20 outline-none"
                                value={newReminder.due_at}
                                onChange={(e) => setNewReminder(prev => ({ ...prev, due_at: e.target.value }))}
                              />
                            </div>
                            <button type="submit" className="bg-ink text-white px-6 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-all">
                              Dodaj zadatak
                            </button>
                          </div>
                        </div>
                      </form>

                      {/* Reminder List */}
                      <div className="space-y-3">
                        {leadDetail.reminders.map(reminder => (
                          <div 
                            key={reminder.id} 
                            className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${
                              reminder.completed ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 shadow-sm'
                            }`}
                          >
                            <button 
                              onClick={() => handleToggleReminder(reminder.id, !reminder.completed)}
                              className={`mt-0.5 transition-colors ${reminder.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}`}
                            >
                              {reminder.completed ? <CheckCircle className="w-5 h-5" /> : <div className="w-5 h-5 rounded-full border-2 border-current" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${reminder.completed ? 'line-through text-slate-400' : 'text-ink'}`}>
                                {reminder.task}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Clock className={`w-3 h-3 ${new Date(reminder.due_at) < new Date() && !reminder.completed ? 'text-red-500' : 'text-slate-400'}`} />
                                <span className={`text-[10px] ${new Date(reminder.due_at) < new Date() && !reminder.completed ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                  {new Date(reminder.due_at).toLocaleString()}
                                </span>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleDeleteReminder(reminder.id)}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        {leadDetail.reminders.length === 0 && (
                          <div className="text-center py-12 text-slate-400">
                            <p className="text-sm italic">Nema postavljenih podsjetnika za ovaj lead.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'Custom' && (
                    <div className="max-w-2xl mx-auto space-y-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                          <Plus className="w-4 h-4 text-emerald-500" />
                          Prilagođena polja
                        </h3>
                        <button
                          type="button"
                          onClick={() => setIsManagingFields(true)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          Uredi polja
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-6 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        {leadDetail.custom_fields.map(field => (
                          <div key={field.field_id}>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{field.label}</label>
                            <input 
                              type="text"
                              defaultValue={field.value || ''}
                              onBlur={(e) => handleUpdateCustomValue(field.field_id, e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-crimson-500/20 outline-none"
                              placeholder={`Enter ${field.label}...`}
                            />
                          </div>
                        ))}
                        {leadDetail.custom_fields.length === 0 && (
                          <div className="text-center py-8 text-slate-400">
                            <p className="text-xs italic">Nema definiranih prilagođenih polja. Kliknite "Uredi polja" za dodavanje.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'Activity' && (
                    <div className="max-w-2xl mx-auto space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                          <Clock className="w-4 h-4 text-crimson-600" />
                          Dnevnik aktivnosti
                        </h3>
                      </div>
                      {leadDetail.activity_logs.map(log => (
                        <div key={log.id} className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-crimson-600">{log.action}</span>
                            <span className="text-[10px] text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-600 mb-2">
                            <span className="font-medium text-ink">{log.user_email}</span>
                            <span>made a change</span>
                          </div>
                          {log.old_value && (
                            <div className="flex items-center gap-2 text-[10px] bg-slate-50 p-2 rounded-lg">
                              <span className="text-slate-400 line-through">{log.old_value}</span>
                              <ChevronRight className="w-3 h-3 text-slate-300" />
                              <span className="text-ink font-bold">{log.new_value}</span>
                            </div>
                          )}
                          {!log.old_value && log.new_value && (
                            <div className="text-[10px] bg-slate-50 p-2 rounded-lg">
                              <span className="text-slate-400 mr-1">Value:</span>
                              <span className="text-ink font-bold">{log.new_value}</span>
                            </div>
                          )}
                        </div>
                      ))}
                      {leadDetail.activity_logs.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                          <p className="text-sm italic">Još nema zabilježenih aktivnosti.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <Users className="w-10 h-10 opacity-20" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Odaberite kontakt</h3>
                <p className="max-w-xs text-sm">Choose a contact from the list to view details, activity, and communication history.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {workspaceMode === 'registry' && (
        <main className="max-w-7xl mx-auto p-6 grid grid-cols-12 gap-6 h-[calc(100vh-80px)]">
          <section className="col-span-4 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/60">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filteri registra</h2>
              <p className="text-[11px] text-slate-500 mt-1">Rezultati se automatski osvježavaju dok tipkate.</p>
            </div>
            <div className="p-4 space-y-3 border-b border-slate-100">
              <input
                type="text"
                value={croatiaCompanyQuery}
                onChange={(e) => setCroatiaCompanyQuery(e.target.value)}
                placeholder="Naziv, OIB ili MBS"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-crimson-500/20"
              />
              <input
                type="text"
                value={selectedCroatiaCity}
                onChange={(e) => setSelectedCroatiaCity(e.target.value)}
                placeholder="Grad"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-crimson-500/20"
              />
              <select
                value={selectedCroatiaCounty}
                onChange={(e) => setSelectedCroatiaCounty(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-crimson-500/20"
              >
                <option value="">Sve županije</option>
                {croatiaCounties.map((county) => (
                  <option key={county.slug} value={county.name}>
                    {county.name}
                  </option>
                ))}
              </select>
              <div className="rounded-xl overflow-hidden border border-slate-200">
                <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Croatia Counties</p>
                  {selectedCroatiaCounty && (
                    <button
                      type="button"
                      onClick={() => setSelectedCroatiaCounty('')}
                      className="text-[10px] font-semibold text-crimson-700"
                    >
                      Očisti
                    </button>
                  )}
                </div>
                <div className="h-56 w-full bg-slate-100">
                  {!isLoadingCroatiaCountyGeoJson && croatiaCountyGeoJson ? (
                    <MapContainer center={[45.28, 16.38]} zoom={7} scrollWheelZoom className="h-full w-full">
                      <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <GeoJSON
                        data={croatiaCountyGeoJson}
                        style={(feature) => {
                          const countyName = String(feature?.properties?.county_name || '');
                          const active = countyName && countyName === selectedCroatiaCounty;
                          return {
                            color: active ? '#be123c' : '#334155',
                            weight: active ? 2.2 : 1.2,
                            fillColor: active ? '#f43f5e' : '#94a3b8',
                            fillOpacity: active ? 0.35 : 0.14,
                          };
                        }}
                        onEachFeature={(feature: any, layer: any) => {
                          const countyName = String(feature?.properties?.county_name || '');
                          if (!countyName) return;
                          layer.bindTooltip(countyName, { sticky: true });
                          layer.on({
                            click: () => setSelectedCroatiaCounty(countyName),
                          });
                        }}
                      />
                    </MapContainer>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                      {isLoadingCroatiaCountyGeoJson ? 'Učitavam kartu županija...' : 'Karta županija nije dostupna'}
                    </div>
                  )}
                </div>
              </div>
              <details className="border border-slate-200 rounded-lg bg-slate-50">
                <summary className="px-3 py-2 text-sm font-semibold cursor-pointer select-none">
                  NKD filter {selectedCroatiaNkds.length ? `(${selectedCroatiaNkds.length} odabrano)` : '(nema)'}
                </summary>
                <div className="p-3 border-t border-slate-200 space-y-2">
                  <input
                    type="text"
                    value={croatiaNkdQuery}
                    onChange={(e) => setCroatiaNkdQuery(e.target.value)}
                    placeholder="Pretraži NKD šifru ili naziv..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-crimson-500/20"
                  />
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    {croatiaNkds
                      .filter((nkd) => {
                        if (!croatiaNkdQuery.trim()) return true;
                        const q = croatiaNkdQuery.toLowerCase();
                        return nkd.code.toLowerCase().includes(q) || (nkd.name || '').toLowerCase().includes(q);
                      })
                      .map((nkd) => {
                        const checked = selectedCroatiaNkds.includes(nkd.code);
                        return (
                          <label key={nkd.code} className="flex items-start gap-2 p-2 text-xs hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setSelectedCroatiaNkds((prev) =>
                                  e.target.checked ? [...prev, nkd.code] : prev.filter((x) => x !== nkd.code)
                                );
                              }}
                            />
                            <span>{nkd.code} {nkd.name ? `- ${nkd.name}` : ''}</span>
                          </label>
                        );
                      })}
                  </div>
                  {selectedCroatiaNkds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedCroatiaNkds.map((code) => {
                        const nkd = croatiaNkds.find((n) => n.code === code);
                        return (
                          <button
                            key={code}
                            onClick={() => setSelectedCroatiaNkds((prev) => prev.filter((x) => x !== code))}
                            className="px-2 py-1 text-[10px] rounded-full bg-crimson-50 text-crimson-700 border border-crimson-100"
                          >
                            {code}{nkd?.name ? ` ${nkd.name}` : ''} ×
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setSelectedCroatiaNkds([])}
                        className="px-2 py-1 text-[10px] rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                      >
                        Očisti
                      </button>
                    </div>
                  )}
                </div>
              </details>
              <select
                value={selectedCroatiaNkdMode}
                onChange={(e) => setSelectedCroatiaNkdMode(e.target.value as 'any' | 'primary' | 'secondary')}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-crimson-500/20"
              >
                <option value="any">NKD bilo koji</option>
                <option value="primary">NKD primarni</option>
                <option value="secondary">NKD sekundarni</option>
              </select>
            </div>
            <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500 bg-slate-50/40">
              {isSearchingCroatiaCompanies ? 'Pretražujem...' : `${croatiaCompanyResults.length} tvrtki`}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {croatiaCompanyResults.map((company, index) => {
                const key = `${company.oib || company.mbs || company.name}-${index}`;
                const selected = selectedRegistryMbs && company.mbs === selectedRegistryMbs;
                return (
                  <button
                    key={key}
                    onClick={() => handleOpenCompanyDetail(company.mbs)}
                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selected ? 'bg-crimson-50/40 border-l-4 border-l-crimson-600' : ''}`}
                  >
                    <p className="text-sm font-semibold text-ink truncate">{company.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {company.city || 'Nema grada'}
                      {company.county ? ` · ${company.county}` : ''}
                      {company.mbs ? ` · MBS ${company.mbs}` : ''}
                    </p>
                  </button>
                );
              })}
              {!isSearchingCroatiaCompanies && croatiaCompanyResults.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-sm">Nijedna tvrtka ne odgovara odabranim filterima.</div>
              )}
            </div>
          </section>

          <section className="col-span-8 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detalj tvrtke</h2>
              {selectedCompanyDetail && (
                <button
                  onClick={() => handleImportCroatiaCompany(selectedCompanyDetail)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                >
                  Uvezi tvrtku
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingCompanyDetail && <p className="text-sm text-slate-500">Učitavam detalje...</p>}
              {!isLoadingCompanyDetail && registryDetailError && <p className="text-sm text-red-600">{registryDetailError}</p>}
              {!isLoadingCompanyDetail && !registryDetailError && selectedCompanyDetail && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-2xl font-bold text-ink">{selectedCompanyDetail.name || 'Neimenovana tvrtka'}</h3>
                    <p className="text-xs text-slate-600 mt-1">
                      {selectedCompanyDetail.oib ? `OIB ${selectedCompanyDetail.oib}` : 'Nema OIB'} {selectedCompanyDetail.mbs ? `· MBS ${selectedCompanyDetail.mbs}` : ''}
                    </p>
                  </div>
                  {selectedCompanyDetail?.structured && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Identifikatori</p>
                          <p className="text-sm text-ink mt-1">MBS: {renderValue(selectedCompanyDetail.structured?.ids?.potpuni_mbs || selectedCompanyDetail.structured?.ids?.mbs)}</p>
                          <p className="text-sm text-ink">OIB: {renderValue(selectedCompanyDetail.structured?.ids?.potpuni_oib || selectedCompanyDetail.structured?.ids?.oib)}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Vremenska crta</p>
                          <p className="text-sm text-ink mt-1">Osnovano: {fmtDate(selectedCompanyDetail.structured?.dates?.datum_osnivanja)}</p>
                          <p className="text-sm text-ink">Zadnja promjena: {fmtDate(selectedCompanyDetail.structured?.dates?.vrijeme_zadnje_izmjene)}</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Tvrtka</p>
                        <p className="text-sm text-ink mt-1">
                          Puni naziv: {renderValue(selectedCompanyDetail.structured?.company_name?.tvrtka?.ime)}
                        </p>
                        <p className="text-sm text-ink">
                          Skraćeni naziv: {renderValue(selectedCompanyDetail.structured?.company_name?.skracena_tvrtka?.ime)}
                        </p>
                        <p className="text-sm text-ink">Procedure: {renderValue(selectedCompanyDetail.structured?.postupak)}</p>
                        <p className="text-sm text-ink">
                          Pravni oblik: {renderValue(selectedCompanyDetail.structured?.legal_form?.naziv || selectedCompanyDetail.structured?.legal_form)}
                        </p>
                        <div className="mt-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">E-mail adrese</p>
                          {(selectedCompanyDetail.structured?.emails || selectedCompanyDetail?.emails || []).length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {(selectedCompanyDetail.structured?.emails || selectedCompanyDetail?.emails || []).map((email: string) => (
                                <a
                                  key={email}
                                  href={`mailto:${email}`}
                                  className="px-2 py-1 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 hover:underline"
                                >
                                  {email}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 mt-1">Nisu pronađene službene e-mail adrese.</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Sjedište</p>
                          <p className="text-sm text-ink mt-1">
                            {renderValue(selectedCompanyDetail.structured?.seat?.ulica)} {renderValue(selectedCompanyDetail.structured?.seat?.kucni_broj)}
                          </p>
                          <p className="text-sm text-ink">
                            {renderValue(selectedCompanyDetail.structured?.seat?.naziv_naselja)}, {renderValue(selectedCompanyDetail.structured?.seat?.naziv_zupanije)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Sudovi</p>
                          <p className="text-sm text-ink mt-1">Nadlezan: {renderValue(selectedCompanyDetail.structured?.courts?.sud_nadlezan?.naziv)}</p>
                          <p className="text-sm text-ink">Sluzba: {renderValue(selectedCompanyDetail.structured?.courts?.sud_sluzba?.naziv)}</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Karta adrese</p>
                        <p className="text-xs text-slate-600 mt-1">{companyAddressQuery || 'Adresa nije dostupna'}</p>
                        <div className="mt-2 h-56 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                          {!isGeocodingCompanyAddress && companyAddressCoords ? (
                            <MapContainer center={[companyAddressCoords.lat, companyAddressCoords.lon]} zoom={14} scrollWheelZoom className="h-full w-full">
                              <TileLayer
                                attribution='&copy; OpenStreetMap contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                              />
                              <CircleMarker center={[companyAddressCoords.lat, companyAddressCoords.lon]} radius={8} pathOptions={{ color: '#be123c', fillColor: '#f43f5e', fillOpacity: 0.7 }}>
                                <Popup>{companyAddressQuery || 'Adresa tvrtke'}</Popup>
                              </CircleMarker>
                            </MapContainer>
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                              {isGeocodingCompanyAddress ? 'Lociram adresu...' : 'Karta adrese nije dostupna'}
                            </div>
                          )}
                        </div>
                        {companyAddressQuery && (
                          <a
                            href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(companyAddressQuery)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block mt-2 text-xs font-semibold text-crimson-700 hover:underline"
                          >
                            Otvori u OpenStreetMap
                          </a>
                        )}
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">NKD</p>
                        <p className="text-sm text-ink mt-1">
                          Primarno: {renderValue(selectedCompanyDetail.structured?.primary_activity?.sifra)} - {renderValue(selectedCompanyDetail.structured?.primary_activity?.puni_naziv)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(selectedCompanyDetail.structured?.activities?.nkd_povezane || []).slice(0, 20).map((nkd: any) => (
                            <span key={nkd.code} className="px-2 py-1 rounded-full text-[10px] bg-slate-100 border border-slate-200 text-slate-700">
                              {nkd.code} {nkd.name ? `- ${nkd.name}` : ''} {nkd.relationType ? `(${nkd.relationType})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Evidencijske Djelatnosti</p>
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                          {(selectedCompanyDetail.structured?.activities?.evidencijske_djelatnosti || []).map((a: any, i: number) => (
                            <p key={`a-${i}`} className="text-xs text-slate-700">
                              {renderValue(a?.djelatnost_rbr)}. {renderValue(a?.djelatnost_tekst)}
                            </p>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Kapitali</p>
                          <p className="text-sm text-ink mt-1">{(selectedCompanyDetail.structured?.capitals || []).length}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Statusni postupci</p>
                          <p className="text-sm text-ink mt-1">{(selectedCompanyDetail.structured?.status_procedures || []).length}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">GFI izvještaji</p>
                          <p className="text-sm text-ink mt-1">{(selectedCompanyDetail.structured?.financial_reports || []).length}</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Temeljni kapitali</p>
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-2">
                          {(selectedCompanyDetail.structured?.capitals || []).length > 0 ? (
                            (selectedCompanyDetail.structured?.capitals || []).map((c: any, i: number) => (
                              <div key={`capital-${i}`} className="text-xs text-slate-700">
                                <p>#{renderValue(c?.temeljni_kapital_rbr)}: {renderValue(c?.iznos)} {renderValue(c?.valuta?.naziv || c?.valuta?.sifra)}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-500">Nema zapisa o kapitalu.</p>
                          )}
                        </div>
                      </div>

                      <details className="rounded-xl border border-slate-200 bg-white">
                        <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                          Statusni Postupci ({(selectedCompanyDetail.structured?.status_procedures || []).length})
                        </summary>
                        <div className="px-3 pb-3 max-h-64 overflow-y-auto space-y-2">
                          {(selectedCompanyDetail.structured?.status_procedures || []).length > 0 ? (
                            (selectedCompanyDetail.structured?.status_procedures || []).map((sp: any, i: number) => (
                              <div key={`sp-${i}`} className="text-xs text-slate-700 border-b border-slate-100 pb-2">
                                <p className="font-semibold text-slate-800">
                                  {renderValue(sp?.vrsta_statusnog_postupka?.naziv)} #{renderValue(sp?.statusni_postupak_rbr)}
                                </p>
                                <p className="mt-1">{renderValue(sp?.tekst)}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-500 pt-2">Nema zapisa statusnih postupaka.</p>
                          )}
                        </div>
                      </details>

                      <details className="rounded-xl border border-slate-200 bg-white">
                        <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                          Podružnice ({(selectedCompanyDetail.structured?.branches || []).length})
                        </summary>
                        <div className="px-3 pb-3 space-y-3">
                          <div className="max-h-64 overflow-y-auto space-y-2">
                            {(selectedCompanyDetail.structured?.branches || []).length > 0 ? (
                              (selectedCompanyDetail.structured?.branches || []).map((b: any, i: number) => (
                                <div key={`branch-${i}`} className="text-xs text-slate-700 border-b border-slate-100 pb-2">
                                  <p className="font-semibold text-slate-800">
                                    {renderValue(b?.naziv_podruznice?.ime || b?.skraceni_naziv_podruznice?.ime)}
                                  </p>
                                  <p>{renderValue(b?.skraceni_naziv_podruznice?.ime)}</p>
                                  <p className="mt-1">
                                    {renderValue(b?.sjediste_podruznice?.ulica)} {renderValue(b?.sjediste_podruznice?.kucni_broj)}, {renderValue(b?.sjediste_podruznice?.naziv_naselja)}, {renderValue(b?.sjediste_podruznice?.naziv_zupanije)}
                                  </p>
                                  <p>Postupak: {renderValue(b?.naziv_podruznice?.postupak?.znacenje)}</p>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-500 pt-2">Nema zapisa podružnica.</p>
                            )}
                          </div>
                          <div className="h-64 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                            {!isGeocodingBranches && branchMapPoints.length > 0 ? (
                              <MapContainer
                                center={[
                                  branchMapPoints.reduce((sum, p) => sum + p.lat, 0) / branchMapPoints.length,
                                  branchMapPoints.reduce((sum, p) => sum + p.lon, 0) / branchMapPoints.length,
                                ]}
                                zoom={7}
                                scrollWheelZoom
                                className="h-full w-full"
                              >
                                <TileLayer
                                  attribution='&copy; OpenStreetMap contributors'
                                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                {branchMapPoints.map((p, idx) => (
                                  <CircleMarker
                                    key={`branch-point-${idx}`}
                                    center={[p.lat, p.lon]}
                                    radius={6}
                                    pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.75 }}
                                  >
                                    <Popup>
                                      <div>
                                        <p className="font-semibold">{p.name}</p>
                                        <p>{p.address}</p>
                                      </div>
                                    </Popup>
                                  </CircleMarker>
                                ))}
                              </MapContainer>
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                                {isGeocodingBranches ? 'Lociram adrese podružnica...' : 'Karta podružnica nije dostupna'}
                              </div>
                            )}
                          </div>
                        </div>
                      </details>

                      <details className="rounded-xl border border-slate-200 bg-slate-50">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">Sirovi Sudreg JSON</summary>
                        <pre className="text-xs leading-relaxed bg-slate-950 text-slate-100 p-4 rounded-b-xl overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(selectedCompanyDetail?.detail || selectedCompanyDetail, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              )}
              {!isLoadingCompanyDetail && !registryDetailError && !selectedCompanyDetail && (
                <div className="h-full flex items-center justify-center text-sm text-slate-400">
                  Odaberite tvrtku s lijeve strane za prikaz punih podataka.
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {/* Add Company Modal */}
      <AnimatePresence>
        {isAddingCompany && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingCompany(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-ink">Brzi uvoz tvrtke</h2>
                <button onClick={() => setIsAddingCompany(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleAddCompany} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Naziv tvrtke (opcionalno)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="BYTE OUTPOST d.o.o."
                    value={newCompany.name}
                    onChange={e => setNewCompany(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">OIB (opcionalno)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="15962815542"
                    value={newCompany.oib}
                    onChange={e => setNewCompany(prev => ({ ...prev, oib: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">MBS (opcionalno)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="030188060"
                    value={newCompany.mbs}
                    onChange={e => setNewCompany(prev => ({ ...prev, mbs: e.target.value }))}
                  />
                </div>
                <div className="pt-4">
                  <p className="text-xs text-slate-500 mb-3">
                    Unesite barem jedno polje (naziv, OIB ili MBS). Tvrtka se uvozi iz Sudreg cache-a.
                  </p>
                  <button
                    type="submit"
                    className="w-full bg-crimson-600 hover:bg-crimson-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-crimson-600/20 transition-all active:scale-[0.98]"
                  >
                    Uvezi tvrtku
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCompanyAndResearch}
                    disabled={isResearchingCompanyContacts || (!newCompany.name.trim() && !newCompany.oib.trim() && !newCompany.mbs.trim())}
                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    {isResearchingCompanyContacts ? 'Istražujem osobe...' : 'Uvezi + Istraži osobe'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Import Modal */}
      <AnimatePresence>
        {isImportingData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportingData(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-ink">Uvezi podatke (AI)</h2>
                <button onClick={() => setIsImportingData(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500">
                  Podržano: tekst, CSV, Excel i screenshot.
                </p>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Zalijepite podatke ovdje..."
                  className="w-full min-h-36 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-crimson-500/20"
                />
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls,image/*"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-600"
                />
                {importFile && <p className="text-xs text-slate-500">Odabrano: {importFile.name}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunAiImport}
                    disabled={isRunningAiImport}
                    className="bg-crimson-600 hover:bg-crimson-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {isRunningAiImport ? 'Uvozim...' : 'Pokreni uvoz'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportText('');
                      setImportFile(null);
                      setAiImportReport(null);
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700"
                  >
                    Očisti
                  </button>
                </div>

                {aiImportReport && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-ink">Rezultat uvoza</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                      <p>Tvrtke kreirane: {aiImportReport.summary.companies_created}</p>
                      <p>Tvrtke matchane: {aiImportReport.summary.companies_matched}</p>
                      <p>Leadovi kreirani: {aiImportReport.summary.leads_created}</p>
                      <p>Kontakti kreirani: {aiImportReport.summary.contacts_created}</p>
                      <p>Kontakti matchani: {aiImportReport.summary.contacts_matched}</p>
                      <p>Nematchano: {aiImportReport.summary.unmatched_count}</p>
                    </div>
                    {aiImportReport.unmatched.length > 0 && (
                      <details className="rounded-lg border border-slate-200 bg-white">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">
                          Nematchane stavke ({aiImportReport.unmatched.length})
                        </summary>
                        <div className="px-3 pb-3 space-y-2">
                          {aiImportReport.unmatched.slice(0, 20).map((item, idx) => (
                            <div key={idx} className="text-xs text-slate-600 border border-slate-100 rounded p-2">
                              <p className="font-semibold text-slate-700">{item.reason || 'Nije moguće mapirati'}</p>
                              <p className="mt-1">{item.raw || 'N/A'}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Members Modal */}
      <AnimatePresence>
        {isMembersOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMembersOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-ink">Članovi organizacije</h2>
                <button onClick={() => setIsMembersOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-2 max-h-[60vh] overflow-y-auto">
                {tenantMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
                    <div>
                      <p className="text-sm font-semibold text-ink">{member.email}</p>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">{member.role}</p>
                    </div>
                    {member.id !== currentUser?.id && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.id)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-100 hover:bg-red-100"
                      >
                        Ukloni
                      </button>
                    )}
                  </div>
                ))}
                {tenantMembers.length === 0 && (
                  <p className="text-sm text-slate-500">Nema članova.</p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Lead Modal */}
      <AnimatePresence>
        {isAddingLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingLead(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-ink">Novi kontakt</h2>
                <button onClick={() => setIsAddingLead(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleAddLead} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Puno ime</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="John Doe"
                    value={newContact.name}
                    onChange={e => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Titula</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="VP Sales"
                    value={newContact.title}
                    onChange={e => setNewContact(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">E-mail adresa</label>
                  <input 
                    type="email" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="john@example.com"
                    value={newContact.email}
                    onChange={e => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">LinkedIn URL</label>
                  <input
                    type="url"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="https://linkedin.com/in/..."
                    value={newContact.linkedin_url}
                    onChange={e => setNewContact(prev => ({ ...prev, linkedin_url: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Opis</label>
                  <textarea
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all min-h-[90px]"
                    placeholder="Short background..."
                    value={newContact.bio}
                    onChange={e => setNewContact(prev => ({ ...prev, bio: e.target.value }))}
                  />
                </div>
                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full bg-crimson-600 hover:bg-crimson-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-crimson-600/20 transition-all active:scale-[0.98]"
                  >
                    Dodaj kontakt
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Research Review Modal */}
      <AnimatePresence>
        {isResearchReviewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsResearchReviewOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-ink">Pregled kandidata istraživanja</h2>
                <button onClick={() => setIsResearchReviewOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 max-h-[70vh] overflow-y-auto space-y-3">
                {researchCandidates.map((c, idx) => (
                  <div key={`${c.name}-${idx}`} className="p-4 rounded-xl border border-slate-200 bg-slate-50/40">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={(e) => {
                          const next = [...researchCandidates];
                          next[idx] = { ...c, selected: e.target.checked };
                          setResearchCandidates(next);
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-ink">{c.name}</p>
                        {c.title && <p className="text-xs text-slate-600">{c.title}</p>}
                        {c.email && <p className="text-xs text-slate-600">{c.email}</p>}
                        {c.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 hover:underline">
                            LinkedIn
                          </a>
                        )}
                        <a href={c.source_url} target="_blank" rel="noreferrer" className="block text-xs text-emerald-700 hover:underline">
                          Izvor dokaza
                        </a>
                        <p className="text-[10px] text-slate-400">Pouzdanost: {Math.round((c.confidence || 0) * 100)}%</p>
                        {c.bio && <p className="text-xs text-slate-500 mt-1">{c.bio}</p>}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleApproveResearchCandidates}
                    className="bg-crimson-600 hover:bg-crimson-700 text-white px-4 py-2 rounded-lg text-sm font-bold"
                  >
                    Odobri odabrano
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Contact Modal */}
      <AnimatePresence>
        {isEditingLead && leadDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingLead(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-ink">Uredi lead tvrtke</h2>
                <button onClick={() => setIsEditingLead(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Puno ime</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={editingLead.name}
                    onChange={e => setEditingLead(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tvrtka</label>
                  <select
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={editingLead.company_id}
                    onChange={e => setEditingLead(prev => ({ ...prev, company_id: e.target.value }))}
                  >
                    <option value="">Unlinked</option>
                    {companies.map(company => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">E-mail</label>
                  <input
                    type="email"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={editingLead.email}
                    onChange={e => setEditingLead(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Titula</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={editingLead.title}
                    onChange={e => setEditingLead(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Web stranica</label>
                  <input
                    type="url"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={editingLead.website}
                    onChange={e => setEditingLead(prev => ({ ...prev, website: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">LinkedIn URL</label>
                  <input
                    type="url"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={editingLead.linkedin_url}
                    onChange={e => setEditingLead(prev => ({ ...prev, linkedin_url: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Opis</label>
                  <textarea
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20 min-h-[100px]"
                    value={editingLead.bio}
                    onChange={e => setEditingLead(prev => ({ ...prev, bio: e.target.value }))}
                  />
                </div>
                <button
                  onClick={handleSaveLeadEdit}
                  className="w-full bg-crimson-600 hover:bg-crimson-700 text-white py-3 rounded-xl font-bold transition-all"
                >
                  Spremi promjene
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manage Templates Modal */}
      <AnimatePresence>
        {isManagingTemplates && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManagingTemplates(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-ink">Predlošci e-maila</h2>
                <button onClick={() => setIsManagingTemplates(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                {templates.map(template => (
                  <div key={template.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex items-start justify-between group">
                    <div className="flex-1 min-w-0 pr-4">
                      <h3 className="font-bold text-sm text-ink mb-1">{template.name}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2">{template.content}</p>
                    </div>
                    <button 
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {templates.length === 0 && (
                  <div className="text-center py-12 text-slate-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Još nema spremljenih predložaka.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manage Custom Fields Modal */}
      <AnimatePresence>
        {isManagingFields && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManagingFields(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-ink">Prilagođena polja</h2>
                <button onClick={() => setIsManagingFields(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <form onSubmit={handleAddFieldDef} className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="Naziv polja (npr. Budžet, Izvor)"
                    className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={newFieldName}
                    onChange={e => setNewFieldName(e.target.value)}
                  />
                  <button type="submit" className="bg-crimson-600 text-white px-4 py-2 rounded-xl font-bold">Dodaj</button>
                </form>

                <div className="space-y-2">
                  {customFieldDefs.map(field => (
                    <div key={field.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-sm font-medium text-ink">{field.label}</span>
                      <button onClick={() => handleDeleteFieldDef(field.id)} className="text-slate-300 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {customFieldDefs.length === 0 && (
                    <div className="text-xs text-slate-500 text-center py-3">
                      Nema definiranih polja.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
