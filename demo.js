const works = [
  {
    title: "스포츠 이야기 모음",
    folder: "01_작품",
    assetFolder: "01",
    count: 20,
    firstFile: "001_20260930_201748.jpg",
    timestamps: ["201748","201753","201811","201815","201833","201839","201851","201858","201909","201914","201925","201934","201943","201949","201958","202007","202019","202025","202037","202044"],
    notice: "페이지 순서 확인 완료. 작품명·에피소드 경계·공개용 작가명과 보호자 동의는 확정 전입니다.",
    episodes: [
      [1,"도입과 작품 안내",1,2], [2,"스포츠 이야기 1",3,5], [3,"스포츠 이야기 2",6,8],
      [4,"스포츠 이야기 3",9,11], [5,"스포츠 이야기 4",12,15], [6,"마지막 이야기와 끝맺음",16,20]
    ]
  },
  {
    title: "게임 1·2·3 모음집",
    folder: "03_작품",
    assetFolder: "03",
    count: 12,
    firstFile: "001_20260930_203620.jpg",
    timestamps: ["203620","203640","203653","203715","203725","203813","203825","203844","203856","203922","203933","203949"],
    notice: "무기·전투·유혈 표현이 포함될 수 있어 콘텐츠 안내와 권장 연령을 보호자가 검토해야 합니다.",
    episodes: [[1,"게임 이야기 1",2,4],[2,"게임 이야기 2",5,8],[3,"게임 이야기 3",9,12]]
  }
];

let selectedWork = null;
let selectedPage = 0;
let selectedEpisode = 0;
let readerMode = "single";
let zoom = 1;
let continuousObserver = null;
let currentAgentOutput = null;
let ocrWorkerPromise = null;
let ocrRunning = false;
let editorSession = null;
let selectedCoverPage = 1;
let editorSchemaReady = false;
const KOREAN_OCR_MIN_CONFIDENCE = 40;
const KOREAN_OCR_MIN_RATIO = .25;
const SUPABASE_URL = "https://eidxeualhqvdcxizfmll.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_aQpJ9mF2fngaiZHFG89fzw_4ZoiCBPw";
const OPERATOR_USER_ID = "f0d2a994-5837-4bbb-9f27-818f079d4c65";
const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) || null;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const pageParams = new URLSearchParams(window.location.search);
const readerOnlyMode = pageParams.get("mode") === "reader";

function fileName(work, index) {
  return `${String(index + 1).padStart(3,"0")}_20260930_${work.timestamps[index]}.jpg`;
}

function imagePath(work, index) {
  return `./assets/web/works/${work.assetFolder}/${fileName(work,index)}`;
}

function editorTableMissing(error) {
  const message = String(error?.message || error?.details || "");
  return error?.code === "PGRST205" || error?.code === "42P01" || /work_editor_drafts|schema cache/i.test(message);
}

function isOperatorSession() {
  return editorSession?.user?.id === OPERATOR_USER_ID;
}

function setServerStatus(message, state = "") {
  const status = $("#serverSaveStatus");
  status.textContent = message;
  status.dataset.state = state;
}

function draftFor(work) {
  return work?.serverDraft || null;
}

async function loadEditorServerState() {
  if (!db || readerOnlyMode) return;
  const { data:{ session }, error:sessionError } = await db.auth.getSession();
  if (sessionError) console.warn(sessionError);
  editorSession = session || null;
  if (!isOperatorSession()) {
    editorSchemaReady = false;
    setServerStatus("운영자 로그인 후 저장할 수 있습니다.", "login");
    $("#editorLoginLink").hidden = false;
    $("#savePublishingButton").disabled = true;
    return;
  }
  const { data, error } = await db.from("work_editor_drafts").select("work_key,title,cover_page,cover_image_path,script,updated_at").in("work_key", works.map((work) => work.folder));
  if (error) {
    editorSchemaReady = false;
    setServerStatus(editorTableMissing(error) ? "서버 저장 공간을 준비해 주세요." : "서버 자료를 불러오지 못했습니다.", "error");
    $("#savePublishingButton").disabled = true;
    console.warn(error);
    return;
  }
  (data || []).forEach((draft) => {
    const work = works.find((item) => item.folder === draft.work_key);
    if (work) work.serverDraft = draft;
  });
  editorSchemaReady = true;
  $("#editorLoginLink").hidden = true;
  $("#savePublishingButton").disabled = false;
  setServerStatus("서버 연결됨", "ready");
}

