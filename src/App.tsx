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
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { Lead, LeadDetail, Communication, Reminder, Template } from './types';

const STATUS_COLORS = {
  'New': 'bg-blue-100 text-blue-700 border-blue-200',
  'Contacted': 'bg-amber-100 text-amber-700 border-amber-200',
  'Qualified': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Closed': 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function App() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [leadDetail, setLeadDetail] = useState<LeadDetail | null>(null);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isManagingTemplates, setIsManagingTemplates] = useState(false);
  const [isManagingFields, setIsManagingFields] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newComm, setNewComm] = useState({ type: 'Note', content: '' });
  const [newLead, setNewLead] = useState({ name: '', company: '', email: '', status: 'New' as Lead['status'] });
  const [newReminder, setNewReminder] = useState({ task: '', due_at: '' });
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [newFieldName, setNewFieldName] = useState('');

  useEffect(() => {
    fetchLeads();
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

  const fetchLeads = async () => {
    const res = await fetch('/api/leads');
    const data = await res.json();
    setLeads(data);
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

  const handleEnrichLead = async () => {
    if (!leadDetail) return;
    setIsEnriching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find professional information about ${leadDetail.name} who works at ${leadDetail.company}. 
        Return details like their current job title, a short bio, their company website, and their LinkedIn profile URL if available.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "The person's current job title" },
              bio: { type: Type.STRING, description: "A short professional biography" },
              website: { type: Type.STRING, description: "The company's official website URL" },
              linkedin_url: { type: Type.STRING, description: "The person's LinkedIn profile URL" }
            },
            required: ["title", "bio"]
          }
        }
      });

      const enrichedData = JSON.parse(response.text || "{}");
      
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

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLead),
    });
    setIsAddingLead(false);
    setNewLead({ name: '', company: '', email: '', status: 'New' });
    fetchLeads();
  };

  const handleAddComm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId || !newComm.content) return;
    await fetch(`/api/leads/${selectedLeadId}/communications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newComm),
    });
    setNewComm({ type: 'Note', content: '' });
    fetchLeadDetail(selectedLeadId);
  };

  const handleGenerateTemplate = async () => {
    if (!leadDetail) return;
    setIsGeneratingTemplate(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a professional, personalized outreach email template for a lead.
        Lead Name: ${leadDetail.name}
        Company: ${leadDetail.company}
        Bio/Context: ${leadDetail.bio || 'N/A'}
        Industry: ${leadDetail.title || 'N/A'}
        
        The email should be concise, friendly, and focused on starting a conversation.`,
      });
      
      setNewComm(prev => ({ ...prev, type: 'Email', content: response.text || '' }));
    } catch (error) {
      console.error("Generation failed:", error);
      alert("Failed to generate template.");
    } finally {
      setIsGeneratingTemplate(false);
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
      body: JSON.stringify({ status }),
    });
    fetchLeads();
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

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-crimson-600 rounded-lg flex items-center justify-center">
            <Users className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Crimson</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search leads..." 
              className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-crimson-500 w-64 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsAddingLead(true)}
            className="bg-crimson-600 hover:bg-crimson-700 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Lead
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-12 gap-6 h-[calc(100vh-80px)]">
        {/* Leads List */}
        <div className="col-span-4 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">All Leads ({filteredLeads.length})</h2>
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
                <p>No leads found</p>
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
                <div className="p-6 border-b border-slate-100 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
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
                    className="p-2 text-slate-400 hover:text-crimson-600 hover:bg-crimson-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Content Tabs/Sections */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 grid grid-cols-2 gap-6">
                  {/* Communication Log */}
                  <div className="space-y-6">
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
                              onClick={() => setNewComm(prev => ({ ...prev, type }))}
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
                      <textarea
                        placeholder="Log a new interaction..."
                        className="w-full p-3 text-sm border border-slate-100 rounded-lg focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none min-h-[80px] resize-none"
                        value={newComm.content}
                        onChange={(e) => setNewComm(prev => ({ ...prev, content: e.target.value }))}
                      />
                      <div className="flex justify-between mt-3">
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
                        <button 
                          type="submit"
                          disabled={!newComm.content}
                          className="bg-ink text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition-all"
                        >
                          Log Activity
                        </button>
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

                  {/* Reminders Section */}
                  <div className="space-y-6">
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
                          <button 
                            type="submit"
                            disabled={!newReminder.task || !newReminder.due_at}
                            className="bg-amber-500 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-all"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </form>

                    {/* Reminders List */}
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
                        <div className="text-center py-8 text-slate-400">
                          <p className="text-sm italic">No reminders set.</p>
                        </div>
                      )}
                    </div>

                    {/* Custom Fields Section */}
                    <div className="pt-6 border-t border-slate-100">
                      <h3 className="text-sm font-bold text-ink flex items-center gap-2 mb-4">
                        <Plus className="w-4 h-4 text-emerald-500" />
                        Custom Fields
                      </h3>
                      <div className="space-y-4">
                        {leadDetail.custom_fields.map(field => (
                          <div key={field.field_id}>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{field.label}</label>
                            <input 
                              type="text"
                              defaultValue={field.value || ''}
                              onBlur={(e) => handleUpdateCustomValue(field.field_id, e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-crimson-500/20 outline-none"
                              placeholder={`Enter ${field.label}...`}
                            />
                          </div>
                        ))}
                        {leadDetail.custom_fields.length === 0 && (
                          <p className="text-xs text-slate-400 italic">No custom fields defined. Click the + icon in the header to add some.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <Users className="w-10 h-10 opacity-20" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Select a lead</h3>
                <p className="max-w-xs text-sm">Choose a lead from the list to view their details and communication history.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

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
                <h2 className="text-xl font-bold text-ink">New Lead</h2>
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
                    value={newLead.name}
                    onChange={e => setNewLead(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Company</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="Acme Inc."
                    value={newLead.company}
                    onChange={e => setNewLead(prev => ({ ...prev, company: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email Address</label>
                  <input 
                    type="email" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-crimson-500/20 focus:border-crimson-500 outline-none transition-all"
                    placeholder="john@example.com"
                    value={newLead.email}
                    onChange={e => setNewLead(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Initial Status</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['New', 'Contacted', 'Qualified', 'Closed'].map(status => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setNewLead(prev => ({ ...prev, status: status as Lead['status'] }))}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${newLead.status === status ? 'bg-crimson-50 border-crimson-200 text-crimson-600' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full bg-crimson-600 hover:bg-crimson-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-crimson-600/20 transition-all active:scale-[0.98]"
                  >
                    Create Lead
                  </button>
                </div>
              </form>
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
