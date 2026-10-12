const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!request.headers.get("Authorization")) return json({ error: "Authentication required" }, 401);

  // 아동 작품을 외부 AI 서비스로 전송하려면 보호자 동의, 전송 범위와
  // 사용할 제공자를 먼저 확정해야 합니다. 승인 전에는 외부 전송을 하지 않습니다.
  return json({
    error: "AI provider is not enabled",
    message: "보호자 동의와 외부 AI 전송 범위를 확정한 뒤 서버 측 제공자를 연결해 주세요.",
  }, 501);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