function renderPublishingEditor() {
  if (!selectedWork) return;
  const draft = draftFor(selectedWork);
  selectedCoverPage = Math.min(Math.max(Number(draft?.cover_page || selectedCoverPage || 1),1),selectedWork.count);
  $("#coverPreview").src = imagePath(selectedWork, selectedCoverPage - 1);
  $("#coverPreview").alt = `${selectedWork.title} ${selectedCoverPage}쪽 표지 미리보기`;
  $("#coverPageLabel").textContent = `${selectedCoverPage}쪽`;
  $("#workScript").value = draft?.script || "";
  $("#scriptLength").textContent = String($("#workScript").value.length);
  if (!isOperatorSession()) {
    setServerStatus("운영자 로그인 후 저장할 수 있습니다.", "login");
  } else if (!editorSchemaReady) {
    setServerStatus("서버 저장 공간을 준비해 주세요.", "error");
  } else if (draft?.updated_at) {
    setServerStatus(`${new Date(draft.updated_at).toLocaleString("ko-KR")} 저장됨`, "saved");
  } else {
    setServerStatus("서버 연결됨", "ready");
  }
}

function markPublishingChanged() {
  if (isOperatorSession() && editorSchemaReady) setServerStatus("저장하지 않은 변경사항", "changed");
}

async function savePublishingEditor(event) {
  event.preventDefault();
  if (!selectedWork || !db || !isOperatorSession()) {
    setServerStatus("운영자 로그인 후 저장할 수 있습니다.", "error");
    return;
  }
  if (!editorSchemaReady) {
    setServerStatus("서버 저장 공간을 준비해 주세요.", "error");
    return;
  }
  const button = $("#savePublishingButton");
  const script = $("#workScript").value.trim();
  const payload = {
    work_key:selectedWork.folder,
    title:selectedWork.title,
    cover_page:selectedCoverPage,
    cover_image_path:imagePath(selectedWork, selectedCoverPage - 1),
    script,
    updated_by:editorSession.user.id,
    updated_at:new Date().toISOString()
  };
  button.disabled = true;
  button.textContent = "저장 중";
  setServerStatus("서버에 저장 중", "saving");
  const { data, error } = await db.from("work_editor_drafts").upsert(payload, { onConflict:"work_key" }).select().single();
  button.textContent = "서버에 저장";
  button.disabled = false;
  if (error) {
    if (editorTableMissing(error)) editorSchemaReady = false;
    setServerStatus(editorTableMissing(error) ? "서버 저장 공간을 준비해 주세요." : "저장하지 못했습니다. 다시 시도해 주세요.", "error");
    console.error(error);
    return;
  }
  selectedWork.serverDraft = data;
  setServerStatus(`${new Date(data.updated_at).toLocaleString("ko-KR")} 저장됨`, "saved");
  renderCards();
}

function renderCards() {
  $("#demoGrid").innerHTML = works.map((work,index) => `<article class="demo-card">
    <div class="demo-card-cover"><img src="${draftFor(work)?.cover_image_path || imagePath(work,0)}" alt="${work.title} 표지" /></div>
    <div class="demo-card-body"><h2>${work.title}</h2>
      <div class="meta"><span>${work.count}쪽</span><span>${work.episodes.length}개 회차</span></div>
      <button type="button" data-open-work="${index}">열기</button>
    </div></article>`).join("");
  document.querySelectorAll("[data-open-work]").forEach((button) => button.addEventListener("click", () => openWork(Number(button.dataset.openWork))));
}

