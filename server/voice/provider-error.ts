type ProviderErrorBody = {
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
  };
};

const SECRET_PATTERN = /\b(?:sk|sess|ek)-[A-Za-z0-9_-]+\b/gu;
const SAFE_IDENTIFIER = /^[A-Za-z0-9_.:-]{1,100}$/u;

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value) ? value : undefined;
}

function safeMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const sanitized = value
    .replace(SECRET_PATTERN, "[redacted]")
    .replace(/[\r\n\t]+/gu, " ")
    .trim();
  return sanitized ? sanitized.slice(0, 300) : undefined;
}

export async function providerFailureResponse(response: Response): Promise<Response> {
  const raw = await response.text().catch(() => "");
  let body: ProviderErrorBody = {};
  try {
    body = JSON.parse(raw) as ProviderErrorBody;
  } catch {
    body = {};
  }

  const message = safeMessage(body.error?.message);
  const code = safeIdentifier(body.error?.code);
  const type = safeIdentifier(body.error?.type);
  const requestId = safeIdentifier(response.headers.get("x-request-id"));
  const diagnostic = [
    `status=${response.status}`,
    type ? `type=${type}` : null,
    code ? `code=${code}` : null,
    requestId ? `request_id=${requestId}` : null,
    message ? `message=${message}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  console.warn(`[voice/session] OpenAI rejected session: ${diagnostic}`);

  let error: string;
  if (response.status === 401) {
    error = `OpenAI rejected the server credential (401)${message ? `: ${message}` : "."} Replace OPENAI_API_KEY on the server, restart it, then choose Retry voice.`;
  } else if (response.status === 403) {
    error = `OpenAI denied this project's live voice access (403)${message ? `: ${message}` : "."} Check the project permissions, then choose Retry voice.`;
  } else if (response.status === 429) {
    error = `OpenAI is temporarily limiting live voice requests (429)${message ? `: ${message}` : "."} Wait briefly, then choose Retry voice.`;
  } else {
    error = `OpenAI rejected the live voice session (${response.status})${message ? `: ${message}` : "."} Check the server voice configuration, then choose Retry voice.`;
  }

  return Response.json(
    {
      error,
      providerStatus: response.status,
      ...(code ? { providerCode: code } : {}),
    },
    {
      status: 502,
      headers:
        response.status === 429 && response.headers.get("retry-after")
          ? { "retry-after": response.headers.get("retry-after")! }
          : undefined,
    },
  );
}
