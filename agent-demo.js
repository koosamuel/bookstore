(function attachEditingAgent(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BingoEditingAgent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEditingAgent() {
  "use strict";

  const SCHEMA_VERSION = "1.0";
  const MAX_INPUT_LENGTH = 4000;
  const MAX_ATTEMPTS = 2;
  const PRIVACY_PATTERNS = [
    { label: "이메일 주소", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
    { label: "전화번호", pattern: /(?:01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/ },
    { label: "주민등록번호 형식", pattern: /\b\d{6}[-\s]?[1-4]\d{6}\b/ },
  ];

  function normalizeText(value) {
    return String(value ?? "").replace(/\r\n?/g, "\n").trim();
  }

  function validateRequest(request) {
    if (!request || typeof request !== "object") throw new Error("Agent 요청 형식이 올바르지 않습니다.");
    if (request.type !== "editing") throw new Error("현재는 편집 제안 Agent만 사용할 수 있습니다.");
    const syntheticDemo = request.sourceScope === "synthetic-demo";
    const confirmedLocalReview = request.sourceScope === "actual-local-review" && request.localOnly === true && request.humanConfirmed === true;
    if (!syntheticDemo && !confirmedLocalReview) throw new Error("합성 데모 자료 또는 사람이 확인한 로컬 검토 자료에서만 Agent를 실행할 수 있습니다.");
    const inputText = normalizeText(request.inputText);
    if (!inputText) throw new Error("사람이 확인한 합성 원문을 입력해 주세요.");
    if (inputText.length > MAX_INPUT_LENGTH) throw new Error(`원문은 ${MAX_INPUT_LENGTH.toLocaleString("ko-KR")}자 이하여야 합니다.`);
    const privacyHit = PRIVACY_PATTERNS.find(({ pattern }) => pattern.test(inputText));
    if (privacyHit) throw new Error(`${privacyHit.label}로 보이는 내용이 있어 실행을 중단했습니다.`);
    return { ...request, inputText };
  }

  function addSuggestion(list, code, original, replacement, reason) {
    if (!original || original === replacement || list.some((item) => item.code === code)) return;
    list.push({
      id: `edit-${String(list.length + 1).padStart(2, "0")}`,
      code,
      original,
      replacement,
      reason,
      confidence: "high",
    });
  }

  function buildSuggestions(text) {
    const suggestions = [];
    const compactSpacing = text.replace(/[^\S\n]{2,}/g, " ");
    addSuggestion(suggestions, "spacing", text, compactSpacing, "연속된 공백을 한 칸으로 정리합니다.");

    const compactPunctuation = text.replace(/([!?])\1{1,}/g, "$1");
    addSuggestion(suggestions, "punctuation-repeat", text, compactPunctuation, "반복된 느낌표·물음표를 하나로 줄이는 안입니다.");

    if (!/[.!?。！？…]$/.test(text)) {
      addSuggestion(suggestions, "sentence-ending", text, `${text}.`, "문장이 끝났음을 알 수 있도록 마침표를 제안합니다.");
    }

    return suggestions.slice(0, 8);
  }

  function buildCandidate(request, now, attemptCount) {
    const suggestions = buildSuggestions(request.inputText);
    return {
      schemaVersion: SCHEMA_VERSION,
      runId: `synthetic-edit-${now.replace(/[^0-9]/g, "").slice(0, 17)}`,
      agent: {
        type: "editing",
        role: "어린이 원문 보존 편집 보조",
        goal: "원문을 바꾸지 않고 기계적으로 확인 가능한 수정 후보만 제안한다.",
        tools: ["spacing-check", "punctuation-check", "privacy-pattern-stop"],
      },
      input: {
        bookId: String(request.bookId || ""),
        episodeId: request.episodeId || null,
        sourceScope: request.sourceScope,
        sourceVersion: String(request.sourceVersion || now),
        originalText: request.inputText,
        humanConfirmed: request.humanConfirmed === true,
        localOnly: request.localOnly === true,
      },
      result: {
        suggestions,
        summary: suggestions.length
          ? `${suggestions.length}개의 기계적 편집 후보를 찾았습니다.`
          : "기계적으로 제안할 수정 사항을 찾지 못했습니다. 원문을 유지합니다.",
      },
      validation: {
        valid: true,
        attemptCount,
        warnings: suggestions.length ? [] : ["자동 제안 없음"],
      },
      externalTransfer: false,
      requiresHumanApproval: true,
      status: "draft",
      createdAt: now,
    };
  }

  function validateOutput(output, originalText) {
    const errors = [];
    if (!output || typeof output !== "object") return { valid: false, errors: ["출력이 객체가 아닙니다."] };
    if (output.schemaVersion !== SCHEMA_VERSION) errors.push("지원하지 않는 schemaVersion입니다.");
    if (output.agent?.type !== "editing") errors.push("Agent 유형이 editing이 아닙니다.");
    const safeScope = output.input?.sourceScope === "synthetic-demo" || (output.input?.sourceScope === "actual-local-review" && output.input?.humanConfirmed === true && output.input?.localOnly === true);
    if (!safeScope) errors.push("허용된 안전 검토 범위가 아닙니다.");
    if (output.input?.originalText !== originalText) errors.push("원문 보존 검증에 실패했습니다.");
    if (!Array.isArray(output.result?.suggestions)) errors.push("suggestions 배열이 없습니다.");
    if (output.result?.suggestions?.length > 8) errors.push("제안 개수가 제한을 초과했습니다.");
    output.result?.suggestions?.forEach((suggestion, index) => {
      if (!suggestion?.id || !suggestion?.reason || typeof suggestion?.replacement !== "string") {
        errors.push(`${index + 1}번 제안 형식이 올바르지 않습니다.`);
      }
    });
    if (output.externalTransfer !== false) errors.push("외부 전송 차단 상태가 아닙니다.");
    if (output.requiresHumanApproval !== true) errors.push("사람 승인 조건이 누락됐습니다.");
    if (output.status !== "draft") errors.push("초안 상태가 아닙니다.");
    return { valid: errors.length === 0, errors };
  }

  function run(request, options = {}) {
    const safeRequest = validateRequest(request);
    const now = options.now || new Date().toISOString();
    let lastValidation = { valid: false, errors: ["실행 전"] };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const candidate = buildCandidate(safeRequest, now, attempt);
      lastValidation = validateOutput(candidate, safeRequest.inputText);
      if (lastValidation.valid) return candidate;
    }
    throw new Error(`출력 검증에 실패했습니다: ${lastValidation.errors.join(" ")}`);
  }

  function parse(value) {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return null; }
  }

  return {
    SCHEMA_VERSION,
    MAX_INPUT_LENGTH,
    MAX_ATTEMPTS,
    run,
    validateRequest,
    validateOutput,
    parse,
  };
});