function openWork(index) {
  selectedWork = works[index];
  selectedCoverPage = Number(draftFor(selectedWork)?.cover_page || 1);
  selectedPage = Number(localStorage.getItem(progressKey(selectedWork)) || 0);
  if (!Number.isInteger(selectedPage) || selectedPage < 0 || selectedPage >= selectedWork.count) selectedPage = 0;
  selectedEpisode = episodeIndexForPage(selectedWork, selectedPage + 1);
  $("#demoGrid").hidden = true; $("#workspace").hidden = false;
  $("#workTitle").textContent = selectedWork.title;
  $("#episodeList").innerHTML = selectedWork.episodes.map(([number,title,start,end]) => `<button class="episode" type="button" data-episode-start="${start}"><strong>${number}화</strong><span><strong>${title}</strong><br><small>${start}~${end}쪽</small></span></button>`).join("");
  $("#reviewCard").innerHTML = `<strong>현재 검토 메모</strong><p>${selectedWork.notice}</p><p><b>공개 상태:</b> 비공개 초안 · 보호자 승인 전</p>`;
  $("#thumbnailStrip").innerHTML = Array.from({length:selectedWork.count},(_,page) => `<button type="button" data-page="${page}" aria-label="${page+1}쪽"><img src="${imagePath(selectedWork,page)}" alt="" loading="lazy"><small>${page+1}</small></button>`).join("");
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => showPage(Number(button.dataset.page))));
  document.querySelectorAll("[data-episode-start]").forEach((button) => button.addEventListener("click", () => {
    selectedEpisode = selectedWork.episodes.findIndex((episode) => episode[2] === Number(button.dataset.episodeStart));
    selectedPage = Number(button.dataset.episodeStart) - 1;
    showTab("pages");
    setReaderMode("continuous");
  }));
  if (readerOnlyMode) {
    document.body.classList.add("reader-only");
    document.title = `${selectedWork.title} · 카툰 전체화면`;
    $("#closeWorkspace").textContent = "서점으로";
    showTab("pages");
    setReaderMode("continuous");
  } else {
    renderContinuousReader();
    setReaderMode("single"); setZoom(1); showTab("pages"); showPage(selectedPage);
    renderPublishingEditor();
  }
  $("#workspace").scrollIntoView({behavior:"smooth",block:"start"});
}

function showPage(index) {
  if (!selectedWork) return;
  selectedPage = Math.min(Math.max(index,0),selectedWork.count-1);
  $("#readerMessage").textContent = "OCR 사용 가능";
  $("#pageImage").src = imagePath(selectedWork,selectedPage);
  $("#pageImage").alt = `${selectedWork.title} ${selectedPage+1}쪽`;
  $("#pageCaption").textContent = `${selectedPage+1} / ${selectedWork.count}쪽 · ${fileName(selectedWork,selectedPage)}`;
  $("#readerLocation").textContent = `${temporaryEpisodeLabel(selectedWork,selectedPage+1)} · ${selectedPage+1}/${selectedWork.count}쪽`;
  $("#previousPage").disabled = selectedPage === 0;
  $("#nextPage").disabled = selectedPage === selectedWork.count-1;
  if (selectedPage === selectedWork.count-1) $("#readerMessage").textContent = "마지막 페이지";
  document.querySelectorAll("[data-page]").forEach((button) => button.classList.toggle("active",Number(button.dataset.page) === selectedPage));
  document.querySelector(`[data-page="${selectedPage}"]`)?.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"});
  localStorage.setItem(progressKey(selectedWork),String(selectedPage));
  applyZoom();
  loadOcrPageDraft();
  loadAgentPageDraft();
}

function progressKey(work) { return `bingo-demo-progress-${work.folder}`; }

function agentDraftKey(work, pageIndex) { return `bingo-agent-draft-${work.folder}-${pageIndex + 1}`; }

function ocrDraftKey(work, pageIndex) { return `bingo-ocr-kor-v2-draft-${work.folder}-${pageIndex + 1}`; }

function readOcrPageDraft() {
  if (!selectedWork) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(ocrDraftKey(selectedWork, selectedPage)) || "null");
    return saved && typeof saved.text === "string" ? saved : null;
  } catch {
    return null;
  }
}

function saveOcrPageDraft(text, confidence = null, work = selectedWork, pageIndex = selectedPage, quality = "draft") {
  if (!work) return null;
  const draft = {
    text:String(text || "").slice(0,4000),
    confidence:confidence !== null && confidence !== undefined && Number.isFinite(Number(confidence)) ? Math.round(Number(confidence)) : null,
    quality,
    sourceVersion:fileName(work, pageIndex),
    updatedAt:new Date().toISOString(),
  };
  localStorage.setItem(ocrDraftKey(work, pageIndex), JSON.stringify(draft));
  return draft;
}

