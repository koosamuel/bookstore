import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_OPERATOR_USER_ID = "f0d2a994-5837-4bbb-9f27-818f079d4c65";

type Suggestion = {
  id: string;
  original: string;
  replacement: string;
  reason: string;
};

type ClaudeTextBlock = {
  type?: string;
  text?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function containsSensitiveText(value: string) {
  const patterns = [
    /\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/,
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
    /(?:학교|초등학교|중학교|고등학교|학년|반|담임|주소|연락처|전화번호|휴대폰)\s*[:：]?\s*\S+/,
    /(?:실명|본명|이름)\s*[:：]?\s*[가-힣]{2,4}/,
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function parseClaudeJson(rawText: string, inputText: string) {
  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as {
    summary?: unknown;
    suggestions?: unknown;
  };
  const candidates = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const suggestions: Suggestion[] = [];

  for (const candidate of candidates.slice(0, 5)) {
    if (!candidate || typeof candidate !== "object") continue;
    const source = candidate as Record<string, unknown>;
    const original = String(source.original ?? "").trim();
    const replacement = String(source.replacement ?? "").trim();
    const reason = String(source.reason ?? "").trim();
    if (!original || !replacement || !inputText.includes(original)) continue;
    suggestions.push({
      id: `claude-${suggestions.length + 1}`,
      original: original.slice(0, 500),
      replacement: replacement.slice(0, 500),
      reason: reason.slice(0, 300),
    });
  }

  return {
    summary: String(parsed.summary ?? "선택 적용할 수 있는 편집 제안입니다.").slice(0, 300),
    suggestions,
  };
}

async function authenticateOperator(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return false;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return false;
  const user = await response.json() as { id?: string };
  const operatorUserId = Deno.env.get("OPERATOR_USER_ID") || DEFAULT_OPERATOR_USER_ID;
  return Boolean(user.id && user.id === operatorUserId);
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  try {
    if (!(await authenticateOperator(request))) {
      return jsonResponse({ error: "operator authentication required" }, 401);
    }

    const body = await request.json() as Record<string, unknown>;
    const inputText = String(body.inputText ?? "").trim();
    const humanConfirmed = body.humanConfirmed === true;
    const externalConsent = body.externalConsent === true;
    const sourceScope = String(body.sourceScope ?? "");

    if (!humanConfirmed || sourceScope !== "actual-local-review") {
      return jsonResponse({ error: "human-confirmed text only" }, 400);
    }
    if (!externalConsent) return jsonResponse({ error: "external transfer consent required" }, 400);
    if (inputText.length < 2 || inputText.length > 4000) {
      return jsonResponse({ error: "inputText must contain 2 to 4000 characters" }, 400);
    }
    if (containsSensitiveText(inputText)) {
      return jsonResponse({ error: "sensitive information candidate detected" }, 400);
    }
    if (Deno.env.get("CLAUDE_EXTERNAL_AI_ENABLED") !== "true") {
      return jsonResponse({ error: "external AI is disabled" }, 503);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return jsonResponse({ error: "Claude API is not configured" }, 503);
    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.2,
        system: [
          "당신은 어린이 작품 편집 보조자입니다.",
          "아이의 말투와 의도를 보존하고 작품을 대신 쓰지 마세요.",
          "맞춤법, 띄어쓰기, 이해하기 어려운 표현만 선택 가능한 제안으로 제시하세요.",
          "original은 입력문에 정확히 존재하는 문자열이어야 합니다.",
          "최대 5개만 제안하고 JSON 이외의 문장을 출력하지 마세요.",
          '형식: {"summary":"요약","suggestions":[{"original":"원문","replacement":"제안","reason":"이유"}]}',
        ].join("\n"),
        messages: [{ role: "user", content: inputText }],
      }),
    });

    if (!claudeResponse.ok) {
      console.error("Claude API request failed", claudeResponse.status);
      if (claudeResponse.status === 401) {
        return jsonResponse({ error: "Claude API key was rejected" }, 502);
      }
      return jsonResponse({ error: "Claude API request failed" }, 502);
    }

    const claudeData = await claudeResponse.json() as { content?: ClaudeTextBlock[] };
    const rawText = (claudeData.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n");
    const result = parseClaudeJson(rawText, inputText);

    return jsonResponse({
      provider: "anthropic",
      model,
      externalTransfer: true,
      requiresHumanApproval: true,
      status: "draft",
      result,
    });
  } catch (error) {
    console.error("generate-book-content failed", error instanceof Error ? error.name : "unknown");
    return jsonResponse({ error: "unable to generate editing suggestions" }, 500);
  }
});
