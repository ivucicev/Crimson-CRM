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
import 'react-quill-new/dist/quill.snow.css';
import { Lead, LeadDetail, Reminder, Template, CustomFieldDefinition, Company, ResearchCandidate } from './types';

const STATUS_COLORS = {
  'New': 'bg-blue-100 text-blue-700 border-blue-200',
  'Contacted': 'bg-amber-100 text-amber-700 border-amber-200',
  'Qualified': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Closed': 'bg-slate-100 text-slate-700 border-slate-200',
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
  const [activeTab, setActiveTab] = useState<'History' | 'Contacts' | 'Reminders' | 'Custom' | 'Activity'>('History');
  const [searchQuery, setSearchQuery] = useState('');
  const [newComm, setNewComm] = useState({ type: 'Note', content: '', subject: '' });
  const [newContact, setNewContact] = useState({ name: '', title: '', email: '', linkedin_url: '', bio: '' });
  const [newCompany, setNewCompany] = useState({ name: '', website: '' });
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
    status?: string;
    website?: string;
  }>>([]);
  const [croatiaNkds, setCroatiaNkds] = useState<Array<{ code: string; name?: string }>>([]);
  const [croatiaNkdQuery, setCroatiaNkdQuery] = useState('');
  const [selectedCroatiaNkds, setSelectedCroatiaNkds] = useState<string[]>([]);
  const [selectedCroatiaNkdMode, setSelectedCroatiaNkdMode] = useState<'any' | 'primary' | 'secondary'>('any');
  const [selectedCroatiaCity, setSelectedCroatiaCity] = useState('');
  const [selectedCroatiaRegion, setSelectedCroatiaRegion] = useState('');
  const [isLoadingCompanyDetail, setIsLoadingCompanyDetail] = useState(false);
  const [selectedRegistryMbs, setSelectedRegistryMbs] = useState<string>('');
  const [registryDetailError, setRegistryDetailError] = useState<string | null>(null);
  const [selectedCompanyDetail, setSelectedCompanyDetail] = useState<any>(null);
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

  const USER_EMAIL = 'ivucicev@gmail.com';

  useEffect(() => {
    fetchLeads();
    fetchCompanies();
    fetchTemplates();
    fetchCustomFields();
  }, []);

  useEffect(() => {
    if (selectedLeadId) {
      fetchLeadDetail(selectedLeadId);
    } else {
      setLeadDetail(null);
    }
  }, [selectedLeadId]);

  useEffect(() => {
    if (workspaceMode !== 'registry') return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

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
    timer = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
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
        handleOpenCompanyDetail(firstMbs);
      }
    }
  }, [workspaceMode, croatiaCompanyResults]);

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
      alert("Failed to enrich lead data. Please try again.");
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
      alert("Failed to find LinkedIn data.");
    } finally {
      setIsScrapingLinkedIn(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId) {
      alert('Select a company lead first.');
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
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCompany),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to create company');
      return null;
    }
    return { companyId: data.id as number, leadId: data.lead_id as number };
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await createCompany();
    if (!created) return;

    setNewCompany({ name: '', website: '' });
    setIsAddingCompany(false);
    setSelectedLeadId(created.leadId);
    fetchLeads();
    fetchCompanies();
  };

  const handleAddCompanyAndResearch = async () => {
    const created = await createCompany();
    if (!created) return;

    setSelectedLeadId(created.leadId);
    setNewCompany({ name: '', website: '' });
    setIsAddingCompany(false);
    await handleResearchCompanyContacts(created.companyId);
    fetchLeadDetail(created.leadId);
    fetchCompanies();
  };

  const handleSearchCroatiaCompanies = async () => {
    const query = croatiaCompanyQuery.trim();
    const city = selectedCroatiaCity.trim();
    const region = selectedCroatiaRegion.trim();
    setIsSearchingCroatiaCompanies(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (selectedCroatiaNkds.length) params.set('nkd_codes', selectedCroatiaNkds.join(','));
      if (selectedCroatiaNkds.length) params.set('nkd_mode', selectedCroatiaNkdMode);
      if (city) params.set('city', city);
      if (region) params.set('region', region);
      params.set('limit', '100');
      const res = await fetch(`/api/registry/hr/companies/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Croatia company search failed');
      setCroatiaCompanyResults(data.results || []);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSearchingCroatiaCompanies(false);
    }
  };

  useEffect(() => {
    if (workspaceMode !== 'registry') return;
    const timeout = setTimeout(() => {
      handleSearchCroatiaCompanies();
    }, 180);
    return () => clearTimeout(timeout);
  }, [workspaceMode, croatiaCompanyQuery, selectedCroatiaCity, selectedCroatiaRegion, selectedCroatiaNkds.join('|'), selectedCroatiaNkdMode]);

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

  const handleStartCroatiaSync = async () => {
    try {
      const res = await fetch('/api/registry/hr/sync/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start Sudreg sync');
      setCroatiaSyncStatus(data.state || null);
      setIsSyncingCroatiaCompanies(true);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleImportCroatiaCompany = async (candidate: {
    name: string;
    oib?: string;
    mbs?: string;
    website?: string;
  }) => {
    const res = await fetch('/api/registry/hr/companies/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to import company');
      return;
    }
    setSelectedLeadId(data.lead_id);
    fetchLeads();
    fetchCompanies();
    alert('Company imported to CRM.');
  };

  const handleOpenCompanyDetail = async (mbs?: string) => {
    if (!mbs) return;
    setSelectedRegistryMbs(mbs);
    setRegistryDetailError(null);
    setIsLoadingCompanyDetail(true);
    try {
      const res = await fetch(`/api/registry/hr/companies/${encodeURIComponent(mbs)}/detail`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load company detail');
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
      if (!res.ok) throw new Error(data.error || 'Failed to research contacts');
      const candidates = (data.contacts || []).map((c: ResearchCandidate) => ({ ...c, selected: true }));
      if (!candidates.length) {
        alert('No high-confidence company-matched candidates found.');
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
      alert('Select at least one candidate.');
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
      alert(data.error || 'Failed to add approved contacts');
      return;
    }
    setIsResearchReviewOpen(false);
    setResearchCandidates([]);
    setResearchRunId('');
    alert(`Added ${data.created} approved contact(s).`);
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
        company_id: editingLead.company_id ? parseInt(editingLead.company_id, 10) : null,
        user_email: USER_EMAIL
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
          content: newComm.content,
          user_email: USER_EMAIL
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send email');
      }
      
      alert("Email sent successfully!");
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
      alert("Failed to generate template.");
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
      body: JSON.stringify({ field_id: fieldId, value, user_email: USER_EMAIL }),
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
    if (!confirm('Delete this field for all leads?')) return;
    await fetch(`/api/custom-fields/${id}`, { method: 'DELETE' });
    fetchCustomFields();
    if (selectedLeadId) fetchLeadDetail(selectedLeadId);
  };

  const handleSaveTemplate = async () => {
    if (!newComm.content) return;
    const name = prompt('Enter a name for this template:');
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
      body: JSON.stringify({ status, user_email: USER_EMAIL }),
    });
    fetchLeads();
    if (selectedLeadId === id) fetchLeadDetail(id);
  };

  const handleUpdateAssignment = async (id: number, assigned_to: string) => {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to, user_email: USER_EMAIL }),
    });
    if (selectedLeadId === id) fetchLeadDetail(id);
  };

  const handleDeleteLead = async (id: number) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    setSelectedLeadId(null);
    fetchLeads();
  };

  const filteredLeads = leads.filter(l => 
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fmtDate = (value?: string | null) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  };

  const renderValue = (value?: any) => (value === null || value === undefined || value === '' ? 'N/A' : String(value));

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
              Registry
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {workspaceMode === 'crm' ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search contacts..." 
                  className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-crimson-500 w-64 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button 
                onClick={() => setIsAddingCompany(true)}
                className="bg-crimson-600 hover:bg-crimson-700 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Company
              </button>
              <button 
                onClick={() => {
                  if (!selectedLeadId) {
                    alert('Select a company lead first.');
                    return;
                  }
                  setIsAddingLead(true);
                }}
                className="bg-white border border-slate-200 hover:border-slate-300 text-slate-700 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                <Users className="w-4 h-4" />
                Add Contact
              </button>
              <button 
                onClick={() => setIsManagingTemplates(true)}
                className="p-2 text-slate-400 hover:text-crimson-600 hover:bg-crimson-50 rounded-full transition-all"
                title="Manage Templates"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsManagingFields(true)}
                className="p-2 text-slate-400 hover:text-crimson-600 hover:bg-crimson-50 rounded-full transition-all"
                title="Custom Fields"
              >
                <Plus className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              onClick={handleStartCroatiaSync}
              disabled={isSyncingCroatiaCompanies}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-full text-sm font-bold disabled:opacity-50"
            >
              {isSyncingCroatiaCompanies ? 'Sync Running...' : 'Sync Sudreg'}
            </button>
          )}
        </div>
      </header>

      <main className={`${workspaceMode === 'crm' ? 'max-w-7xl grid' : 'hidden'} mx-auto p-6 grid-cols-12 gap-6 h-[calc(100vh-80px)]`}>
        {/* Leads List */}
        <div className="col-span-4 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">All Contacts ({filteredLeads.length})</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredLeads.map(lead => (
              <button
                key={lead.id}
                onClick={() => setSelectedLeadId(lead.id)}
                className={`w-full text-left p-4 border-b border-slate-50 flex items-center justify-between hover:bg-slate-50 transition-colors ${selectedLeadId === lead.id ? 'bg-crimson-50/50 border-l-4 border-l-crimson-600' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-ink truncate">{lead.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[lead.status]}`}>
                      {lead.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1 truncate">
                      <Building2 className="w-3 h-3" /> {lead.company || 'No Company'}
                    </span>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${selectedLeadId === lead.id ? 'translate-x-1 text-crimson-400' : ''}`} />
              </button>
            ))}
            {filteredLeads.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No contacts found</p>
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
                        <option value="New">New</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Closed">Closed</option>
                      </select>
                      <button
                        onClick={handleEnrichLead}
                        disabled={isEnriching}
                        className="flex items-center gap-1.5 px-3 py-1 bg-crimson-50 text-crimson-600 border border-crimson-100 rounded-full text-xs font-bold hover:bg-crimson-100 transition-all disabled:opacity-50"
                      >
                        {isEnriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {isEnriching ? 'Enriching...' : 'Enrich Lead'}
                      </button>
                      <button
                        onClick={handleLinkedInScrape}
                        disabled={isScrapingLinkedIn}
                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-bold hover:bg-blue-100 transition-all disabled:opacity-50"
                      >
                        {isScrapingLinkedIn ? <Loader2 className="w-3 h-3 animate-spin" /> : <Linkedin className="w-3 h-3" />}
                        {isScrapingLinkedIn ? 'Scraping...' : 'LinkedIn Scrape'}
                      </button>
                      <button
                        onClick={startEditLead}
                        className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded-full text-xs font-bold hover:bg-slate-100 transition-all"
                      >
                        Edit Company
                      </button>
                      <button
                        onClick={() => {
                          if (!leadDetail.company_id) {
                            alert('Link this contact to a company first, then run research.');
                            return;
                          }
                          handleResearchCompanyContacts(leadDetail.company_id);
                        }}
                        disabled={isResearchingCompanyContacts}
                        className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
                      >
                        {isResearchingCompanyContacts ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                        {isResearchingCompanyContacts ? 'Researching...' : 'Research People'}
                      </button>
                      <div className="flex items-center gap-2 sm:ml-auto">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Assigned To</span>
                        <select 
                          value={leadDetail.assigned_to || ''}
                          onChange={(e) => handleUpdateAssignment(leadDetail.id, e.target.value)}
                          className="text-xs px-3 py-1 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-crimson-500/20"
                        >
                          <option value="">Unassigned</option>
                          <option value="ivucicev@gmail.com">Me</option>
                          <option value="sales@crimson.com">Sales Team</option>
                          <option value="support@crimson.com">Support</option>
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
                          <Globe className="w-4 h-4" /> Website
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
                  {['History', 'Contacts', 'Reminders', 'Custom', 'Activity'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={`px-4 py-3 text-xs font-bold transition-all border-b-2 -mb-px ${activeTab === tab ? 'border-crimson-600 text-crimson-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                      {tab}
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
                          Communication History
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
                                onClick={() => setNewComm(prev => ({ ...prev, type, subject: type === 'Email' ? (prev.subject || 'Follow up from Crimson CRM') : '' }))}
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
                              <option value="">Apply Template...</option>
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
                              placeholder="Email Subject"
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
                              Suggest
                            </button>
                          </div>
                        )}

                        {newComm.type === 'Email' ? (
                          <div className="mb-4">
                            <ReactQuill 
                              theme="snow"
                              value={newComm.content}
                              onChange={(content) => setNewComm(prev => ({ ...prev, content }))}
                              placeholder="Compose your email..."
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
                            placeholder="Log a new interaction..."
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
                              Save as Template
                            </button>
                            <button 
                              type="button"
                              onClick={handleGenerateTemplate}
                              disabled={isGeneratingTemplate}
                              className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 hover:text-amber-600 transition-colors"
                            >
                              {isGeneratingTemplate ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              AI Generate
                            </button>
                            {newComm.type === 'Email' && (
                              <button 
                                type="button"
                                onClick={() => setIsPreviewOpen(true)}
                                disabled={!newComm.content}
                                className="flex items-center gap-1.5 text-[10px] font-bold text-blue-500 hover:text-blue-600 transition-colors"
                              >
                                <FileText className="w-3 h-3" />
                                Preview
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
                                Send Email
                              </button>
                            )}
                            <button 
                              type="submit"
                              disabled={!newComm.content}
                              className="bg-ink text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition-all"
                            >
                              Log Activity
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
                          Company Contacts
                        </h3>
                        <button
                          onClick={() => setIsAddingLead(true)}
                          className="text-xs font-bold text-crimson-600 hover:text-crimson-700"
                        >
                          + Add Contact
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
                                if (!confirm('Delete this contact?')) return;
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
                        <div className="text-center py-10 text-slate-400 text-sm">No contacts yet for this company.</div>
                      )}
                    </div>
                  )}

                  {activeTab === 'Reminders' && (
                    <div className="max-w-2xl mx-auto space-y-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                          <Bell className="w-4 h-4 text-amber-500" />
                          Tasks & Reminders
                        </h3>
                      </div>

                      {/* Add Reminder Form */}
                      <form onSubmit={handleAddReminder} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-8">
                        <div className="space-y-3">
                          <input
                            type="text"
                            placeholder="What needs to be done?"
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
                              Add Task
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
                            <p className="text-sm italic">No reminders set for this lead.</p>
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
                          Custom Fields
                        </h3>
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
                            <p className="text-xs italic">No custom fields defined. Click the + icon in the header to add some.</p>
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
                          Activity Log
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
                          <p className="text-sm italic">No activity recorded yet.</p>
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
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Select a contact</h3>
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
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registry Filters</h2>
              <p className="text-[11px] text-slate-500 mt-1">Results update automatically as you type.</p>
            </div>
            <div className="p-4 space-y-3 border-b border-slate-100">
              <input
                type="text"
                value={croatiaCompanyQuery}
                onChange={(e) => setCroatiaCompanyQuery(e.target.value)}
                placeholder="Name, OIB, or MBS"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-crimson-500/20"
              />
              <input
                type="text"
                value={selectedCroatiaCity}
                onChange={(e) => setSelectedCroatiaCity(e.target.value)}
                placeholder="City"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-crimson-500/20"
              />
              <input
                type="text"
                value={selectedCroatiaRegion}
                onChange={(e) => setSelectedCroatiaRegion(e.target.value)}
                placeholder="Region / County"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-crimson-500/20"
              />
              <details className="border border-slate-200 rounded-lg bg-slate-50">
                <summary className="px-3 py-2 text-sm font-semibold cursor-pointer select-none">
                  NKD filter {selectedCroatiaNkds.length ? `(${selectedCroatiaNkds.length} selected)` : '(none)'}
                </summary>
                <div className="p-3 border-t border-slate-200 space-y-2">
                  <input
                    type="text"
                    value={croatiaNkdQuery}
                    onChange={(e) => setCroatiaNkdQuery(e.target.value)}
                    placeholder="Search NKD code or name..."
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
                        Clear
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
                <option value="any">NKD Any</option>
                <option value="primary">NKD Primary</option>
                <option value="secondary">NKD Secondary</option>
              </select>
            </div>
            <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500 bg-slate-50/40">
              {isSearchingCroatiaCompanies ? 'Searching...' : `${croatiaCompanyResults.length} companies`}
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
                    <p className="text-xs text-slate-500 mt-1">{company.city || 'No city'} {company.mbs ? `· MBS ${company.mbs}` : ''}</p>
                  </button>
                );
              })}
              {!isSearchingCroatiaCompanies && croatiaCompanyResults.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-sm">No companies match current filters.</div>
              )}
            </div>
          </section>

          <section className="col-span-8 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company Detail</h2>
              {selectedCompanyDetail && (
                <button
                  onClick={() => handleImportCroatiaCompany(selectedCompanyDetail)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                >
                  Import Company
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingCompanyDetail && <p className="text-sm text-slate-500">Loading detail...</p>}
              {!isLoadingCompanyDetail && registryDetailError && <p className="text-sm text-red-600">{registryDetailError}</p>}
              {!isLoadingCompanyDetail && !registryDetailError && selectedCompanyDetail && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-2xl font-bold text-ink">{selectedCompanyDetail.name || 'Unnamed company'}</h3>
                    <p className="text-xs text-slate-600 mt-1">
                      {selectedCompanyDetail.oib ? `OIB ${selectedCompanyDetail.oib}` : 'No OIB'} {selectedCompanyDetail.mbs ? `· MBS ${selectedCompanyDetail.mbs}` : ''}
                    </p>
                  </div>
                  {selectedCompanyDetail?.structured && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Identifiers</p>
                          <p className="text-sm text-ink mt-1">MBS: {renderValue(selectedCompanyDetail.structured?.ids?.potpuni_mbs || selectedCompanyDetail.structured?.ids?.mbs)}</p>
                          <p className="text-sm text-ink">OIB: {renderValue(selectedCompanyDetail.structured?.ids?.potpuni_oib || selectedCompanyDetail.structured?.ids?.oib)}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Timeline</p>
                          <p className="text-sm text-ink mt-1">Founded: {fmtDate(selectedCompanyDetail.structured?.dates?.datum_osnivanja)}</p>
                          <p className="text-sm text-ink">Last Change: {fmtDate(selectedCompanyDetail.structured?.dates?.vrijeme_zadnje_izmjene)}</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Company</p>
                        <p className="text-sm text-ink mt-1">
                          Full: {renderValue(selectedCompanyDetail.structured?.company_name?.tvrtka?.ime)}
                        </p>
                        <p className="text-sm text-ink">
                          Short: {renderValue(selectedCompanyDetail.structured?.company_name?.skracena_tvrtka?.ime)}
                        </p>
                        <p className="text-sm text-ink">Procedure: {renderValue(selectedCompanyDetail.structured?.postupak)}</p>
                        <p className="text-sm text-ink">
                          Legal Form: {renderValue(selectedCompanyDetail.structured?.legal_form?.naziv || selectedCompanyDetail.structured?.legal_form)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Seat</p>
                          <p className="text-sm text-ink mt-1">
                            {renderValue(selectedCompanyDetail.structured?.seat?.ulica)} {renderValue(selectedCompanyDetail.structured?.seat?.kucni_broj)}
                          </p>
                          <p className="text-sm text-ink">
                            {renderValue(selectedCompanyDetail.structured?.seat?.naziv_naselja)}, {renderValue(selectedCompanyDetail.structured?.seat?.naziv_zupanije)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Courts</p>
                          <p className="text-sm text-ink mt-1">Nadlezan: {renderValue(selectedCompanyDetail.structured?.courts?.sud_nadlezan?.naziv)}</p>
                          <p className="text-sm text-ink">Sluzba: {renderValue(selectedCompanyDetail.structured?.courts?.sud_sluzba?.naziv)}</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">NKD</p>
                        <p className="text-sm text-ink mt-1">
                          Primary: {renderValue(selectedCompanyDetail.structured?.primary_activity?.sifra)} - {renderValue(selectedCompanyDetail.structured?.primary_activity?.puni_naziv)}
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
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Capitals</p>
                          <p className="text-sm text-ink mt-1">{(selectedCompanyDetail.structured?.capitals || []).length}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Status Procedures</p>
                          <p className="text-sm text-ink mt-1">{(selectedCompanyDetail.structured?.status_procedures || []).length}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">GFI Reports</p>
                          <p className="text-sm text-ink mt-1">{(selectedCompanyDetail.structured?.financial_reports || []).length}</p>
                        </div>
                      </div>

                      <details className="rounded-xl border border-slate-200 bg-slate-50">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">Raw Sudreg JSON</summary>
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
                  Select a company on the left to inspect full data.
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
                <h2 className="text-xl font-bold text-ink">New Company</h2>
                <button onClick={() => setIsAddingCompany(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleAddCompany} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Company Name</label>
                  <input
                    required
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="Acme Inc."
                    value={newCompany.name}
                    onChange={e => setNewCompany(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Website (Optional)</label>
                  <input
                    type="url"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="https://acme.com"
                    value={newCompany.website}
                    onChange={e => setNewCompany(prev => ({ ...prev, website: e.target.value }))}
                  />
                </div>
                <div className="pt-4">
                  <button
                    type="submit"
                    className="w-full bg-crimson-600 hover:bg-crimson-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-crimson-600/20 transition-all active:scale-[0.98]"
                  >
                    Save Company
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCompanyAndResearch}
                    disabled={isResearchingCompanyContacts || !newCompany.name.trim()}
                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50"
                  >
                    {isResearchingCompanyContacts ? 'Researching People...' : 'Save + Research People'}
                  </button>
                </div>
              </form>
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
                <h2 className="text-xl font-bold text-ink">New Contact</h2>
                <button onClick={() => setIsAddingLead(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleAddLead} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Full Name</label>
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
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Title</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="VP Sales"
                    value={newContact.title}
                    onChange={e => setNewContact(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email Address</label>
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
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Bio</label>
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
                    Add Contact
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
                <h2 className="text-xl font-bold text-ink">Review Research Candidates</h2>
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
                          Evidence Source
                        </a>
                        <p className="text-[10px] text-slate-400">Confidence: {Math.round((c.confidence || 0) * 100)}%</p>
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
                    Approve Selected
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
                <h2 className="text-xl font-bold text-ink">Edit Company Lead</h2>
                <button onClick={() => setIsEditingLead(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Full Name</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={editingLead.name}
                    onChange={e => setEditingLead(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Company</label>
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
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email</label>
                  <input
                    type="email"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={editingLead.email}
                    onChange={e => setEditingLead(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Title</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={editingLead.title}
                    onChange={e => setEditingLead(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Website</label>
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
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Bio</label>
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
                  Save Changes
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
                <h2 className="text-xl font-bold text-ink">Email Templates</h2>
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
                    <p className="text-sm">No templates saved yet.</p>
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
                <h2 className="text-xl font-bold text-ink">Custom Fields</h2>
                <button onClick={() => setIsManagingFields(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <form onSubmit={handleAddFieldDef} className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="Field name (e.g. Budget, Source)"
                    className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-crimson-500/20"
                    value={newFieldName}
                    onChange={e => setNewFieldName(e.target.value)}
                  />
                  <button type="submit" className="bg-crimson-600 text-white px-4 py-2 rounded-xl font-bold">Add</button>
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
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