function loadOcrPageDraft() {
  if (!selectedWork || readerOnlyMode) return;
  const draft = readOcrPageDraft();
  $("#ocrDraftPanel").hidden = !draft;
  $("#ocrUseButton").hidden = !draft?.text.trim();
  $("#ocrDraftText").value = draft?.text || "";
  $("#ocrQualityWarning").hidden = draft?.quality !== "rejected";
  $("#ocrConfidence").textContent = draft?.quality === "rejected"
    ? `한글 인식 낮음 ${draft.confidence ?? 0}% · 결과 숨김`
    : draft?.confidence === null || draft?.confidence === undefined
    ? "사람 검수 필요"
    : `한글 인식 신뢰도 ${draft.confidence}% · 사람 검수 필요`;
  $("#ocrRunButton").textContent = draft ? "OCR 다시 만들기" : "OCR 만들기";
  if (draft) $("#readerMessage").textContent = "OCR 초안 준비됨";
}

function updateOcrProgress(progress) {
  const ratio = Math.min(Math.max(Number(progress?.progress) || 0,0),1);
  const labels = {
    "loading tesseract core":"OCR 엔진을 불러오는 중",
    "initializing tesseract":"OCR 엔진을 준비하는 중",
    "loading language traineddata":"한글·영문 인식 자료를 불러오는 중",
    "initializing api":"OCR API를 준비하는 중",
    "recognizing text":"페이지의 글자를 읽는 중",
  };
  $("#ocrProgressBar").style.width = `${Math.round(ratio*100)}%`;
  $("#ocrProgressText").textContent = `${labels[progress?.status] || "OCR 처리 중"} ${Math.round(ratio*100)}%`;
}

async function getOcrWorker() {
  if (!window.Tesseract?.createWorker) throw new Error("OCR 모듈을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = window.Tesseract.createWorker("kor", 1, { logger:updateOcrProgress })
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_pageseg_mode:String(window.Tesseract.PSM?.SPARSE_TEXT ?? 11),
          preserve_interword_spaces:"1",
        });
        return worker;
      })
      .catch((error) => {
        ocrWorkerPromise = null;
        throw error;
      });
  }
  return ocrWorkerPromise;
}

async function prepareKoreanOcrImage(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently:true });
  context.filter = "grayscale(1) contrast(1.55) brightness(1.04)";
  context.drawImage(image,0,0);
  return canvas;
}

function koreanTextSignal(text) {
  const hangul = String(text || "").match(/[ㄱ-ㆎ가-힣]/g)?.length || 0;
  const letters = String(text || "").match(/[A-Za-zㄱ-ㆎ가-힣]/g)?.length || 0;
  return { hangul, ratio:letters ? hangul / letters : 0 };
}

async function runOcr() {
  if (!selectedWork || ocrRunning || readerOnlyMode) return;
  const ocrWork = selectedWork;
  const ocrPage = selectedPage;
  ocrRunning = true;
  $("#ocrRunButton").disabled = true;
  $("#ocrRunButton").textContent = "OCR 처리 중…";
  $("#ocrProgress").hidden = false;
  $("#ocrDraftPanel").hidden = true;
  $("#ocrUseButton").hidden = true;
  $("#readerMessage").textContent = "OCR 처리 중";
  try {
    const [worker, preparedImage] = await Promise.all([
      getOcrWorker(),
      prepareKoreanOcrImage(imagePath(ocrWork, ocrPage)),
    ]);
    const result = await worker.recognize(preparedImage);
    const text = String(result?.data?.text || "").replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
    const confidence = Math.round(Number(result?.data?.confidence) || 0);
    const signal = koreanTextSignal(text);
    const acceptable = confidence >= KOREAN_OCR_MIN_CONFIDENCE && signal.hangul >= 2 && signal.ratio >= KOREAN_OCR_MIN_RATIO;
    const draft = saveOcrPageDraft(acceptable ? text : "", confidence, ocrWork, ocrPage, acceptable ? "draft" : "rejected");
    if (selectedWork !== ocrWork || selectedPage !== ocrPage) return;
    $("#ocrDraftText").value = draft.text;
    $("#ocrQualityWarning").hidden = acceptable;
    $("#ocrConfidence").textContent = acceptable
      ? `한글 인식 신뢰도 ${draft.confidence ?? 0}% · 사람 검수 필요`
      : `한글 인식 낮음 ${draft.confidence ?? 0}% · 결과 숨김`;
    $("#ocrDraftPanel").hidden = false;
    $("#ocrUseButton").hidden = !draft.text;
    $("#readerMessage").textContent = draft.text
      ? "OCR 초안 준비됨"
      : "인식 결과를 확인해 주세요";
  } catch (error) {
    $("#readerMessage").textContent = `OCR 실패: ${error?.message || "인식 모듈을 실행하지 못했습니다."}`;
    loadOcrPageDraft();
  } finally {
    ocrRunning = false;
    $("#ocrRunButton").disabled = false;
    $("#ocrProgress").hidden = true;
    $("#ocrProgressBar").style.width = "0%";
    $("#ocrRunButton").textContent = readOcrPageDraft() ? "OCR 다시 만들기" : "OCR 만들기";
  }
}

