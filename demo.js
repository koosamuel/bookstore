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
      [1,"먼지귀들의 연습",1,3], [2,"이게 복싱?",4,6], [3,"이게 복싱? (2)",7,8],
      [4,"던전",9,11], [5,"이상한 축구",12,16], [6,"난겐 죽이기",17,17], [7,"이게 배드민턴?",18,20]
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
let episodeFullscreenMode = false;
let publicEpisodeActive = false;
let currentPageCrop = { x:0, y:0, width:100, height:100 };
let autoTurnEnabled = false;
let autoTurnTimer = null;
let presentationSlideIndex = 0;
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
  if (index >= work.timestamps.length) return work.importedPages?.[index - work.timestamps.length]?.name || `가져온 이미지 ${index + 1}`;
  return `${String(index + 1).padStart(3,"0")}_20260930_${work.timestamps[index]}.jpg`;
}

function imagePath(work, index) {
  if (index >= work.timestamps.length) return work.importedPages?.[index - work.timestamps.length]?.url || "";
  return `./assets/web/works/${work.assetFolder}/${fileName(work,index)}`;
}

function episodeTitleKey(work, episodeIndex) { return `bingo-episode-title-${work.folder}-${episodeIndex + 1}`; }
function episodeStructureKey(work) { return `bingo-episode-structure-${work.folder}`; }

function pageCropKey(work, pageIndex) { return `bingo-page-crop-${work.folder}-${pageIndex + 1}`; }

function normalizeCrop(value) {
  const crop = value && typeof value === "object" ? value : {};
  const x = Math.min(Math.max(Number(crop.x) || 0,0),90);
  const y = Math.min(Math.max(Number(crop.y) || 0,0),90);
  const width = Math.min(Math.max(Number(crop.width) || 100,10),100-x);
  const height = Math.min(Math.max(Number(crop.height) || 100,10),100-y);
  return { x, y, width, height };
}

function readPageCrop(work, pageIndex) {
  try { return normalizeCrop(JSON.parse(localStorage.getItem(pageCropKey(work,pageIndex)) || "null")); }
  catch { return normalizeCrop(null); }
}

function savePageCrop(work, pageIndex, crop) {
  const normalized = normalizeCrop(crop);
  localStorage.setItem(pageCropKey(work,pageIndex),JSON.stringify(normalized));
  return normalized;
}

function loadSavedEpisodeTitles(work) {
  work.episodes.forEach((episode,index) => {
    const savedTitle = localStorage.getItem(episodeTitleKey(work,index))?.trim();
    if (savedTitle) episode[1] = savedTitle;
  });
}

function loadSavedEpisodeStructure(work) {
  try {
    const saved = JSON.parse(localStorage.getItem(episodeStructureKey(work)) || "null");
    if (!Array.isArray(saved) || saved.length !== work.episodes.length) return;
    const valid = saved.every((episode,index) => Array.isArray(episode) && episode.length === 4 && Number(episode[0]) === index + 1 && Number.isInteger(Number(episode[2])) && Number.isInteger(Number(episode[3])) && Number(episode[2]) >= 1 && Number(episode[3]) >= Number(episode[2]) && Number(episode[3]) <= work.count && (index === 0 ? Number(episode[2]) === 1 : Number(episode[2]) === Number(saved[index-1][3]) + 1));
    if (valid) work.episodes = saved.map(([number,title,start,end]) => [Number(number),String(title),Number(start),Number(end)]);
  } catch { /* 잘못된 기기 저장값은 기본 회차 구성을 사용한다. */ }
}

function saveEpisodeStructure(work) {
  localStorage.setItem(episodeStructureKey(work),JSON.stringify(work.episodes));
}

function openPageImageDatabase() {
  return new Promise((resolve,reject) => {
    if (!window.indexedDB) { reject(new Error("이 브라우저는 이미지 보관을 지원하지 않습니다.")); return; }
    const request = indexedDB.open("bingo-bookstore-editor",2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("imported-pages")) database.createObjectStore("imported-pages",{keyPath:"id"});
      if (!database.objectStoreNames.contains("presentation-files")) database.createObjectStore("presentation-files",{keyPath:"id"});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("이미지 저장 공간을 열지 못했습니다."));
  });
}

