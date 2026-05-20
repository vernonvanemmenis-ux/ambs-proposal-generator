export type Client = {
  id: number;
  name: string;
  industry: string;
  contact_person: string;
  email: string;
  phone: string;
  site_location: string;
  created_at: string;
};

export type OpportunityLine = {
  id: number;
  sequence: number;
  item_code: string;
  product_line: string;
  structure_type: string;
  description: string;
  quantity: number;
  unit_of_measure: string;
  unit_rate: number;
  line_total: number;
  // Sales extras (Odoo-style)
  discount_pct: number;
  is_optional: boolean;
  cost_rate: number;
  margin?: number;
};

export type OpportunityLineDraft = Omit<OpportunityLine, "id" | "line_total" | "margin">;

export type Item = {
  id: number;
  code: string;
  name: string;
  category: string;
  product_line: string;
  structure_type: string;
  unit_of_measure: string;
  default_rate: number;
  description: string;
};

export type OpportunityLite = {
  id: number;
  title: string;
  client: { name: string };
};

export type Opportunity = {
  id: number;
  title: string;
  client_id: number;
  stage: string;
  delivery_weeks: number;
  priority: number;
  notes: string;
  expected_close: string | null;
  created_at: string;
  amount: number;
  optional_amount: number;
  project_id: number | null;
  client: Client;
  lines: OpportunityLine[];
  // Sales extras
  valid_until: string | null;
  salesperson: string;
  deposit_pct: number;
};

export type Catalogue = {
  product_lines: string[];
  structure_types: string[];
  units_of_measure: string[];
  section_kinds: string[];
  proposal_status_values: string[];
  default_project_stages: { name: string; color: string }[];
};

export type TemplateSection = {
  kind: string;
  enabled: boolean;
  config: Record<string, any>;
};

export type Template = {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  brand_company_name: string;
  brand_tagline: string;
  brand_address_line: string;
  brand_contact_line: string;
  brand_primary_color: string;
  brand_accent_color: string;
  logo_filename: string;
  sections: TemplateSection[];
  created_at: string;
};

export type TemplateDraft = Omit<Template, "id" | "created_at"> & { id?: number };

export type Activity = {
  id: number;
  kind: string;
  author: string;
  body: string;
  created_at: string;
};

export type Proposal = {
  id: number;
  ref: string;
  filename: string;
  generated_at: string;
  channel: string;
  pandadoc_id: string;
  status: "draft" | "sent" | "viewed" | "signed" | "paid";
  status_updated_at: string | null;
};

// --------------- Projects ---------------
export type TaskAttachment = {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};

export type Task = {
  id: number;
  project_id: number;
  stage_id: number;
  title: string;
  assignee: string;
  target_date: string | null;
  notes: string;
  sequence: number;
  created_at: string;
  attachments: TaskAttachment[];
};

export type ProjectStage = {
  id: number;
  project_id: number;
  name: string;
  color: string;
  sequence: number;
};

export type Project = {
  id: number;
  name: string;
  opportunity_id: number | null;
  client_id: number | null;
  status: "active" | "archived";
  notes: string;
  created_at: string;
  stages: ProjectStage[];
  tasks: Task[];
  client: Client | null;
};

export type Status = {
  online: boolean;
  pandadoc_configured: boolean;
  app_version: string;
  db_path: string;
};

export type DatabaseInfo = {
  db_path: string;
  data_folder: string;
  db_size_bytes: number;
  tables: { name: string; rows: number }[];
};