function sendOcrDraftToAgent() {
  if (!selectedWork) return;
  const text = $("#ocrDraftText").value.trim();
  if (!text) return;
  saveOcrPageDraft(text, readOcrPageDraft()?.confidence);
  localStorage.setItem(agentDraftKey(selectedWork, selectedPage), text);
  $("#agentPageText").value = text;
  $("#agentHumanConfirmed").checked = false;
  $("#agentError").textContent = "원본과 대조한 뒤 확인해 주세요.";
  $("#agentEditorForm").scrollIntoView({behavior:"smooth",block:"center"});
  $("#agentPageText").focus();
}

function loadAgentPageDraft() {
  if (!selectedWork || readerOnlyMode) return;
  $("#agentPageContext").textContent = `${selectedWork.title} · ${selectedPage + 1}/${selectedWork.count}쪽`;
  $("#agentEpisodeContext").textContent = temporaryEpisodeLabel(selectedWork, selectedPage + 1);
  $("#agentPageText").value = localStorage.getItem(agentDraftKey(selectedWork, selectedPage)) || "";
  $("#agentHumanConfirmed").checked = false;
  $("#agentError").textContent = "";
  $("#agentResultPanel").hidden = true;
  currentAgentOutput = null;
}

function renderAgentSuggestions(output) {
  currentAgentOutput = output;
  $("#agentResultSummary").textContent = output.result.summary;
  $("#agentSuggestionList").innerHTML = output.result.suggestions.length ? output.result.suggestions.map((suggestion) => `<article class="agent-suggestion"><div class="agent-suggestion-copy"><span>${escapeHtml(suggestion.reason)}</span><del>${escapeHtml(suggestion.original)}</del><ins>${escapeHtml(suggestion.replacement)}</ins></div><button type="button" data-agent-suggestion="${escapeHtml(suggestion.id)}">이 제안 적용</button></article>`).join("") : `<div class="agent-no-change">현재 문장을 그대로 유지하는 것이 좋습니다.</div>`;
  $("#agentResultPanel").hidden = false;
}

function runPageAgent(event) {
  event.preventDefault();
  $("#agentError").textContent = "";
  if (!selectedWork) return;
  if (!$("#agentHumanConfirmed").checked) {
    $("#agentError").textContent = "원본 이미지와 문장을 사람이 확인했는지 체크해 주세요.";
    return;
  }
  try {
    const output = window.BingoEditingAgent.run({
      type:"editing",
      sourceScope:"actual-local-review",
      localOnly:true,
      humanConfirmed:true,
      bookId:selectedWork.folder,
      episodeId:temporaryEpisodeLabel(selectedWork, selectedPage + 1),
      sourceVersion:fileName(selectedWork, selectedPage),
      inputText:$("#agentPageText").value,
    });
    localStorage.setItem(agentDraftKey(selectedWork, selectedPage), $("#agentPageText").value.trim());
    renderAgentSuggestions(output);
  } catch (error) {
    $("#agentError").textContent = error.message;
    $("#agentResultPanel").hidden = true;
  }
}

