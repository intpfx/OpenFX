export interface SessionRecord {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface AuditRecord {
  id: string;
  category: string;
  action: string;
  status: string;
  payload: string;
  createdAt: string;
}

export interface ApprovalRecord {
  id: string;
  toolId: string;
  summary: string;
  status: string;
  input: string;
  createdAt: string;
}

export interface TelemetryRecord {
  id: string;
  snapshot: string;
  createdAt: string;
}
