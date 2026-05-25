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
  // Sales extras
  discount_pct: number;
  is_optional: boolean;
  cost_rate: number;
  margin?: number;
  // Template-bundle grouping; "" means ungrouped.
  bundle_label: string;
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
  tags: string;
  image_path: string;
};

export type TemplateLine = {
  item_code: string;
  description: string;
  quantity: number;
  unit_of_measure: string;
  unit_rate: number;
  product_line: string;
  structure_type: string;
  is_optional: boolean;
};

export type OpportunityTemplate = {
  id: number;
  name: string;
  description: string;
  icon: string;
  industry: string;
  title_hint: string;
  default_delivery_weeks: number;
  default_deposit_pct: number;
  default_lines: TemplateLine[];
  is_active: boolean;
  created_at: string;
};

export type OpportunityTemplateDraft = Omit<OpportunityTemplate, "id" | "created_at"> & { id?: number };

export type OpportunityLite = {
  id: number;
  title: string;
  client: { name: string };
};

export type OpportunityAsset = {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  caption: string;
  sequence: number;
  uploaded_at: string;
};

export type RiskRow = {
  risk: string;
  likelihood: "Low" | "Medium" | "High" | string;
  impact: "Low" | "Medium" | "High" | string;
  mitigation: string;
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
  assets: OpportunityAsset[];
  // Sales extras
  valid_until: string | null;
  salesperson: string;
  deposit_pct: number;
  // v0.4.1 — overrides and paste-back drafts
  hero_filename: string;
  warranty_override: string;
  site_logistics_override: string;
  risks_override_json: string;
  section_drafts_json: string;
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
  hero_filename: string;
  default_warranty_md: string;
  default_site_logistics_md: string;
  default_risks_json: string;
  tax_company_reg: string;
  tax_vat_number: string;
  tax_bbbee_level: string;
  tax_bbbee_cert_expiry: string;
  tax_address: string;
  tax_directors: string;
  sections: TemplateSection[];
  created_at: string;
};