function applyAgentSuggestion(id) {
  const suggestion = currentAgentOutput?.result.suggestions.find((item) => item.id === id);
  if (!suggestion || !selectedWork) return;
  $("#agentPageText").value = suggestion.replacement;
  localStorage.setItem(agentDraftKey(selectedWork, selectedPage), suggestion.replacement);
  $("#agentResultSummary").textContent = "선택한 제안을 페이지 초안에 적용했습니다. 원본 이미지는 변경되지 않았습니다.";
}

function temporaryEpisodeLabel(work,pageNumber) {
  const episode = work.episodes.find(([, ,start,end]) => pageNumber >= start && pageNumber <= end);
  return episode ? `임시 ${episode[0]}화` : "에피소드 미지정";
}

function episodeIndexForPage(work, pageNumber) {
  const index = work.episodes.findIndex(([, ,start,end]) => pageNumber >= start && pageNumber <= end);
  return index < 0 ? 0 : index;
}

function episodeProgressKey(work, episodeNumber) {
  return `bingo-demo-episode-progress-${work.folder}-${episodeNumber}`;
}

function renderContinuousReader() {
  const episode = selectedWork.episodes[selectedEpisode];
  const [number, episodeTitle, episodeStart, episodeEnd] = episode;
  const title = readerOnlyMode ? selectedWork.title : episodeTitle;
  const start = readerOnlyMode ? 1 : episodeStart;
  const end = readerOnlyMode ? selectedWork.count : episodeEnd;
  const savedValue = readerOnlyMode ? localStorage.getItem(progressKey(selectedWork)) : localStorage.getItem(episodeProgressKey(selectedWork,number));
  const savedPage = readerOnlyMode ? Number(savedValue || 0) : Number(savedValue || start) - 1;
  selectedPage = Math.min(Math.max(savedPage,start-1),end-1);
  $("#episodeReaderTitle").textContent = readerOnlyMode ? title : `임시 ${number}화 · ${title}`;
  const initialPosition = selectedPage - start + 2;
  const initialTotal = end - start + 1;
  const initialProgress = Math.round((initialPosition / initialTotal) * 100);
  $("#readerLocation").textContent = readerOnlyMode ? `전체 작품 · ${initialPosition}/${initialTotal}쪽` : `임시 ${number}화 · 컷 ${initialPosition}/${initialTotal} · 원본 ${selectedPage+1}쪽`;
  $("#episodeProgress").textContent = `${initialProgress}%`;
  $("#episodeProgressBar").style.width = `${initialProgress}%`;
  $("#previousEpisode").disabled = selectedEpisode === 0;
  $("#nextEpisode").disabled = selectedEpisode === selectedWork.episodes.length - 1;
  $("#continuousReader").innerHTML = Array.from({length:end-start+1},(_,offset) => {
    const page = start + offset - 1;
    const pageLabel = readerOnlyMode ? `${offset+1}/${end-start+1}쪽` : `임시 컷 ${offset+1}/${end-start+1} · 원본 ${page+1}쪽`;
    return `<figure class="continuous-page" id="continuous-page-${page+1}"><img src="${imagePath(selectedWork,page)}" alt="${title} ${pageLabel}" loading="lazy"><figcaption>${pageLabel}</figcaption></figure>`;
  }).join("");
  $("#continuousReader").querySelectorAll("img").forEach((image) => addImageStatusHandlers(image));
  continuousObserver?.disconnect();
  continuousObserver = new IntersectionObserver((entries) => {
    if (readerMode !== "continuous") return;
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a,b) => b.intersectionRatio-a.intersectionRatio)[0];
    if (!visible) return;
    selectedPage = Number(visible.target.id.replace("continuous-page-",""))-1;
    const position = selectedPage - start + 2;
    const total = end - start + 1;
    const progress = Math.round((position / total) * 100);
    $("#readerLocation").textContent = readerOnlyMode ? `전체 작품 · ${position}/${total}쪽` : `임시 ${number}화 · 컷 ${position}/${total} · 원본 ${selectedPage+1}쪽`;
    $("#episodeProgress").textContent = `${progress}%`;
    $("#episodeProgressBar").style.width = `${progress}%`;
    localStorage.setItem(progressKey(selectedWork),String(selectedPage));
    if (!readerOnlyMode) localStorage.setItem(episodeProgressKey(selectedWork,number),String(selectedPage+1));
  },{threshold:[.35,.6]});
  $("#continuousReader").querySelectorAll(".continuous-page").forEach((page) => continuousObserver.observe(page));
}

