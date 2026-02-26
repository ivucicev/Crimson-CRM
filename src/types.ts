export interface Lead {
  id: number;
  name: string;
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

export interface LeadDetail extends Lead {
  communications: Communication[];
  reminders: Reminder[];
  custom_fields: CustomFieldValue[];
  activity_logs: ActivityLog[];
}