async function j(res: Response): Promise<any> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  status: (): Promise<Status> => fetch("/api/status").then(j),
  catalogue: (): Promise<Catalogue> => fetch("/api/catalogue").then(j),
  items: {
    list: (): Promise<Item[]> => fetch("/api/items").then(j),
    create: (body: Partial<Item>): Promise<Item> =>
      fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    update: (id: number, body: Partial<Item>): Promise<Item> =>
      fetch(`/api/items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    delete: (id: number): Promise<{ ok: true }> =>
      fetch(`/api/items/${id}`, { method: "DELETE" }).then(j),
  },
  database: {
    info: (): Promise<DatabaseInfo> => fetch("/api/database/info").then(j),
    openFolder: (): Promise<{ ok: true; folder: string }> =>
      fetch("/api/database/open-folder", { method: "POST" }).then(j),
  },

  clients: {
    list: (): Promise<Client[]> => fetch("/api/clients").then(j),
    get: (id: number): Promise<Client> => fetch(`/api/clients/${id}`).then(j),
    create: (body: Partial<Client>): Promise<Client> =>
      fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    update: (id: number, body: Partial<Client>): Promise<Client> =>
      fetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
  },

  opportunities: {
    list: (): Promise<Opportunity[]> => fetch("/api/opportunities").then(j),
    get: (id: number): Promise<Opportunity> => fetch(`/api/opportunities/${id}`).then(j),
    create: (body: Partial<Opportunity>): Promise<Opportunity> =>
      fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    update: (id: number, body: Partial<Opportunity>): Promise<Opportunity> =>
      fetch(`/api/opportunities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    activities: (id: number): Promise<Activity[]> =>
      fetch(`/api/opportunities/${id}/activities`).then(j),
    addActivity: (id: number, body: { body: string; kind?: string }): Promise<Activity> =>
      fetch(`/api/opportunities/${id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    addLine: (oppId: number, line: Partial<OpportunityLineDraft>): Promise<OpportunityLine> =>
      fetch(`/api/opportunities/${oppId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(line),
      }).then(j),
    updateLine: (oppId: number, lineId: number, line: Partial<OpportunityLineDraft>): Promise<OpportunityLine> =>
      fetch(`/api/opportunities/${oppId}/lines/${lineId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(line),
      }).then(j),
    deleteLine: (oppId: number, lineId: number): Promise<{ ok: true }> =>
      fetch(`/api/opportunities/${oppId}/lines/${lineId}`, { method: "DELETE" }).then(j),
  },

  proposals: {
    list: (): Promise<Proposal[]> => fetch("/api/proposals").then(j),
    generate: (oppId: number, templateId?: number): Promise<Proposal> => {
      const q = templateId ? `?template_id=${templateId}` : "";
      return fetch(`/api/proposals/generate/${oppId}${q}`, { method: "POST" }).then(j);
    },
    setStatus: (id: number, status: Proposal["status"]): Promise<Proposal> =>
      fetch(`/api/proposals/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(j),
    downloadUrl: (id: number) => `/api/proposals/${id}/download`,
  },

  projects: {
    list: (status?: "active" | "archived"): Promise<Project[]> => {
      const q = status ? `?status=${status}` : "";
      return fetch(`/api/projects${q}`).then(j);
    },
    get: (id: number): Promise<Project> => fetch(`/api/projects/${id}`).then(j),
    create: (body: { name: string; opportunity_id?: number | null; client_id?: number | null; notes?: string }): Promise<Project> =>
      fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    update: (id: number, body: Partial<{ name: string; status: string; notes: string }>): Promise<Project> =>
      fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),

    stages: {
      list: (projectId: number): Promise<ProjectStage[]> =>
        fetch(`/api/projects/${projectId}/stages`).then(j),
      create: (projectId: number, body: { name: string; color?: string; sequence?: number }): Promise<ProjectStage> =>
        fetch(`/api/projects/${projectId}/stages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      update: (projectId: number, stageId: number, body: Partial<ProjectStage>): Promise<ProjectStage> =>
        fetch(`/api/projects/${projectId}/stages/${stageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      delete: (projectId: number, stageId: number): Promise<{ ok: true }> =>
        fetch(`/api/projects/${projectId}/stages/${stageId}`, { method: "DELETE" }).then(j),
    },

    tasks: {
      list: (projectId: number): Promise<Task[]> =>
        fetch(`/api/projects/${projectId}/tasks`).then(j),
      create: (projectId: number, body: { title: string; stage_id?: number | null; assignee?: string; target_date?: string | null; notes?: string }): Promise<Task> =>
        fetch(`/api/projects/${projectId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      update: (projectId: number, taskId: number, body: Partial<Task>): Promise<Task> =>
        fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      move: (projectId: number, taskId: number, stage_id: number, sequence: number): Promise<Task> =>
        fetch(`/api/projects/${projectId}/tasks/${taskId}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage_id, sequence }),
        }).then(j),
      delete: (projectId: number, taskId: number): Promise<{ ok: true }> =>
        fetch(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" }).then(j),
      activities: (projectId: number, taskId: number): Promise<Activity[]> =>
        fetch(`/api/projects/${projectId}/tasks/${taskId}/activities`).then(j),
      addActivity: (projectId: number, taskId: number, body: { body: string; kind?: string }): Promise<Activity> =>
        fetch(`/api/projects/${projectId}/tasks/${taskId}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      uploadAttachment: (projectId: number, taskId: number, file: File): Promise<TaskAttachment> => {
        const fd = new FormData();
        fd.append("file", file);
        return fetch(`/api/projects/${projectId}/tasks/${taskId}/attachments`, { method: "POST", body: fd }).then(j);
      },
      attachmentUrl: (projectId: number, taskId: number, attId: number) =>
        `/api/projects/${projectId}/tasks/${taskId}/attachments/${attId}/download`,
      deleteAttachment: (projectId: number, taskId: number, attId: number): Promise<{ ok: true }> =>
        fetch(`/api/projects/${projectId}/tasks/${taskId}/attachments/${attId}`, { method: "DELETE" }).then(j),
    },
  },

  templates: {
    list: (): Promise<Template[]> => fetch("/api/templates").then(j),
    get: (id: number): Promise<Template> => fetch(`/api/templates/${id}`).then(j),
    create: (body: Partial<TemplateDraft>): Promise<Template> =>
      fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    update: (id: number, body: Partial<TemplateDraft>): Promise<Template> =>
      fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    duplicate: (id: number): Promise<Template> =>
      fetch(`/api/templates/${id}/duplicate`, { method: "POST" }).then(j),
    delete: (id: number): Promise<{ ok: true }> =>
      fetch(`/api/templates/${id}`, { method: "DELETE" }).then(j),
    uploadLogo: (id: number, file: File): Promise<Template> => {
      const fd = new FormData();
      fd.append("file", file);
      return fetch(`/api/templates/${id}/logo`, { method: "POST", body: fd }).then(j);
    },
    clearLogo: (id: number): Promise<Template> =>
      fetch(`/api/templates/${id}/logo/clear`, { method: "POST" }).then(j),
    logoUrl: (filename: string) => (filename ? `/logos/${filename}` : ""),
  },
};