function setReaderMode(mode) {
  readerMode = mode;
  const continuous = mode === "continuous";
  $("#singlePageViewer").hidden = continuous;
  $("#webtoonViewer").hidden = !continuous;
  $("#singleModeButton").classList.toggle("active",!continuous);
  $("#continuousModeButton").classList.toggle("active",continuous);
  $("#thumbnailStrip").hidden = continuous;
  $("#zoomOutButton").disabled = continuous;
  $("#zoomInButton").disabled = continuous;
  $("#fitButton").disabled = continuous;
  if (continuous) {
    selectedEpisode = episodeIndexForPage(selectedWork, selectedPage + 1);
    renderContinuousReader();
    document.querySelector(`#continuous-page-${selectedPage+1}`)?.scrollIntoView({behavior:"smooth",block:"start"});
  }
}

function changeEpisode(direction) {
  if (readerOnlyMode) return;
  const next = selectedEpisode + direction;
  if (next < 0 || next >= selectedWork.episodes.length) return;
  selectedEpisode = next;
  renderContinuousReader();
  $("#webtoonViewer").scrollIntoView({behavior:"smooth",block:"start"});
}

function setZoom(value) {
  zoom = Math.min(Math.max(value,.5),2);
  $("#zoomValue").textContent = `${Math.round(zoom*100)}%`;
  applyZoom();
}

function applyZoom() {
  const image = $("#pageImage");
  image.style.width = `${Math.round(zoom*100)}%`;
}

function addImageStatusHandlers(image) {
  image.addEventListener("load",() => {
    if (!readOcrPageDraft()) $("#readerMessage").textContent = "OCR 사용 가능";
  });
  image.addEventListener("error",() => { $("#readerMessage").textContent = "이미지를 불러오지 못했습니다. 파일 경로와 로컬 서버를 확인하세요."; });
}

function setupPanControls() {
  const pan = $("#imagePan");
  let active = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  pan.addEventListener("pointerdown",(event) => {
    if (zoom <= 1) return;
    active = true; startX = event.clientX; startY = event.clientY;
    startLeft = pan.scrollLeft; startTop = pan.scrollTop;
    pan.classList.add("dragging"); pan.setPointerCapture(event.pointerId);
  });
  pan.addEventListener("pointermove",(event) => {
    if (!active) return;
    pan.scrollLeft = startLeft-(event.clientX-startX);
    pan.scrollTop = startTop-(event.clientY-startY);
  });
  const finish = (event) => { if (!active) return; active = false; pan.classList.remove("dragging"); if (pan.hasPointerCapture(event.pointerId)) pan.releasePointerCapture(event.pointerId); };
  pan.addEventListener("pointerup",finish);
  pan.addEventListener("pointercancel",finish);
}

function showTab(name) {
  document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active",button.dataset.tab === name));
  document.querySelectorAll("[data-panel]").forEach((panel) => { const active = panel.dataset.panel === name; panel.classList.toggle("active",active); panel.hidden = !active; });
  if (name === "publishing") renderPublishingEditor();
}

function selectCurrentPageAsCover() {
  if (!selectedWork) return;
  selectedCoverPage = selectedPage + 1;
  $("#coverPreview").src = imagePath(selectedWork, selectedPage);
  $("#coverPreview").alt = `${selectedWork.title} ${selectedCoverPage}쪽 표지 미리보기`;
  $("#coverPageLabel").textContent = `${selectedCoverPage}쪽`;
  $("#readerMessage").textContent = `${selectedCoverPage}쪽을 표지로 선택했습니다.`;
  markPublishingChanged();
}

async function initializeEditor() {
  await loadEditorServerState();
  renderCards();
  const requestedWorkValue = pageParams.get("work");
  const requestedWork = requestedWorkValue === null ? null : Number(requestedWorkValue);
  if (Number.isInteger(requestedWork) && requestedWork >= 0 && requestedWork < works.length) openWork(requestedWork);
}