async function readPresentationRecords() {
  const database = await openPageImageDatabase();
  return new Promise((resolve,reject) => {
    const transaction = database.transaction("presentation-files","readonly");
    const request = transaction.objectStore("presentation-files").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function storePresentationRecord(record) {
  const database = await openPageImageDatabase();
  return new Promise((resolve,reject) => {
    const transaction = database.transaction("presentation-files","readwrite");
    transaction.objectStore("presentation-files").put(record);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

async function readImportedPageRecords() {
  const database = await openPageImageDatabase();
  return new Promise((resolve,reject) => {
    const transaction = database.transaction("imported-pages","readonly");
    const request = transaction.objectStore("imported-pages").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function storeImportedPageRecord(record) {
  const database = await openPageImageDatabase();
  return new Promise((resolve,reject) => {
    const transaction = database.transaction("imported-pages","readwrite");
    transaction.objectStore("imported-pages").put(record);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

function attachImportedRecord(work,record) {
  work.importedPages ||= [];
  work.importedPages.push({...record,url:URL.createObjectURL(record.blob)});
  work.importedPages.sort((left,right) => left.order-right.order);
  work.count = work.timestamps.length + work.importedPages.length;
}

async function loadImportedPages() {
  works.forEach((work) => { work.importedPages = []; work.presentationFiles = []; work.count = work.timestamps.length; });
  try {
    const [records,presentationRecords] = await Promise.all([readImportedPageRecords(),readPresentationRecords()]);
    records.sort((left,right) => left.order-right.order).forEach((record) => {
      const work = works.find((item) => item.folder === record.workKey);
      if (work && record.blob instanceof Blob) attachImportedRecord(work,record);
    });
    works.forEach((work) => {
      if (work.importedPages.length && work.episodes.length) work.episodes.at(-1)[3] = work.count;
    });
    presentationRecords.sort((left,right) => left.order-right.order).forEach((record) => {
      const work = works.find((item) => item.folder === record.workKey);
      if (work && record.blob instanceof Blob) work.presentationFiles.push({...record,url:URL.createObjectURL(record.blob)});
    });
  } catch (error) { console.warn(error); }
}

function recordId(prefix) {
  return `${prefix}-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

async function importPageImages(fileList) {
  if (!selectedWork) return;
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) { $("#imageImportStatus").textContent = "이미지 파일을 선택해 주세요."; return; }
  const oversized = files.find((file) => file.size > 25 * 1024 * 1024);
  if (oversized) { $("#imageImportStatus").textContent = `${oversized.name} 파일은 25MB보다 큽니다.`; return; }
  $("#imageImportStatus").textContent = `${files.length}장 가져오는 중…`;
  const firstNewPage = selectedWork.count;
  try {
    for (const [index,file] of files.entries()) {
      const record = {id:recordId("page"),workKey:selectedWork.folder,name:file.name,type:file.type,size:file.size,order:Date.now()+index,blob:file};
      await storeImportedPageRecord(record);
      attachImportedRecord(selectedWork,record);
    }
    if (selectedWork.episodes.length) selectedWork.episodes.at(-1)[3] = selectedWork.count;
    saveEpisodeStructure(selectedWork);
    renderCards();
    renderEpisodeList();
    renderThumbnails();
    renderContinuousReader();
    showPage(firstNewPage);
    showTab("pages");
    $("#imageImportStatus").textContent = `${files.length}장을 ${firstNewPage+1}~${selectedWork.count}쪽에 추가했습니다.`;
  } catch (error) {
    console.warn(error);
    $("#imageImportStatus").textContent = "이미지를 기기에 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.";
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1,Math.round(bytes/1024))}KB`;
  return `${(bytes/1024/1024).toFixed(1)}MB`;
}

function renderPresentationFiles() {
  if (!selectedWork) return;
  const files = selectedWork.presentationFiles || [];
  $("#presentationFileList").innerHTML = files.length ? files.map((file) => `<article class="presentation-file"><div><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(file.type || "파일")} · ${formatFileSize(file.size || file.blob.size)}</small></div><a href="${file.url}" download="${escapeHtml(file.name)}" target="_blank" rel="noopener">열기·받기</a></article>`).join("") : `<div class="presentation-empty">아직 넣은 발표자료가 없습니다.</div>`;
}

function renderPresentationSlide(index = presentationSlideIndex) {
  const slides = Array.from(document.querySelectorAll("[data-web-slide]"));
  if (!slides.length) return;
  presentationSlideIndex = Math.min(Math.max(index,0),slides.length-1);
  slides.forEach((slide,slideIndex) => {
    const active = slideIndex === presentationSlideIndex;
    slide.hidden = !active;
    slide.classList.toggle("active",active);
  });
  $("#presentationSlideNumber").textContent = `${presentationSlideIndex+1} / ${slides.length}`;
  $("#presentationPrevious").disabled = presentationSlideIndex === 0;
  $("#presentationNext").disabled = presentationSlideIndex === slides.length-1;
}

async function importPresentationFiles(fileList) {
  if (!selectedWork) return;
  const allowed = /(?:pdf|powerpoint|presentation|image)/i;
  const files = Array.from(fileList || []).filter((file) => allowed.test(file.type) || /\.(pdf|ppt|pptx)$/i.test(file.name));
  if (!files.length) { $("#presentationStatus").textContent = "PDF·PPT·PPTX·이미지 파일을 선택해 주세요."; return; }
  const oversized = files.find((file) => file.size > 50 * 1024 * 1024);
  if (oversized) { $("#presentationStatus").textContent = `${oversized.name} 파일은 50MB보다 큽니다.`; return; }
  $("#presentationStatus").textContent = `${files.length}개 자료를 저장하는 중…`;
  try {
    for (const [index,file] of files.entries()) {
      const record = {id:recordId("material"),workKey:selectedWork.folder,name:file.name,type:file.type,size:file.size,order:Date.now()+index,blob:file};
      await storePresentationRecord(record);
      selectedWork.presentationFiles.push({...record,url:URL.createObjectURL(file)});
    }
    renderPresentationFiles();
    $("#presentationStatus").textContent = `${files.length}개 발표자료를 현재 기기에 저장했습니다.`;
  } catch (error) {
    console.warn(error);
    $("#presentationStatus").textContent = "발표자료를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.";
  }
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
    if (work) {
      work.serverDraft = draft;
      if (draft.title?.trim()) work.title = draft.title.trim();
    }
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
    cover_image_path:selectedCoverPage <= selectedWork.timestamps.length ? imagePath(selectedWork, selectedCoverPage - 1) : (draftFor(selectedWork)?.cover_image_path || ""),
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

function renderPublicEpisodeBrowser() {
  if (!selectedWork) return;
  $("#publicEpisodeCount").textContent = `총 ${selectedWork.episodes.length}화`;
  $("#publicEpisodeList").innerHTML = selectedWork.episodes.map(([number,title,start,end],index) => `<button class="public-episode-card" type="button" data-public-episode="${index}" aria-label="${number}화 ${escapeHtml(title)} 읽기">
    <img src="${imagePath(selectedWork,start-1)}" alt="" loading="lazy" />
    <span class="public-episode-card-copy"><strong>${number}화 · ${escapeHtml(title)}</strong><small>${start}~${end}쪽 · ${end-start+1}장</small></span>
    <span class="public-episode-card-open">읽기</span>
  </button>`).join("");
  document.querySelectorAll("[data-public-episode]").forEach((button) => button.addEventListener("click",() => openPublicEpisode(Number(button.dataset.publicEpisode))));
}

function showPublicEpisodeIndex({ exitBrowserFullscreen = true } = {}) {
  if (!readerOnlyMode || !selectedWork) return;
  stopAutoTurn();
  publicEpisodeActive = false;
  document.body.classList.remove("reader-only");
  document.body.classList.add("episode-index");
  document.title = `${selectedWork.title} · 회차 목록`;
  $("#closeWorkspace").textContent = "서점으로";
  $("#publicEpisodeBrowser").hidden = false;
  document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = true; panel.classList.remove("active"); });
  if (exitBrowserFullscreen && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  $("#workspace").scrollIntoView({behavior:"smooth",block:"start"});
}

function openPublicEpisode(index) {
  if (!readerOnlyMode || !selectedWork || !selectedWork.episodes[index]) return;
  publicEpisodeActive = true;
  selectedEpisode = index;
  selectedPage = selectedWork.episodes[index][2]-1;
  document.body.classList.remove("episode-index");
  document.body.classList.add("reader-only");
  $("#publicEpisodeBrowser").hidden = true;
  $("#closeWorkspace").textContent = "회차 목록";
  document.title = `${selectedWork.title} · ${selectedWork.episodes[index][0]}화`;
  showTab("pages");
  setReaderMode("continuous");
  const fullscreenRequest = $("#workspace").requestFullscreen?.();
  fullscreenRequest?.catch(() => {});
}

function enterEpisodeFullscreen() {
  episodeFullscreenMode = true;
  document.body.classList.add("reader-only");
  document.title = `${selectedWork.title} · ${selectedWork.episodes[selectedEpisode][0]}화`;
  $("#closeWorkspace").textContent = "회차 목록";
  showTab("pages");
  setReaderMode("continuous");
  const fullscreenRequest = $("#workspace").requestFullscreen?.();
  fullscreenRequest?.catch(() => { $("#readerMessage").textContent = "화면 전체 보기로 열었습니다."; });
}

function renderEpisodeList() {
  if (!selectedWork) return;
  const select = $("#agentEpisodeSelect");
  select.innerHTML = selectedWork.episodes.map(([number,title,start,end],index) => `<option value="${index}">${number}화 · ${escapeHtml(title)} (${start}~${end}쪽)</option>`).join("");
  select.value = String(selectedEpisode);
  select.onchange = () => {
    selectedEpisode = Number(select.value);
    selectedPage = selectedWork.episodes[selectedEpisode][2]-1;
    setReaderMode("single");
    showPage(selectedPage);
  };
}

function renderThumbnails() {
  if (!selectedWork) return;
  $("#imageNavigatorCount").textContent = `${selectedWork.count}장`;
  $("#thumbnailStrip").innerHTML = Array.from({length:selectedWork.count},(_,page) => `<button type="button" data-page="${page}" aria-label="${page+1}쪽"><img src="${imagePath(selectedWork,page)}" alt="" loading="lazy"><small>${page+1}</small></button>`).join("");
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => showPage(Number(button.dataset.page))));
}

function leaveEpisodeFullscreen({ exitBrowserFullscreen = true } = {}) {
  if (!episodeFullscreenMode) return;
  episodeFullscreenMode = false;
  document.body.classList.remove("reader-only");
  document.title = "빙고서점 · 작품 편집";
  $("#closeWorkspace").textContent = "다른 작품";
  showTab("pages");
  if (exitBrowserFullscreen && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  $("#workspace").scrollIntoView({behavior:"smooth",block:"start"});
}

function stopAutoTurn() {
  autoTurnEnabled = false;
  window.clearTimeout(autoTurnTimer);
  autoTurnTimer = null;
  const button = $("#autoTurnButton");
  if (button) { button.setAttribute("aria-pressed","false"); button.textContent = "자동 넘김"; }
}

function scheduleAutoTurn() {
  window.clearTimeout(autoTurnTimer);
  if (!autoTurnEnabled || readerMode !== "single" || !selectedWork || selectedPage >= selectedWork.count - 1) return;
  autoTurnTimer = window.setTimeout(() => showPage(selectedPage + 1),5000);
}

function openWork(index) {
  selectedWork = works[index];
  loadSavedEpisodeStructure(selectedWork);
  if (selectedWork.importedPages?.length && selectedWork.episodes.length) selectedWork.episodes.at(-1)[3] = selectedWork.count;
  loadSavedEpisodeTitles(selectedWork);
  selectedCoverPage = Number(draftFor(selectedWork)?.cover_page || 1);
  selectedPage = Number(localStorage.getItem(progressKey(selectedWork)) || 0);
  if (!Number.isInteger(selectedPage) || selectedPage < 0 || selectedPage >= selectedWork.count) selectedPage = 0;
  selectedEpisode = episodeIndexForPage(selectedWork, selectedPage + 1);
  $("#demoGrid").hidden = true; $("#workspace").hidden = false;
  $("#workTitle").textContent = selectedWork.title;
  renderEpisodeList();
  renderReviewCard();
  renderThumbnails();
  if (readerOnlyMode) {
    renderPublicEpisodeBrowser();
    showPublicEpisodeIndex({ exitBrowserFullscreen:false });
  } else {
    renderContinuousReader();
    setReaderMode("single"); setZoom(1); showPage(selectedPage); showTab("pages");
    renderPublishingEditor();
  }
  $("#workspace").scrollIntoView({behavior:"smooth",block:"start"});
}

function showPage(index) {
  if (!selectedWork) return;
  const previousPage = selectedPage;
  selectedPage = Math.min(Math.max(index,0),selectedWork.count-1);
  const stage = $("#pageStage");
  stage.classList.remove("page-turn-next","page-turn-previous");
  void stage.offsetWidth;
  stage.classList.add(selectedPage < previousPage ? "page-turn-previous" : "page-turn-next");
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
  currentPageCrop = readPageCrop(selectedWork,selectedPage);
  applyCropBox(currentPageCrop);
  applyZoom();
  loadOcrPageDraft();
  loadAgentPageDraft();
  if (selectedPage === selectedWork.count-1 && autoTurnEnabled) stopAutoTurn();
  scheduleAutoTurn();
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
  selectedEpisode = episodeIndexForPage(selectedWork, selectedPage + 1);
  const [episodeNumber,episodeTitle,episodeStart,episodeEnd] = selectedWork.episodes[selectedEpisode];
  $("#agentPageContext").textContent = `${selectedWork.title} · ${selectedPage + 1}/${selectedWork.count}쪽`;
  $("#agentEpisodeContext").textContent = `${episodeNumber}화`;
  $("#agentEpisodeTitle").value = episodeTitle;
  $("#agentEpisodeSelect").value = String(selectedEpisode);
  $("#agentEpisodeStart").value = episodeStart;
  $("#agentEpisodeStart").max = episodeEnd;
  $("#agentEpisodeEnd").value = episodeEnd;
  $("#agentEpisodeEnd").max = selectedWork.count;
  const currentPageIsCover = selectedCoverPage === selectedPage + 1;
  $("#coverTitleEditor").hidden = !currentPageIsCover;
  $("#selectedCoverLabel").textContent = currentPageIsCover ? `${selectedCoverPage}쪽` : "";
  $("#workTitleInput").value = selectedWork.title;
  $("#setCurrentCoverButton").textContent = currentPageIsCover ? "표지 선택됨" : "표지로 설정";
  $("#agentPageText").value = localStorage.getItem(agentDraftKey(selectedWork, selectedPage)) || "";
  $("#agentHumanConfirmed").checked = false;
  $("#agentExternalConsent").checked = false;
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
      episodeId:`${selectedWork.episodes[selectedEpisode][0]}화 ${selectedWork.episodes[selectedEpisode][1]}`,
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

async function runClaudePageAgent() {
  const button = $("#claudeAgentButton");
  $("#agentError").textContent = "";
  if (!selectedWork) return;
  if (!isOperatorSession()) {
    $("#agentError").textContent = "Claude 제안은 운영자 로그인 후 사용할 수 있습니다.";
    return;
  }
  if (!$("#agentHumanConfirmed").checked) {
    $("#agentError").textContent = "원본 이미지와 문장을 사람이 확인했는지 체크해 주세요.";
    return;
  }
  if (!$("#agentExternalConsent").checked) {
    $("#agentError").textContent = "Claude 전송 동의를 확인해 주세요.";
    return;
  }
  const inputText = $("#agentPageText").value.trim();
  if (!inputText) {
    $("#agentError").textContent = "검토할 문장을 입력해 주세요.";
    return;
  }

  button.disabled = true;
  button.textContent = "연결 중…";
  $("#agentResultPanel").hidden = true;
  try {
    const { data, error } = await db.functions.invoke("generate-book-content", {
      body: {
        type:"editing",
        sourceScope:"actual-local-review",
        humanConfirmed:true,
        externalConsent:true,
        bookId:selectedWork.folder,
        episodeId:`${selectedWork.episodes[selectedEpisode][0]}화 ${selectedWork.episodes[selectedEpisode][1]}`,
        sourceVersion:fileName(selectedWork, selectedPage),
        inputText,
      },
    });
    if (error) throw error;
    if (!data?.result || !Array.isArray(data.result.suggestions)) throw new Error("invalid Claude response");
    localStorage.setItem(agentDraftKey(selectedWork, selectedPage), inputText);
    renderAgentSuggestions(data);
  } catch (error) {
    let serverMessage = "";
    try {
      const payload = await error?.context?.clone?.().json();
      serverMessage = String(payload?.error || "");
    } catch { /* 응답 본문을 읽을 수 없으면 기본 오류 문구를 사용한다. */ }
    const message = `${String(error?.message || error || "")} ${serverMessage}`.toLowerCase();
    if (message.includes("sensitive")) $("#agentError").textContent = "개인정보 후보가 있어 Claude로 보내지 않았습니다.";
    else if (message.includes("key was rejected")) $("#agentError").textContent = "Claude API 키가 유효하지 않습니다. 새 키로 교체해 주세요.";
    else if (message.includes("401") || message.includes("authentication")) $("#agentError").textContent = "운영자 로그인을 다시 확인해 주세요.";
    else if (message.includes("disabled") || message.includes("configured") || message.includes("503")) $("#agentError").textContent = "Claude 서버 연결을 준비해 주세요.";
    else $("#agentError").textContent = "Claude 연결에 실패했습니다. 서버 설정을 확인해 주세요.";
  } finally {
    button.disabled = false;
    button.textContent = "Claude 제안";
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
  return episode ? `${episode[0]}화` : "회차 미지정";
}

function episodeIndexForPage(work, pageNumber) {
  const index = work.episodes.findIndex(([, ,start,end]) => pageNumber >= start && pageNumber <= end);
  return index < 0 ? 0 : index;
}

function episodeProgressKey(work, episodeNumber) {
  return `bingo-demo-episode-progress-${work.folder}-${episodeNumber}`;
}

function applyCropBox(crop) {
  const box = $("#cropBox");
  if (!box) return;
  const normalized = normalizeCrop(crop);
  box.style.left = `${normalized.x}%`;
  box.style.top = `${normalized.y}%`;
  box.style.width = `${normalized.width}%`;
  box.style.height = `${normalized.height}%`;
}

function applyContinuousCrop(image) {
  const frame = image.closest(".continuous-crop");
  const crop = normalizeCrop({
    x:Number(frame.dataset.cropX), y:Number(frame.dataset.cropY),
    width:Number(frame.dataset.cropWidth), height:Number(frame.dataset.cropHeight)
  });
  const update = () => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    frame.style.aspectRatio = `${image.naturalWidth * crop.width} / ${image.naturalHeight * crop.height}`;
    image.style.width = `${10000 / crop.width}%`;
    image.style.left = `${-100 * crop.x / crop.width}%`;
    image.style.top = `${-100 * crop.y / crop.height}%`;
  };
  if (image.complete) update(); else image.addEventListener("load",update,{once:true});
}

function renderContinuousReader() {
  const episode = selectedWork.episodes[selectedEpisode];
  const [number, episodeTitle, episodeStart, episodeEnd] = episode;
  const episodeScopedReader = !readerOnlyMode || publicEpisodeActive;
  const title = episodeScopedReader ? episodeTitle : selectedWork.title;
  const start = episodeScopedReader ? episodeStart : 1;
  const end = episodeScopedReader ? episodeEnd : selectedWork.count;
  const savedValue = episodeScopedReader ? localStorage.getItem(episodeProgressKey(selectedWork,number)) : localStorage.getItem(progressKey(selectedWork));
  const savedPage = episodeScopedReader ? Number(savedValue || start) - 1 : Number(savedValue || 0);
  selectedPage = Math.min(Math.max(savedPage,start-1),end-1);
  $("#episodeReaderTitle").textContent = episodeScopedReader ? `${number}화 · ${title}` : title;
  const initialPosition = selectedPage - start + 1;
  const initialTotal = end - start + 1;
  const initialProgress = Math.round((initialPosition / initialTotal) * 100);
  $("#readerLocation").textContent = episodeScopedReader ? `${number}화 · ${initialPosition}/${initialTotal}쪽` : `전체 작품 · ${initialPosition}/${initialTotal}쪽`;
  $("#episodeProgress").textContent = `${initialProgress}%`;
  $("#episodeProgressBar").style.width = `${initialProgress}%`;
  $("#previousEpisode").disabled = selectedEpisode === 0;
  $("#nextEpisode").disabled = selectedEpisode === selectedWork.episodes.length - 1;
  $("#continuousReader").innerHTML = Array.from({length:end-start+1},(_,offset) => {
    const page = start + offset - 1;
    const crop = readPageCrop(selectedWork,page);
    const pageLabel = readerOnlyMode ? `${offset+1}/${end-start+1}쪽` : `컷 ${offset+1}/${end-start+1} · 원본 ${page+1}쪽`;
    return `<figure class="continuous-page" id="continuous-page-${page+1}"><div class="continuous-crop" data-crop-x="${crop.x}" data-crop-y="${crop.y}" data-crop-width="${crop.width}" data-crop-height="${crop.height}"><img src="${imagePath(selectedWork,page)}" alt="${title} ${pageLabel}" loading="lazy"></div><figcaption>${pageLabel}</figcaption></figure>`;
  }).join("");
  $("#continuousReader").querySelectorAll("img").forEach((image) => { addImageStatusHandlers(image); applyContinuousCrop(image); });
  continuousObserver?.disconnect();
  continuousObserver = new IntersectionObserver((entries) => {
    if (readerMode !== "continuous") return;
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a,b) => b.intersectionRatio-a.intersectionRatio)[0];
    if (!visible) return;
    selectedPage = Number(visible.target.id.replace("continuous-page-",""))-1;
    const position = selectedPage - start + 1;
    const total = end - start + 1;
    const progress = Math.round((position / total) * 100);
    $("#readerLocation").textContent = episodeScopedReader ? `${number}화 · ${position}/${total}쪽` : `전체 작품 · ${position}/${total}쪽`;
    $("#episodeProgress").textContent = `${progress}%`;
    $("#episodeProgressBar").style.width = `${progress}%`;
    localStorage.setItem(progressKey(selectedWork),String(selectedPage));
    if (episodeScopedReader) localStorage.setItem(episodeProgressKey(selectedWork,number),String(selectedPage+1));
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
  $("#cropStage").style.width = `${Math.round(zoom*100)}%`;
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
    if (event.target.closest(".crop-box")) return;
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

function setupCropControls() {
  const box = $("#cropBox");
  const stage = $("#cropStage");
  let drag = null;
  const clamp = (value,min,max) => Math.min(Math.max(value,min),max);
  box.addEventListener("pointerdown",(event) => {
    if (!selectedWork || event.button !== 0) return;
    const bounds = stage.getBoundingClientRect();
    drag = {
      pointerId:event.pointerId,
      handle:event.target.dataset.cropHandle || "move",
      startX:event.clientX,
      startY:event.clientY,
      bounds,
      crop:{...currentPageCrop}
    };
    box.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });
  box.addEventListener("pointermove",(event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX-drag.startX) / drag.bounds.width * 100;
    const dy = (event.clientY-drag.startY) / drag.bounds.height * 100;
    const start = drag.crop;
    const right = start.x + start.width;
    const bottom = start.y + start.height;
    let next = {...start};
    if (drag.handle === "move") {
      next.x = clamp(start.x+dx,0,100-start.width);
      next.y = clamp(start.y+dy,0,100-start.height);
    } else {
      if (drag.handle.includes("w")) { next.x = clamp(start.x+dx,0,right-10); next.width = right-next.x; }
      if (drag.handle.includes("e")) next.width = clamp(start.width+dx,10,100-start.x);
      if (drag.handle.includes("n")) { next.y = clamp(start.y+dy,0,bottom-10); next.height = bottom-next.y; }
      if (drag.handle.includes("s")) next.height = clamp(start.height+dy,10,100-start.y);
    }
    currentPageCrop = normalizeCrop(next);
    applyCropBox(currentPageCrop);
  });
  const finish = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    currentPageCrop = savePageCrop(selectedWork,selectedPage,currentPageCrop);
    $("#readerMessage").textContent = "최종 표시 영역을 저장했습니다.";
    if (box.hasPointerCapture(event.pointerId)) box.releasePointerCapture(event.pointerId);
    drag = null;
  };
  box.addEventListener("pointerup",finish);
  box.addEventListener("pointercancel",finish);
}

function saveEpisodeTitle() {
  if (!selectedWork) return;
  const input = $("#agentEpisodeTitle");
  const title = input.value.trim();
  const episodeIndex = episodeIndexForPage(selectedWork,selectedPage+1);
  if (!title) {
    input.value = selectedWork.episodes[episodeIndex][1];
    $("#agentError").textContent = "회차 제목을 입력해 주세요.";
    return;
  }
  selectedWork.episodes[episodeIndex][1] = title;
  localStorage.setItem(episodeTitleKey(selectedWork,episodeIndex),title);
  renderEpisodeList();
  if (readerMode === "continuous") renderContinuousReader();
  $("#agentError").textContent = `${selectedWork.episodes[episodeIndex][0]}화 제목을 저장했습니다.`;
}

function saveEpisodeRange() {
  if (!selectedWork) return;
  const episodeIndex = episodeIndexForPage(selectedWork,selectedPage+1);
  const episode = selectedWork.episodes[episodeIndex];
  const start = Number($("#agentEpisodeStart").value);
  const end = Number($("#agentEpisodeEnd").value);
  const previous = selectedWork.episodes[episodeIndex-1];
  const next = selectedWork.episodes[episodeIndex+1];
  const invalid = !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > selectedWork.count || start > end || (!previous && start !== 1) || (!next && end !== selectedWork.count) || (previous && start <= previous[2]) || (next && end >= next[3]);
  if (invalid) {
    loadAgentPageDraft();
    $("#agentError").textContent = `1~${selectedWork.count}쪽 안에서 앞뒤 회차와 겹치지 않게 입력해 주세요.`;
    return;
  }
  episode[2] = start;
  episode[3] = end;
  if (previous) previous[3] = start-1;
  if (next) next[2] = end+1;
  saveEpisodeStructure(selectedWork);
  selectedEpisode = episodeIndex;
  selectedPage = Math.min(Math.max(selectedPage,start-1),end-1);
  renderEpisodeList();
  renderContinuousReader();
  showPage(selectedPage);
  $("#agentError").textContent = `${episode[0]}화 범위를 ${start}~${end}쪽으로 저장했습니다.`;
}

function pageTextFor(work,pageIndex) {
  const confirmed = localStorage.getItem(agentDraftKey(work,pageIndex))?.trim();
  if (confirmed) return confirmed;
  try { return JSON.parse(localStorage.getItem(ocrDraftKey(work,pageIndex)) || "null")?.text?.trim() || ""; }
  catch { return ""; }
}

function collectPageTextsIntoScript() {
  if (!selectedWork) return;
  const sections = Array.from({length:selectedWork.count},(_,pageIndex) => {
    const text = pageTextFor(selectedWork,pageIndex);
    return text ? `[${pageIndex+1}쪽]\n${text}` : "";
  }).filter(Boolean);
  if (!sections.length) {
    setServerStatus("먼저 읽기·편집에서 페이지 문장을 입력하거나 OCR을 만들어 주세요.","error");
    return;
  }
  $("#workScript").value = sections.join("\n\n").slice(0,50000);
  $("#scriptLength").textContent = String($("#workScript").value.length);
  markPublishingChanged();
  setServerStatus(`${sections.length}쪽의 문장을 대본에 모았습니다. 저장 전 확인해 주세요.`,"ready");
}

function analyzeTextSafety(work) {
  const sources = [...work.episodes.map((episode) => episode[1]), ...Array.from({length:work.count},(_,page) => pageTextFor(work,page)), draftFor(work)?.script || "", work === selectedWork ? $("#workScript")?.value || "" : ""];
  const text = sources.join("\n");
  const rules = [
    ["신체 위해·죽음",/(죽이|죽었|죽음|살해|피를|유혈|칼로|총을|폭력)/g],
    ["싸움·공격",/(때리|공격|싸움|복싱|발차기|주먹)/g],
    ["공포·위협",/(무서|공포|협박|위협|괴물)/g]
  ];
  return rules.map(([label,pattern]) => ({label,matches:[...new Set(text.match(pattern) || [])]})).filter((item) => item.matches.length);
}

function analyzePrivacyCandidates(work) {
  const text = Array.from({length:work.count},(_,page) => pageTextFor(work,page)).join("\n");
  const rules = [
    ["전화번호",/(?:01[016789])[- .]?\d{3,4}[- .]?\d{4}/g],
    ["이메일",/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
    ["학교명",/[가-힣]{2,15}(?:초등학교|중학교|고등학교)/g],
    ["학년·반",/(?:[1-6]\s*학년|[1-6]\s*[-학년 ]\s*[1-9]\s*반?)/g],
    ["이름 표기 후보",/(?:이름|본명|작가|글|그림)\s*[:：]?\s*[가-힣]{2,4}/g],
    ["주소·위치 후보",/(?:주소|사는 곳|동네|아파트)\s*[:：]?\s*[^\n]{2,30}/g]
  ];
  return rules.map(([label,pattern]) => ({label,matches:[...new Set(text.match(pattern) || [])]})).filter((item) => item.matches.length);
}

function renderReviewCard() {
  if (!selectedWork) return;
  const findings = analyzeTextSafety(selectedWork);
  const privacy = analyzePrivacyCandidates(selectedWork);
  const findingText = findings.length ? findings.map((item) => `${item.label}: ${item.matches.join(", ")}`).join(" · ") : "OCR·입력 문장에서는 위험 표현을 찾지 못했습니다.";
  const privacyText = privacy.length ? privacy.map((item) => `${item.label}: ${item.matches.join(", ")}`).join(" · ") : "OCR·입력 문장에서는 정형 개인정보 후보를 찾지 못했습니다.";
  $("#reviewCard").innerHTML = `<strong>현재 검토 메모</strong><p>${escapeHtml(selectedWork.notice)}</p><p><b>공개 상태:</b> 비공개 초안 · 보호자 승인 전</p><section class="content-review-result" data-state="${privacy.length ? "attention" : "clear"}"><strong>${privacy.length ? "개인정보 후보가 있습니다." : "개인정보 텍스트 1차 확인 완료"}</strong><p>${escapeHtml(privacyText)}</p><p>실명과 손글씨 OCR 누락은 자동으로 확정할 수 없으므로 원본을 직접 확인해야 합니다.</p></section><section class="content-review-result" data-state="${findings.length ? "attention" : "clear"}"><strong>${findings.length ? "텍스트에서 보호자 확인이 필요한 표현이 있습니다." : "콘텐츠 텍스트 1차 확인 완료"}</strong><p>${escapeHtml(findingText)}</p><p>그림 속 장면은 자동 판정하지 않았습니다. 운영자가 원본 이미지를 직접 확인해야 합니다.</p><button id="contentReviewButton" type="button">다시 확인</button></section>`;
  $("#contentReviewButton").addEventListener("click",renderReviewCard);
}

function showTab(name) {
  document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active",button.dataset.tab === name));
  document.querySelectorAll("[data-panel]").forEach((panel) => { const active = panel.dataset.panel === name; panel.classList.toggle("active",active); panel.hidden = !active; });
  if (name === "publishing") renderPublishingEditor();
  if (name === "materials") { renderPresentationFiles(); renderPresentationSlide(); }
  if (name === "review") renderReviewCard();
}

function selectCurrentPageAsCover() {
  if (!selectedWork) return;
  selectedCoverPage = selectedPage + 1;
  $("#coverTitleEditor").hidden = false;
  $("#selectedCoverLabel").textContent = `${selectedCoverPage}쪽`;
  $("#workTitleInput").value = selectedWork.title;
  $("#readerMessage").textContent = `${selectedCoverPage}쪽을 표지로 선택했습니다.`;
  $("#setCurrentCoverButton").textContent = "표지 선택됨";
  markPublishingChanged();
  $("#workTitleInput").focus();
}

function saveWorkTitle() {
  if (!selectedWork) return;
  const input = $("#workTitleInput");
  const title = input.value.trim();
  if (!title) { input.value = selectedWork.title; return; }
  selectedWork.title = title;
  $("#workTitle").textContent = title;
  $("#agentPageContext").textContent = `${title} · ${selectedPage + 1}/${selectedWork.count}쪽`;
  markPublishingChanged();
  renderCards();
}

async function initializeEditor() {
  await loadImportedPages();
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
$("#episodeListButton").addEventListener("click",() => { if (readerOnlyMode) showPublicEpisodeIndex(); else { showTab("pages"); setReaderMode("single"); showPage(selectedPage); } });
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
$("#claudeAgentButton").addEventListener("click",runClaudePageAgent);
$("#agentEpisodeTitle").addEventListener("change",saveEpisodeTitle);
$("#agentEpisodeTitle").addEventListener("keydown",(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } });
$("#saveEpisodeRangeButton").addEventListener("click",saveEpisodeRange);
$("#cameraImageInput").addEventListener("change",async (event) => { await importPageImages(event.currentTarget.files); event.currentTarget.value = ""; });
$("#fileImageInput").addEventListener("change",async (event) => { await importPageImages(event.currentTarget.files); event.currentTarget.value = ""; });
$("#agentPageText").addEventListener("input",() => { if (selectedWork) localStorage.setItem(agentDraftKey(selectedWork, selectedPage), $("#agentPageText").value); });
$("#agentSuggestionList").addEventListener("click",(event) => { const button = event.target.closest("[data-agent-suggestion]"); if (button) applyAgentSuggestion(button.dataset.agentSuggestion); });
$("#agentClearButton").addEventListener("click",() => { if (!selectedWork) return; localStorage.removeItem(agentDraftKey(selectedWork, selectedPage)); $("#agentPageText").value = ""; $("#agentHumanConfirmed").checked = false; $("#agentExternalConsent").checked = false; $("#agentResultPanel").hidden = true; $("#agentError").textContent = "이 페이지의 기기 내 초안을 지웠습니다."; currentAgentOutput = null; });
$("#setCurrentCoverButton").addEventListener("click",selectCurrentPageAsCover);
$("#workTitleInput").addEventListener("change",saveWorkTitle);
$("#workTitleInput").addEventListener("keydown",(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } });
$("#cropResetButton").addEventListener("click",() => {
  if (!selectedWork) return;
  localStorage.removeItem(pageCropKey(selectedWork,selectedPage));
  currentPageCrop = normalizeCrop(null);
  applyCropBox(currentPageCrop);
  $("#readerMessage").textContent = "현재 페이지를 전체 영역으로 되돌렸습니다.";
});
$("#workScript").addEventListener("input",() => {
  $("#scriptLength").textContent = String($("#workScript").value.length);
  markPublishingChanged();
});
$("#collectPageTextButton").addEventListener("click",collectPageTextsIntoScript);
$("#presentationFileInput").addEventListener("change",async (event) => { await importPresentationFiles(event.currentTarget.files); event.currentTarget.value = ""; });
$("#presentationPrevious").addEventListener("click",() => renderPresentationSlide(presentationSlideIndex-1));
$("#presentationNext").addEventListener("click",() => renderPresentationSlide(presentationSlideIndex+1));
$("#presentationFullscreen").addEventListener("click",async () => {
  try { if (!document.fullscreenElement) await $("#webPresentation").requestFullscreen(); else await document.exitFullscreen(); }
  catch { $("#presentationStatus").textContent = "이 브라우저에서는 전체화면 발표를 열 수 없습니다."; }
});
$("#publishingEditorForm").addEventListener("submit",savePublishingEditor);
$("#contrastButton").addEventListener("click",(event) => { const active = document.body.classList.toggle("high-contrast"); event.currentTarget.setAttribute("aria-pressed",String(active)); });
$("#autoTurnButton").addEventListener("click",(event) => {
  autoTurnEnabled = !autoTurnEnabled;
  event.currentTarget.setAttribute("aria-pressed",String(autoTurnEnabled));
  event.currentTarget.textContent = autoTurnEnabled ? "자동 끄기" : "자동 넘김";
  if (autoTurnEnabled) scheduleAutoTurn(); else window.clearTimeout(autoTurnTimer);
});
$("#readerFullscreenButton").addEventListener("click",async () => {
  try { if (!document.fullscreenElement) await $("#workspace").requestFullscreen(); else await document.exitFullscreen(); }
  catch { $("#readerMessage").textContent = "이 브라우저에서는 전체화면을 열 수 없습니다."; }
});
addImageStatusHandlers($("#pageImage"));
setupPanControls();
setupCropControls();
document.addEventListener("keydown",(event) => {
  if (!selectedWork || $("#workspace").hidden || event.target.matches("input,textarea,select")) return;
  if (!document.querySelector('[data-panel="materials"]').hidden) {
    if (event.key === "ArrowLeft") renderPresentationSlide(presentationSlideIndex-1);
    if (event.key === "ArrowRight" || event.key === " ") renderPresentationSlide(presentationSlideIndex+1);
    return;
  }
  if (readerMode === "single" && event.key === "ArrowLeft") showPage(selectedPage-1);
  if (readerMode === "single" && event.key === "ArrowRight") showPage(selectedPage+1);
  if (readerMode === "single" && (event.key === "+" || event.key === "=")) setZoom(zoom+.25);
  if (readerMode === "single" && event.key === "-") setZoom(zoom-.25);
  if (event.key === "1") setReaderMode("single");
  if (event.key === "2") setReaderMode("continuous");
});
$("#closeWorkspace").addEventListener("click",() => {
  stopAutoTurn();
  if (episodeFullscreenMode) { leaveEpisodeFullscreen(); return; }
  if (readerOnlyMode && publicEpisodeActive) { showPublicEpisodeIndex(); return; }
  if (readerOnlyMode) { window.location.href = "./index.html#home"; return; }
  $("#workspace").hidden = true; $("#demoGrid").hidden = false; window.scrollTo({top:0,behavior:"smooth"});
});
