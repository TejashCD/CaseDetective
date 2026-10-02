import type {
  AccuseRequest,
  AccuseResponse,
  CaseReport,
  CaseView,
  CreateCaseRequest,
  ErrorResponse,
  TalkRequest,
  TalkResponse,
} from "../../shared/api.ts";

export class ApiError extends Error {
  override name = "ApiError";
  /** 0 when the server couldn't be reached. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, body?: object): Promise<T> {
  const init: RequestInit = { headers: { accept: "application/json" } };
  if (body !== undefined) {
    init.method = "POST";
    init.headers = { accept: "application/json", "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError("Can't reach the CaseDetective server. Is it still running?", 0);
  }
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as Partial<ErrorResponse>).error ?? `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

const caseUrl = (id: string) => `/api/case/${encodeURIComponent(id)}`;

export const api = {
  createCase: (material: string) => request<CaseView>("/api/case", { material } satisfies CreateCaseRequest),
  playDemo: () => request<CaseView>("/api/demo", {}),
  getCase: (id: string) => request<CaseView>(caseUrl(id)),
  talk: (id: string, npc: number, text: string) => request<TalkResponse>(`${caseUrl(id)}/talk`, { npc, text } satisfies TalkRequest),
  accuse: (id: string, text: string) => request<AccuseResponse>(`${caseUrl(id)}/accuse`, { text } satisfies AccuseRequest),
  getReport: (id: string) => request<CaseReport>(`${caseUrl(id)}/report`),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
