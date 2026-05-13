// js/chat.js
import { db, collection, doc, addDoc, updateDoc, getDocs } from "./firebase.js";

const STATUSES = ["要対応","対応中","確認中","毎月対応","完了"];
const CHAT_KEY = "tasuku_chat_v2";
let localTasks = [];
let historyLoaded = false;

export async function initChat() {
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSend");
  if (!input || !sendBtn) return;

  // タスク一覧を取得
  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    localTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.warn(e); }

  // 履歴を一度だけ読み込む
  if (!historyLoaded) { loadHistory(); historyLoaded = true; }

  // 送信ボタンのみ（Enterキーは送信しない）
  sendBtn.addEventListener("click", () => sendChat());

  // Enterキー無効化（確実に）
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });
  input.addEventListener("keypress", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  });
}

// タスク更新時にローカルキャッシュも更新
window.addEventListener("tasksUpdated", async () => {
  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    localTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {}
});

function loadHistory() {
  const messages = document.getElementById("chatMessages");
  if (!messages) return;
  try {
    const history = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    if (!history.length) return;
    messages.innerHTML = "";
    let lastDate = null;
    history.slice(-30).forEach(msg => {
      if (msg.date && msg.date !== lastDate) { addDivider(msg.date); lastDate = msg.date; }
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

  // 今日の区切り線を必要なら追加
  const today = new Date().toISOString().slice(0,10);
  const messages = document.getElementById("chatMessages");
  const dividers = messages.querySelectorAll(".chat-date-divider");
  const last = dividers[dividers.length - 1];
  if (!last || !last.textContent.includes("今日")) addDivider(today);

  addBubble(text, "user");
  const thinking = addBubble("考え中…", "ai thinking", false);
  const result = await processCommand(text);
  thinking.remove();
  addBubble(result, "ai");
}

// ========== コマンド解析 ==========
async function processCommand(text) {
  const t = text.trim();

  // ① 一覧表示：「〜一覧」「〜見せて」「〜確認」
  if (/一覧|リスト|見せて|教えて|確認|表示/.test(t)) {
    for (const s of STATUSES) {
      if (t.includes(s)) return listTasks(s);
    }
    return listTasks("all");
  }

  // ② ステータス変更：「〇〇を対応中にして」など
  // ステータス名が含まれていてかつ変更指示ワードがある場合
  for (const s of STATUSES) {
    if (t.includes(s)) {
      const hasChangeWord = /にして|にする|に変更|変更して/.test(t);
      // 「〜一覧」「〜見せて」は①で処理済みなのでここでは変更のみ
      if (hasChangeWord) {
        const taskName = extractTaskName(t, s);
        if (!taskName) return suggestTasks(`タスク名が読み取れませんでした。「タスク名を${s}にして」の形で入力してください。`);
        const task = findTask(taskName);
        if (task) return await updateStatus(task, s);
        return suggestTasks(`「${taskName}」というタスクが見つかりませんでした。`);
      }
    }
  }

  // ③ 完了：「〜終わった」「〜完了した」「〜おわり」
  if (/終わった|おわった|終わり|おわり|完了した|やった/.test(t)) {
    const taskName = t
      .replace(/終わった|おわった|終わり|おわり|完了した|やった/, "")
      .replace(/が$|を$|は$/, "")
      .trim();
    const task = findTask(taskName || t);
    if (task) return await updateStatus(task, "完了");
    return suggestTasks(`「${taskName}」というタスクが見つかりませんでした。`);
  }

  // ④ 削除案内
  if (/削除|消して|消す/.test(t)) {
    return "削除はタスクページのタスクをタップして行ってください。";
  }

  // ⑤ タスク追加：「〜追加して」「〜登録して」
  if (/追加|登録|add/.test(t)) {
    const name = t
      .replace(/を追加して|を追加|を登録して|を登録|追加して|登録して|add/, "")
      .trim();
    if (!name) return "追加するタスク名を入力してください。";
    return await addTask(name);
  }

  // ⑥ それ以外はすべてタスク追加として処理
  return await addTask(t);
}

// ステータス名をテキストから除去してタスク名を抽出
function extractTaskName(text, status) {
  return text
    .replace(`${status}にして`, "")
    .replace(`${status}にする`, "")
    .replace(`${status}に変更して`, "")
    .replace(`${status}に変更`, "")
    .replace(`${status}`, "")
    .replace(/を$|に$|は$|が$/, "")
    .trim();
}

// タスク名検索（完全一致 > 前方一致 > 部分一致）
function findTask(text) {
  if (!text || text.length < 1) return null;
  const q = text.trim();

  // 完全一致
  const exact = localTasks.find(t => t.name === q);
  if (exact) return exact;

  // 前方一致
  const forward = localTasks.find(t => t.name?.startsWith(q) || q.startsWith(t.name || ""));
  if (forward) return forward;

  // 部分一致（2文字以上）
  if (q.length >= 2) {
    const partial = localTasks.find(t => t.name?.includes(q) || q.includes(t.name || ""));
    if (partial) return partial;
  }

  return null;
}

function listTasks(filter) {
  const filtered = filter === "all"
    ? localTasks.filter(t => t.status !== "完了") // allのとき完了は除外
    : localTasks.filter(t => t.status === filter);

  const label = filter === "all" ? "未完了タスク" : filter;
  if (!filtered.length) return `${label}はありません。`;

  const COLORS = {"要対応":"#dc2626","対応中":"#2563eb","確認中":"#7c3aed","毎月対応":"#16a34a","完了":"#6b7280"};
  const items = filtered.slice(0, 12).map(t => {
    const c = COLORS[t.status] || "#6b7280";
    return `• <span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#f0f2f5;color:${c};margin-right:4px">${t.status}</span>${esc(t.name)}`;
  }).join("<br>");
  const more = filtered.length > 12 ? `<br><span style="color:#9ca3af">他${filtered.length-12}件…</span>` : "";
  return `📋 ${label}（${filtered.length}件）<br>${items}${more}`;
}

async function addTask(name) {
  if (!name || name.length < 1) return "タスク名を入力してください。";
  // 同名タスクがあれば確認
  const dup = localTasks.find(t => t.name === name && t.status !== "完了");
  if (dup) return `「${esc(name)}」はすでに登録されています（ステータス: ${dup.status}）。<br>別のタスク名にするか、ステータスを変更してください。`;

  const data = { project: "", name, status: "要対応", deadline: "", subtasks: [], createdAt: Date.now() };
  try {
    const ref = await addDoc(collection(db, "tasks_v2"), data);
    localTasks.push({ id: ref.id, ...data });
    window.dispatchEvent(new Event("tasksUpdated"));
    return `✅ <strong>${esc(name)}</strong> を追加しました（要対応）`;
  } catch(e) { return "追加に失敗しました。もう一度お試しください。"; }
}

async function updateStatus(task, status) {
  try {
    await updateDoc(doc(db, "tasks_v2", task.id), { status });
    task.status = status;
    window.dispatchEvent(new Event("tasksUpdated"));
    return `✅ <strong>${esc(task.name)}</strong> を <strong>${status}</strong> にしました`;
  } catch(e) { return "更新に失敗しました。もう一度お試しください。"; }
}

function suggestTasks(msg) {
  const active = localTasks.filter(t => t.status !== "完了").slice(0, 5).map(t => `・${esc(t.name)}`).join("<br>");
  return `${msg}<br><br>登録中のタスク：<br>${active || "なし"}`;
}

function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