export type AIDraftStatus = {
  configured: boolean;
  provider: string;
  model: string;
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

// --------------- Studio mode — Page layouts ---------------
export type BlockRegistryMeta = {
  label: string;
  description: string;
  default_enabled: boolean;
};

// Outer key: page_key, inner key: block_key.
export type PageRegistry = Record<string, Record<string, BlockRegistryMeta>>;

export type PageLayoutBlock = {
  key: string;
  enabled: boolean;
  config: Record<string, any>;
};

export type PageLayout = {
  page_key: string;
  blocks: PageLayoutBlock[];
  updated_at: string | null;
};

export type Salesperson = {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  initials: string;
  active: boolean;
  created_at: string;
};

// M1 — vendor/supplier directory. Buy-side counterpart to Client.
export type Supplier = {
  id: number;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  payment_terms: string;
  lead_time_days: number;
  active: boolean;
  notes: string;
  created_at: string;
  item_links: ItemSupplier[];
};

export type ItemSupplier = {
  id: number;
  item_id: number;
  supplier_id: number;
  supplier_code: string;
  supplier_price: number;
  currency: string;
  min_qty: number;
  lead_time_days: number;
};

export type ItemSupplierDraft = Omit<ItemSupplier, "id">;

// M3 — Inventory: warehouses, locations, stock moves, lots, reorder rules, scrap.
export type Warehouse = {
  id: number;
  name: string;
  code: string;
  active: boolean;
  created_at: string;
};

export type LocationKind = "internal" | "supplier" | "customer" | "production" | "scrap";

export type StockLocation = {
  id: number;
  warehouse_id: number | null;
  name: string;
  kind: LocationKind;
  parent_id: number | null;
  active: boolean;
  created_at: string;
};

export type StockMoveState = "draft" | "confirmed" | "done" | "cancelled";

export type StockMove = {
  id: number;
  item_id: number;
  qty: number;
  source_location_id: number;
  dest_location_id: number;
  state: StockMoveState;
  reference_kind: string;
  reference_id: number | null;
  lot_id: number | null;
  notes: string;
  created_at: string;
  done_at: string | null;
};

export type Quant = {
  item_id: number;
  location_id: number;
  lot_id: number | null;
  qty: number;
};

export type Lot = {
  id: number;
  item_id: number;
  name: string;
  expiry_date: string | null;
  notes: string;
  created_at: string;
};

export type ReorderRule = {
  id: number;
  item_id: number;
  location_id: number;
  min_qty: number;
  max_qty: number;
  qty_multiple: number;
  active: boolean;
  created_at: string;
};

export type ReorderTriggerResult = {
  created_po_ids: number[];
  skipped: { rule_id?: number; reason: string }[];
};

export type ScrapInput = {
  item_id: number;
  qty: number;
  source_location_id: number;
  reason?: string;
  lot_id?: number | null;
};

// M2 — Purchase order lifecycle: draft → confirmed → received (or cancelled).
export type PurchaseOrderStatus = "draft" | "confirmed" | "received" | "cancelled";

export type PurchaseLine = {
  id: number;
  item_id: number | null;
  sequence: number;
  description: string;
  quantity: number;
  unit_of_measure: string;
  unit_cost: number;
  received_qty: number;
  supplier_code: string;
  line_total: number;
};

export type PurchaseLineDraft = Omit<PurchaseLine, "id" | "received_qty" | "line_total"> & { id?: number };

export type PurchaseOrder = {
  id: number;
  ref: string;
  supplier_id: number;
  status: PurchaseOrderStatus;
  expected_date: string | null;
  currency: string;
  notes: string;
  created_at: string;
  confirmed_at: string | null;
  received_at: string | null;
  total: number;
  lines: PurchaseLine[];
};

export type PurchaseOrderDraft = {
  supplier_id: number;
  expected_date?: string | null;
  currency?: string;
  notes?: string;
  lines: PurchaseLineDraft[];
};

export type ReceiptLineInput = {
  line_id: number;
  received_qty: number;
};

export type ReceiptInput = {
  notes?: string;
  lines: ReceiptLineInput[];
};

export type Receipt = {
  id: number;
  received_at: string;
  notes: string;
  lines_json: string;
};

// Studio mode — user-defined launcher tile. Clicking one navigates to
// /p/<slug>, which renders <PageRenderer pageKey={`custom:${slug}`} />.
export type CustomTile = {
  id: number;
  slug: string;
  label: string;
  icon: string;
  color: string;
  sequence: number;
  created_at: string;
};

export type CustomTileDraft = {
  label: string;
  icon?: string;
  color?: string;
  slug?: string;
  sequence?: number;
};

export const api = {
  status: (): Promise<Status> => fetch("/api/status").then(j),
  catalogue: (): Promise<Catalogue> => fetch("/api/catalogue").then(j),
  layouts: {
    registry: (): Promise<PageRegistry> => fetch("/api/layouts/registry").then(j),
    get: (pageKey: string): Promise<PageLayout> =>
      fetch(`/api/layouts/${encodeURIComponent(pageKey)}`).then(j),
    update: (pageKey: string, blocks: PageLayoutBlock[]): Promise<PageLayout> =>
      fetch(`/api/layouts/${encodeURIComponent(pageKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      }).then(j),
    reset: (pageKey: string): Promise<PageLayout> =>
      fetch(`/api/layouts/${encodeURIComponent(pageKey)}/reset`, { method: "POST" }).then(j),
  },
  tiles: {
    list: (): Promise<CustomTile[]> => fetch("/api/tiles").then(j),
    create: (body: CustomTileDraft): Promise<CustomTile> =>
      fetch("/api/tiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    update: (id: number, body: Partial<CustomTileDraft>): Promise<CustomTile> =>
      fetch(`/api/tiles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    delete: (id: number): Promise<{ ok: true }> =>
      fetch(`/api/tiles/${id}`, { method: "DELETE" }).then(j),
  },
  inventory: {
    warehouses: {
      list: (includeInactive = false): Promise<Warehouse[]> =>
        fetch(`/api/inventory/warehouses${includeInactive ? "?include_inactive=true" : ""}`).then(j),
      create: (body: Partial<Warehouse>): Promise<Warehouse> =>
        fetch("/api/inventory/warehouses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      update: (id: number, body: Partial<Warehouse>): Promise<Warehouse> =>
        fetch(`/api/inventory/warehouses/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      delete: (id: number): Promise<{ ok: true; soft_deleted: true }> =>
        fetch(`/api/inventory/warehouses/${id}`, { method: "DELETE" }).then(j),
    },
    locations: {
      list: (params: { warehouse_id?: number; kind?: LocationKind; include_inactive?: boolean } = {}): Promise<StockLocation[]> => {
        const qs = new URLSearchParams();
        if (params.warehouse_id != null) qs.set("warehouse_id", String(params.warehouse_id));
        if (params.kind) qs.set("kind", params.kind);
        if (params.include_inactive) qs.set("include_inactive", "true");
        const s = qs.toString();
        return fetch(`/api/inventory/locations${s ? `?${s}` : ""}`).then(j);
      },
      create: (body: Partial<StockLocation>): Promise<StockLocation> =>
        fetch("/api/inventory/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      update: (id: number, body: Partial<StockLocation>): Promise<StockLocation> =>
        fetch(`/api/inventory/locations/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      delete: (id: number): Promise<{ ok: true; soft_deleted: true }> =>
        fetch(`/api/inventory/locations/${id}`, { method: "DELETE" }).then(j),
    },
    moves: {
      list: (params: { state?: StockMoveState; item_id?: number; location_id?: number; limit?: number } = {}): Promise<StockMove[]> => {
        const qs = new URLSearchParams();
        if (params.state) qs.set("state", params.state);
        if (params.item_id != null) qs.set("item_id", String(params.item_id));
        if (params.location_id != null) qs.set("location_id", String(params.location_id));
        if (params.limit != null) qs.set("limit", String(params.limit));
        const s = qs.toString();
        return fetch(`/api/inventory/moves${s ? `?${s}` : ""}`).then(j);
      },
      create: (body: {
        item_id: number;
        qty: number;
        source_location_id: number;
        dest_location_id: number;
        lot_id?: number | null;
        reference_kind?: string;
        reference_id?: number | null;
        notes?: string;
      }, immediate = false): Promise<StockMove> =>
        fetch(`/api/inventory/moves${immediate ? "?immediate=true" : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      confirm: (id: number): Promise<StockMove> =>
        fetch(`/api/inventory/moves/${id}/confirm`, { method: "POST" }).then(j),
      done: (id: number): Promise<StockMove> =>
        fetch(`/api/inventory/moves/${id}/done`, { method: "POST" }).then(j),
      cancel: (id: number): Promise<StockMove> =>
        fetch(`/api/inventory/moves/${id}/cancel`, { method: "POST" }).then(j),
    },
    quants: (params: { item_id?: number; location_id?: number } = {}): Promise<Quant[]> => {
      const qs = new URLSearchParams();
      if (params.item_id != null) qs.set("item_id", String(params.item_id));
      if (params.location_id != null) qs.set("location_id", String(params.location_id));
      const s = qs.toString();
      return fetch(`/api/inventory/quants${s ? `?${s}` : ""}`).then(j);
    },
    lots: {
      list: (item_id?: number): Promise<Lot[]> =>
        fetch(`/api/inventory/lots${item_id != null ? `?item_id=${item_id}` : ""}`).then(j),
      create: (body: Partial<Lot>): Promise<Lot> =>
        fetch("/api/inventory/lots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      delete: (id: number): Promise<{ ok: true }> =>
        fetch(`/api/inventory/lots/${id}`, { method: "DELETE" }).then(j),
    },
    reorderRules: {
      list: (includeInactive = false): Promise<ReorderRule[]> =>
        fetch(`/api/inventory/reorder-rules${includeInactive ? "?include_inactive=true" : ""}`).then(j),
      create: (body: Partial<ReorderRule>): Promise<ReorderRule> =>
        fetch("/api/inventory/reorder-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      update: (id: number, body: Partial<ReorderRule>): Promise<ReorderRule> =>
        fetch(`/api/inventory/reorder-rules/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      delete: (id: number): Promise<{ ok: true }> =>
        fetch(`/api/inventory/reorder-rules/${id}`, { method: "DELETE" }).then(j),
      trigger: (): Promise<ReorderTriggerResult> =>
        fetch("/api/inventory/reorder-rules/trigger", { method: "POST" }).then(j),
    },
    scrap: (body: ScrapInput): Promise<{ id: number; stock_move_id: number; reason: string; created_at: string }> =>
      fetch("/api/inventory/scrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
  },
  purchaseOrders: {
    list: (status?: PurchaseOrderStatus): Promise<PurchaseOrder[]> => {
      const q = status ? `?status=${status}` : "";
      return fetch(`/api/purchase-orders${q}`).then(j);
    },
    get: (id: number): Promise<PurchaseOrder> => fetch(`/api/purchase-orders/${id}`).then(j),
    create: (body: PurchaseOrderDraft): Promise<PurchaseOrder> =>
      fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    update: (id: number, body: Partial<Omit<PurchaseOrderDraft, "lines">>): Promise<PurchaseOrder> =>
      fetch(`/api/purchase-orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    replaceLines: (id: number, lines: PurchaseLineDraft[]): Promise<PurchaseOrder> =>
      fetch(`/api/purchase-orders/${id}/lines`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lines),
      }).then(j),
    delete: (id: number): Promise<{ ok: true }> =>
      fetch(`/api/purchase-orders/${id}`, { method: "DELETE" }).then(j),
    confirm: (id: number): Promise<PurchaseOrder> =>
      fetch(`/api/purchase-orders/${id}/confirm`, { method: "POST" }).then(j),
    cancel: (id: number): Promise<PurchaseOrder> =>
      fetch(`/api/purchase-orders/${id}/cancel`, { method: "POST" }).then(j),
    receive: (id: number, body: ReceiptInput): Promise<PurchaseOrder> =>
      fetch(`/api/purchase-orders/${id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    receipts: (id: number): Promise<Receipt[]> =>
      fetch(`/api/purchase-orders/${id}/receipts`).then(j),
  },
  suppliers: {
    list: (includeInactive = false): Promise<Supplier[]> =>
      fetch(`/api/suppliers${includeInactive ? "?include_inactive=true" : ""}`).then(j),
    get: (id: number): Promise<Supplier> => fetch(`/api/suppliers/${id}`).then(j),
    create: (body: Partial<Supplier>): Promise<Supplier> =>
      fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    update: (id: number, body: Partial<Supplier>): Promise<Supplier> =>
      fetch(`/api/suppliers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    delete: (id: number): Promise<{ ok: true; soft_deleted: true }> =>
      fetch(`/api/suppliers/${id}`, { method: "DELETE" }).then(j),
    items: {
      list: (supplierId: number): Promise<ItemSupplier[]> =>
        fetch(`/api/suppliers/${supplierId}/items`).then(j),
      create: (supplierId: number, body: ItemSupplierDraft): Promise<ItemSupplier> =>
        fetch(`/api/suppliers/${supplierId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      update: (supplierId: number, linkId: number, body: ItemSupplierDraft): Promise<ItemSupplier> =>
        fetch(`/api/suppliers/${supplierId}/items/${linkId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      delete: (supplierId: number, linkId: number): Promise<{ ok: true }> =>
        fetch(`/api/suppliers/${supplierId}/items/${linkId}`, { method: "DELETE" }).then(j),
    },
  },
  salespeople: {
    list: (includeInactive = false): Promise<Salesperson[]> =>
      fetch(`/api/salespeople${includeInactive ? "?include_inactive=true" : ""}`).then(j),
    create: (body: Partial<Salesperson>): Promise<Salesperson> =>
      fetch("/api/salespeople", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    update: (id: number, body: Partial<Salesperson>): Promise<Salesperson> =>
      fetch(`/api/salespeople/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    delete: (id: number): Promise<{ ok: true; soft_deleted: true }> =>
      fetch(`/api/salespeople/${id}`, { method: "DELETE" }).then(j),
  },
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
    uploadImage: (id: number, file: File): Promise<Item> => {
      const fd = new FormData();
      fd.append("file", file);
      return fetch(`/api/items/${id}/image`, { method: "POST", body: fd }).then(j);
    },
    deleteImage: (id: number): Promise<Item> =>
      fetch(`/api/items/${id}/image`, { method: "DELETE" }).then(j),
    imageUrl: (id: number): string => `/api/items/${id}/image?t=${Date.now()}`,
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
    uploadHero: (id: number, file: File): Promise<Opportunity> => {
      const fd = new FormData();
      fd.append("file", file);
      return fetch(`/api/opportunities/${id}/hero`, { method: "POST", body: fd }).then(j);
    },
    clearHero: (id: number): Promise<Opportunity> =>
      fetch(`/api/opportunities/${id}/hero`, { method: "DELETE" }).then(j),
    heroUrl: (id: number): string => `/api/opportunities/${id}/hero?t=${Date.now()}`,
    assets: {
      list: (oppId: number): Promise<OpportunityAsset[]> =>
        fetch(`/api/opportunities/${oppId}/assets`).then(j),
      upload: (oppId: number, file: File, caption = ""): Promise<OpportunityAsset> => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("caption", caption);
        return fetch(`/api/opportunities/${oppId}/assets`, { method: "POST", body: fd }).then(j);
      },
      update: (oppId: number, assetId: number, body: Partial<Pick<OpportunityAsset, "caption" | "sequence">>): Promise<OpportunityAsset> =>
        fetch(`/api/opportunities/${oppId}/assets/${assetId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(j),
      delete: (oppId: number, assetId: number): Promise<{ ok: true }> =>
        fetch(`/api/opportunities/${oppId}/assets/${assetId}`, { method: "DELETE" }).then(j),
      downloadUrl: (oppId: number, assetId: number) =>
        `/api/opportunities/${oppId}/assets/${assetId}/download`,
    },
  },

  ai: {
    draftStatus: (): Promise<AIDraftStatus> => fetch("/api/sections/draft/status").then(j),
    draft: (prompt: string, paste_key = ""): Promise<{ text: string; provider: string; configured: boolean }> =>
      fetch("/api/sections/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, paste_key }),
      }).then(j),
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

  opportunityTemplates: {
    list: (): Promise<OpportunityTemplate[]> => fetch("/api/opportunity-templates").then(j),
    get: (id: number): Promise<OpportunityTemplate> => fetch(`/api/opportunity-templates/${id}`).then(j),
    create: (body: Partial<OpportunityTemplateDraft>): Promise<OpportunityTemplate> =>
      fetch("/api/opportunity-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    update: (id: number, body: Partial<OpportunityTemplateDraft>): Promise<OpportunityTemplate> =>
      fetch(`/api/opportunity-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(j),
    delete: (id: number): Promise<{ ok: true }> =>
      fetch(`/api/opportunity-templates/${id}`, { method: "DELETE" }).then(j),
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
    uploadHero: (id: number, file: File): Promise<Template> => {
      const fd = new FormData();
      fd.append("file", file);
      return fetch(`/api/templates/${id}/hero`, { method: "POST", body: fd }).then(j);
    },
    clearHero: (id: number): Promise<Template> =>
      fetch(`/api/templates/${id}/hero/clear`, { method: "POST" }).then(j),
    heroUrl: (id: number): string => `/api/templates/${id}/hero?t=${Date.now()}`,
  },
};
