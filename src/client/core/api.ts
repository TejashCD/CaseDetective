import type {
  AccuseRequest,
  AccuseResponse,
  CaseReport,
  CaseStarted,
  CaseToken,
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

export const api = {
  createCase: (material: string) => request<CaseStarted>("/api/case", { material } satisfies CreateCaseRequest),
  playDemo: () => request<CaseStarted>("/api/demo", {}),
  getCase: (token: string) => request<CaseView>("/api/case/view", { token } satisfies CaseToken),
  talk: (token: string, npc: number, text: string) => request<TalkResponse>("/api/case/talk", { token, npc, text } satisfies TalkRequest),
  accuse: (token: string, text: string) => request<AccuseResponse>("/api/case/accuse", { token, text } satisfies AccuseRequest),
  getReport: (token: string) => request<CaseReport>("/api/case/report", { token } satisfies CaseToken),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