initializeEditor();
document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click",() => showTab(button.dataset.tab)));
$("#previousPage").addEventListener("click",() => showPage(selectedPage-1));
$("#nextPage").addEventListener("click",() => showPage(selectedPage+1));
$("#singleModeButton").addEventListener("click",() => setReaderMode("single"));
$("#continuousModeButton").addEventListener("click",() => setReaderMode("continuous"));
$("#previousEpisode").addEventListener("click",() => changeEpisode(-1));
$("#nextEpisode").addEventListener("click",() => changeEpisode(1));
$("#episodeListButton").addEventListener("click",() => showTab("episodes"));
$("#zoomOutButton").addEventListener("click",() => setZoom(zoom-.25));
$("#zoomInButton").addEventListener("click",() => setZoom(zoom+.25));
$("#fitButton").addEventListener("click",() => setZoom(1));
$("#ocrRunButton").addEventListener("click",runOcr);
$("#ocrUseButton").addEventListener("click",sendOcrDraftToAgent);
$("#ocrDraftText").addEventListener("input",() => {
  if (!selectedWork) return;
  const existing = readOcrPageDraft();
  saveOcrPageDraft($("#ocrDraftText").value, existing?.confidence, selectedWork, selectedPage, $("#ocrDraftText").value.trim() ? "manual" : existing?.quality);
  $("#ocrQualityWarning").hidden = Boolean($("#ocrDraftText").value.trim());
  $("#ocrUseButton").hidden = !$("#ocrDraftText").value.trim();
});
$("#agentEditorForm").addEventListener("submit",runPageAgent);
$("#agentPageText").addEventListener("input",() => { if (selectedWork) localStorage.setItem(agentDraftKey(selectedWork, selectedPage), $("#agentPageText").value); });
$("#agentSuggestionList").addEventListener("click",(event) => { const button = event.target.closest("[data-agent-suggestion]"); if (button) applyAgentSuggestion(button.dataset.agentSuggestion); });
$("#agentClearButton").addEventListener("click",() => { if (!selectedWork) return; localStorage.removeItem(agentDraftKey(selectedWork, selectedPage)); $("#agentPageText").value = ""; $("#agentHumanConfirmed").checked = false; $("#agentResultPanel").hidden = true; $("#agentError").textContent = "이 페이지의 기기 내 초안을 지웠습니다."; currentAgentOutput = null; });
$("#setCurrentCoverButton").addEventListener("click",selectCurrentPageAsCover);
$("#selectCoverButton").addEventListener("click",selectCurrentPageAsCover);
$("#workScript").addEventListener("input",() => {
  $("#scriptLength").textContent = String($("#workScript").value.length);
  markPublishingChanged();
});
$("#publishingEditorForm").addEventListener("submit",savePublishingEditor);
$("#contrastButton").addEventListener("click",(event) => { const active = document.body.classList.toggle("high-contrast"); event.currentTarget.setAttribute("aria-pressed",String(active)); });
$("#readerFullscreenButton").addEventListener("click",async () => {
  try { if (!document.fullscreenElement) await $("#workspace").requestFullscreen(); else await document.exitFullscreen(); }
  catch { $("#readerMessage").textContent = "이 브라우저에서는 전체화면을 열 수 없습니다."; }
});
addImageStatusHandlers($("#pageImage"));
setupPanControls();
document.addEventListener("keydown",(event) => {
  if (!selectedWork || $("#workspace").hidden || event.target.matches("input,textarea,select")) return;
  if (readerMode === "single" && event.key === "ArrowLeft") showPage(selectedPage-1);
  if (readerMode === "single" && event.key === "ArrowRight") showPage(selectedPage+1);
  if (readerMode === "single" && (event.key === "+" || event.key === "=")) setZoom(zoom+.25);
  if (readerMode === "single" && event.key === "-") setZoom(zoom-.25);
  if (event.key === "1") setReaderMode("single");
  if (event.key === "2") setReaderMode("continuous");
});
$("#closeWorkspace").addEventListener("click",() => {
  if (readerOnlyMode) { window.location.href = "./index.html#home"; return; }
  $("#workspace").hidden = true; $("#demoGrid").hidden = false; window.scrollTo({top:0,behavior:"smooth"});
});
