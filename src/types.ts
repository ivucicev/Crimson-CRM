export interface Lead {
  id: number;
  name: string;
  company_id?: number | null;
  company: string;
  email: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Closed';
  title?: string;
  bio?: string;
  website?: string;
  linkedin_url?: string;
  enriched_at?: string;
  assigned_to?: string;
  created_at: string;
}

export interface Communication {
  id: number;
  lead_id: number;
  type: string;
  content: string;
  created_at: string;
}

export interface Reminder {
  id: number;
  lead_id: number;
  task: string;
  due_at: string;
  completed: number;
  created_at: string;
}

export interface Template {
  id: number;
  name: string;
  content: string;
  created_at: string;
}

export interface CustomFieldDefinition {
  id: number;
  label: string;
}

export interface CustomFieldValue {
  field_id: number;
  label: string;
  value: string | null;
}

export interface ActivityLog {
  id: number;
  lead_id: number;
  user_email: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface Contact {
  id: number;
  lead_id: number;
  name: string;
  title?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  bio?: string | null;
  source_url?: string | null;
  confidence?: number | null;
  research_run_id?: string | null;
  created_at: string;
}

export interface ResearchCandidate {
  name: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  bio?: string;
  source_url: string;
  confidence: number;
  company_match: boolean;
}

export interface LeadDetail extends Lead {
  communications: Communication[];
  reminders: Reminder[];
  contacts: Contact[];
  custom_fields: CustomFieldValue[];
  activity_logs: ActivityLog[];
}

export interface Company {
  id: number;
  name: string;
  website?: string;
  contact_count?: number;
  created_at: string;
}
