// js/chat.js
import { db, collection, doc, addDoc, updateDoc, getDocs } from "./firebase.js";

const STATUSES = ["要対応","対応中","確認中","毎月対応","完了"];
const CHAT_KEY = "tasuku_chat_v2";
let localTasks = [];
let historyLoaded = false; // 重複ロード防止

export async function initChat() {
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSend");
  if (!input || !sendBtn) return;

  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    localTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.warn(e); }

  if (!historyLoaded) {
    loadHistory();
    historyLoaded = true;
  }

  // イベントの重複登録を防ぐ
  const newSend = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSend, sendBtn);
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);

  newSend.addEventListener("click", () => sendChat());
  newInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
}

function loadHistory() {
  const messages = document.getElementById("chatMessages");
  if (!messages) return;
  try {
    const history = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    if (!history.length) return;
    // 初期メッセージをクリアして履歴を表示
    messages.innerHTML = "";
    let lastDate = null;
    history.slice(-30).forEach(msg => {
      if (msg.date && msg.date !== lastDate) {
        addDivider(msg.date);
        lastDate = msg.date;
      }
      addBubble(msg.text, msg.type, false);
    });
    messages.scrollTop = messages.scrollHeight;
  } catch(e) {}
}

function saveHistory(text, type) {
  try {
    const history = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    history.push({ text, type, date: new Date().toISOString().slice(0,10) });
    localStorage.setItem(CHAT_KEY, JSON.stringify(history.slice(-100)));
  } catch(e) {}
}

function addDivider(dateStr) {
  const messages = document.getElementById("chatMessages");
  if (!messages) return;
  const today = new Date().toISOString().slice(0,10);
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
  const label = dateStr === today ? "今日" : dateStr === yesterday ? "昨日" : dateStr;
  const div = document.createElement("div");
  div.className = "chat-date-divider";
  div.innerHTML = `<span>${label}</span>`;
  messages.appendChild(div);
}

function addBubble(text, type = "ai", save = true) {
  const messages = document.getElementById("chatMessages");
  if (!messages) return;
  const b = document.createElement("div");
  b.className = `chat-bubble ${type}`;
  b.innerHTML = text;
  messages.appendChild(b);
  messages.scrollTop = messages.scrollHeight;
  if (save) saveHistory(text, type);
  return b;
}

async function sendChat() {
  const input = document.getElementById("chatInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  const today = new Date().toISOString().slice(0,10);
  const messages = document.getElementById("chatMessages");
  const dividers = messages.querySelectorAll(".chat-date-divider");
  const lastDivider = dividers[dividers.length - 1];
  if (!lastDivider || !lastDivider.textContent.includes("今日")) addDivider(today);

  addBubble(text, "user");
  const thinking = addBubble("考え中…", "ai thinking", false);

  const result = await processCommand(text);
  thinking.remove();
  addBubble(result, "ai");
}

async function processCommand(text) {
  const t = text.replace(/\s+/g, " ").trim();

  if (/一覧|リスト|見せて|教えて|何がある|確認/.test(t)) {
    for (const s of STATUSES) {
      if (t.includes(s)) return listTasks(s);
    }
    return listTasks("all");
  }

  if (/完了|終わった|終わり|おわった|done/.test(t)) {
    const task = findTask(t);
    if (task) return await updateStatus(task, "完了");
    return suggestTasks("完了にしたいタスクが見つかりませんでした。タスク名をもう少し具体的に入力してください。");
  }

  for (const s of STATUSES) {
    if (t.includes(s) && /にして|変更|更新/.test(t)) {
      const task = findTask(t.replace(s, "").replace(/にして|変更|更新/, ""));
      if (task) return await updateStatus(task, s);
    }
  }

  if (/削除|消して|remove/.test(t)) {
    return "削除は案件ページのタスクから直接行ってください。";
  }

  const addPatterns = [
    /(.+?)(?:の|に)(.+?)(?:を|タスク)?(?:追加|add)/,
    /追加[：:]\s*(.+)/,
    /(.+?)を追加/,
  ];
  for (const pat of addPatterns) {
    const m = t.match(pat);
    if (m) {
      if (m[2]) return await addTask(m[1].trim(), m[2].trim());
      return await addTask("", m[1].trim());
    }
  }

  const projectTaskMatch = t.match(/^(.+?)[　\s](.+)$/);
  if (projectTaskMatch && !/(で|が|は|を|に|と|も|から|まで)/.test(projectTaskMatch[0])) {
    const [, project, name] = projectTaskMatch;
    if (name.length > 1) return await addTask(project, name);
  }

  if (t.length > 1 && !/(？|\?)/.test(t)) {
    return await addTask("", t);
  }

  return `「${t}」の意図が分かりませんでした。<br><br>使い方：<br>・「<strong>GY　LP修正</strong>」→ タスク追加<br>・「<strong>LP修正を完了にして</strong>」→ 完了に変更<br>・「<strong>要対応一覧</strong>」→ 一覧表示`;
}

function findTask(text) {
  const clean = text.replace(/を|を完了|にして|変更|してください|お願い/g, "").trim();
  if (!clean) return null;
  return localTasks.find(t => t.name?.includes(clean) || clean.includes(t.name?.slice(0,4))) || null;
}

function listTasks(filter) {
  const filtered = filter === "all" ? localTasks : localTasks.filter(t => t.status === filter);
  if (!filtered.length) return `${filter === "all" ? "タスク" : filter}はまだありません。`;
  const COLORS = {"要対応":"#dc2626","対応中":"#2563eb","確認中":"#7c3aed","毎月対応":"#16a34a","完了":"#6b7280"};
  const items = filtered.slice(0, 10).map(t => {
    const c = COLORS[t.status] || "#6b7280";
    return `• <span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#f0f2f5;color:${c};margin-right:4px">${t.status}</span>${t.project ? `<span style="color:#9ca3af">${esc(t.project)} / </span>` : ""}${esc(t.name)}`;
  }).join("<br>");
  const more = filtered.length > 10 ? `<br><span style="color:#9ca3af">他${filtered.length-10}件…</span>` : "";
  return `📋 ${filter === "all" ? "全タスク" : filter}（${filtered.length}件）<br>${items}${more}`;
}

async function addTask(project, name) {
  if (!name) return "タスク名を入力してください。";
  const data = { project: project || "", name, status: "要対応", deadline: "", subtasks: [], createdAt: Date.now() };
  try {
    const ref = await addDoc(collection(db, "tasks_v2"), data);
    localTasks.push({ id: ref.id, ...data });
    window.dispatchEvent(new Event("tasksUpdated"));
    return `✅ <strong>${esc(name)}</strong> を追加しました${project ? `<br>案件: ${esc(project)}` : ""}`;
  } catch(e) { return "追加に失敗しました。"; }
}

async function updateStatus(task, status) {
  try {
    await updateDoc(doc(db, "tasks_v2", task.id), { status });
    task.status = status;
    window.dispatchEvent(new Event("tasksUpdated"));
    return `✅ <strong>${esc(task.name)}</strong> を <strong>${status}</strong> にしました`;
  } catch(e) { return "更新に失敗しました。"; }
}

function suggestTasks(msg) {
  const recent = localTasks.slice(-5).map(t => `・${esc(t.name)}`).join("<br>");
  return `${msg}<br><br>最近のタスク：<br>${recent || "なし"}`;
}

function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
