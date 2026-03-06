// ── MD 파서 ──────────────────────────────────────────────────────────────────
// qna-data.md 형식:
//
//   # 카테고리명 | categoryKey
//
//   ## 질문 제목
//
//   > 세부 질문 (선택사항)
//
//   답변 요약 텍스트 (여러 줄 가능)
//
//   - **불릿 제목:** 불릿 내용
//
// 새 질문을 추가하려면 qna-data.md 파일만 편집하면 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

function parseMarkdown(md) {
  const items = [];
  let id = 1;

  // 카테고리 섹션 분리 (# 으로 시작하는 줄 기준)
  const categorySections = md.split(/\n(?=# [^#])/);

  for (const section of categorySections) {
    const trimmed = section.trim();
    if (!trimmed.startsWith("# ")) continue;

    const firstNewline = trimmed.indexOf("\n");
    const catLine = (firstNewline === -1 ? trimmed : trimmed.slice(0, firstNewline)).slice(2).trim();
    const pipeIdx = catLine.indexOf("|");
    if (pipeIdx === -1) continue;

    const category = catLine.slice(0, pipeIdx).trim();
    const categoryKey = catLine.slice(pipeIdx + 1).trim();

    // Q&A 블록 분리 (## 기준)
    const qnaBlocks = trimmed.split(/\n(?=## )/);

    for (let i = 1; i < qnaBlocks.length; i++) {
      const block = qnaBlocks[i].trim();
      const lines = block.split("\n");

      // ## 질문 제목
      const question = lines[0].slice(3).trim();

      let j = 1;
      const skip = () => { while (j < lines.length && lines[j].trim() === "") j++; };

      skip();

      // > 세부 질문 (선택)
      let questionDetail = "";
      if (j < lines.length && lines[j].trimStart().startsWith(">")) {
        questionDetail = lines[j].trimStart().slice(1).trim();
        j++;
        skip();
      }

      // 답변: 불릿이 시작되기 전까지의 텍스트 줄
      const answerLines = [];
      while (j < lines.length && !lines[j].trimStart().startsWith("- ")) {
        const l = lines[j].trim();
        if (l) answerLines.push(l);
        j++;
      }
      const answer = answerLines.join(" ");

      // 불릿: - **제목:** 내용
      const bullets = [];
      while (j < lines.length) {
        const line = lines[j].trim();
        if (line.startsWith("- ")) {
          const content = line.slice(2);
          // 형식: "제목: 내용" 또는 "**제목:** 내용" (둘 다 지원)
          const m = content.match(/^\*\*(.+?)\*\*[：:]\s*(.*)/) || content.match(/^(.+?)[：:]\s+(.*)/);
          if (m) {
            bullets.push({ title: m[1], content: m[2] });
          } else {
            bullets.push({ title: "", content });
          }
        }
        j++;
      }

      if (question) {
        items.push({ id: id++, category, categoryKey, question, questionDetail, answer, bullets });
      }
    }
  }

  return items;
}

// ── 카테고리 목록 (MD에서 등장 순서대로 자동 생성) ───────────────────────────

function buildCategories(data) {
  const seen = new Map();
  for (const item of data) {
    if (!seen.has(item.categoryKey)) {
      seen.set(item.categoryKey, item.category);
    }
  }
  const cats = [{ key: "all", label: "전체" }];
  for (const [key, label] of seen) {
    cats.push({ key, label });
  }
  return cats;
}

// ── 상태 ──────────────────────────────────────────────────────────────────────

let QNA_DATA = [];
let CATEGORIES = [];
let activeCategory = "all";
let searchQuery = "";
let expandedIds = new Set();

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

function matchesSearch(item, query) {
  if (!query) return true;
  const lower = query.toLowerCase();
  return [
    item.question,
    item.questionDetail,
    item.answer,
    ...item.bullets.map(b => b.title + " " + b.content)
  ].some(f => f.toLowerCase().includes(lower));
}

function getFilteredData() {
  return QNA_DATA.filter(item => {
    const catMatch = activeCategory === "all" || item.categoryKey === activeCategory;
    return catMatch && matchesSearch(item, searchQuery);
  });
}

// ── 렌더 ──────────────────────────────────────────────────────────────────────

function renderCategories() {
  const container = document.getElementById("category-filters");
  container.innerHTML = CATEGORIES.map(cat => `
    <button
      class="category-btn ${activeCategory === cat.key ? "active" : ""}"
      data-key="${cat.key}"
      aria-pressed="${activeCategory === cat.key}"
    >${cat.label}</button>
  `).join("");

  container.querySelectorAll(".category-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.key;
      renderCategories();
      renderCards();
      updateCount();
    });
  });
}

function renderCards() {
  const container = document.getElementById("qna-list");
  const data = getFilteredData();

  if (data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#128269;</div>
        <p>검색 결과가 없습니다.</p>
        <p class="empty-sub">다른 키워드나 카테고리를 시도해 보세요.</p>
      </div>`;
    return;
  }

  container.innerHTML = data.map(item => {
    const isExpanded = expandedIds.has(item.id);
    const q = highlight(item.question, searchQuery);
    const qd = item.questionDetail ? highlight(item.questionDetail, searchQuery) : "";
    const a = highlight(item.answer, searchQuery);
    const bulletsHtml = item.bullets.map(b => `
      <li class="bullet-item">
        <span class="bullet-title">${highlight(b.title, searchQuery)}</span>
        <span class="bullet-content">${highlight(b.content, searchQuery)}</span>
      </li>`).join("");

    return `
      <article class="qna-card ${isExpanded ? "expanded" : ""}" data-id="${item.id}">
        <button class="card-header" aria-expanded="${isExpanded}" aria-controls="answer-${item.id}">
          <div class="card-header-left">
            <span class="category-tag cat-${item.categoryKey}">${item.category}</span>
            <div class="question-wrap">
              <span class="question-text">${q}</span>
              ${qd ? `<span class="question-detail">${qd}</span>` : ""}
            </div>
          </div>
          <span class="chevron" aria-hidden="true"></span>
        </button>
        <div class="card-body" id="answer-${item.id}" role="region">
          <div class="answer-summary">${a}</div>
          ${bulletsHtml ? `<ul class="bullet-list">${bulletsHtml}</ul>` : ""}
        </div>
      </article>`;
  }).join("");

  container.querySelectorAll(".qna-card").forEach(card => {
    card.querySelector(".card-header").addEventListener("click", () => {
      const id = Number(card.dataset.id);
      const expanded = expandedIds.has(id);
      expanded ? expandedIds.delete(id) : expandedIds.add(id);
      card.classList.toggle("expanded", !expanded);
      card.querySelector(".card-header").setAttribute("aria-expanded", String(!expanded));
    });
  });
}

function updateCount() {
  const count = getFilteredData().length;
  document.getElementById("result-count").textContent = `${count}개 항목`;
}

// ── 초기화 ────────────────────────────────────────────────────────────────────

function setupUI() {
  const searchInput = document.getElementById("search-input");
  const clearBtn = document.getElementById("clear-btn");
  const expandAllBtn = document.getElementById("expand-all-btn");

  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    clearBtn.style.display = searchQuery ? "flex" : "none";
    renderCards();
    updateCount();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    clearBtn.style.display = "none";
    searchInput.focus();
    renderCards();
    updateCount();
  });

  expandAllBtn.addEventListener("click", () => {
    const data = getFilteredData();
    const allExpanded = data.every(item => expandedIds.has(item.id));
    data.forEach(item => allExpanded ? expandedIds.delete(item.id) : expandedIds.add(item.id));
    expandAllBtn.textContent = allExpanded ? "전체 펼치기" : "전체 접기";
    renderCards();
  });
}

function showError(msg) {
  document.getElementById("loading-state").style.display = "none";
  document.getElementById("qna-list").innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">&#9888;&#65039;</div>
      <p>데이터를 불러올 수 없습니다.</p>
      <p class="empty-sub">${msg}</p>
    </div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  setupUI();

  fetch("qna-data.md")
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(text => {
      QNA_DATA = parseMarkdown(text);
      CATEGORIES = buildCategories(QNA_DATA);
      document.getElementById("loading-state").style.display = "none";
      renderCategories();
      renderCards();
      updateCount();
    })
    .catch(() => {
      showError("로컬 서버가 필요합니다. 터미널에서 <code>python3 -m http.server 8000</code> 실행 후 <code>http://localhost:8000</code>으로 접속하세요.");
    });
});
