// js/chat.js
import { db, collection, doc, addDoc, updateDoc, getDocs, setDoc } from "./firebase.js";

const STATUSES = ["要対応","対応中","確認中","毎月対応","完了"];
const CHAT_HISTORY_KEY = "tasuku_chat_history";
let localTasks = [];

export async function initChat() {
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSend");
  if (!input || !sendBtn) return;

  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    localTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.warn("tasks load error:", e); }

  loadChatHistory();

  sendBtn.addEventListener("click", () => sendChat());
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
}

function loadChatHistory() {
  const messages = document.getElementById("chatMessages");
  if (!messages) return;
  try {
    const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || "[]");
    if (!history.length) return;

    // 今日の日付グループで表示（最新20件）
    const recent = history.slice(-20);
    let lastDate = null;
    recent.forEach(msg => {
      const msgDate = msg.date || "";
      if (msgDate && msgDate !== lastDate) {
        const divider = document.createElement("div");
        divider.className = "chat-date-divider";
        divider.innerHTML = `<span>${formatDateLabel(msgDate)}</span>`;
        messages.appendChild(divider);
        lastDate = msgDate;
      }
      addMessageEl(msg.text, msg.type, false);
    });
    messages.scrollTop = messages.scrollHeight;
  } catch(e) {}
}

function saveChatHistory(text, type) {
  try {
    const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || "[]");
    history.push({ text, type, date: new Date().toISOString().slice(0,10), ts: Date.now() });
    // 最新100件のみ保持
    if (history.length > 100) history.splice(0, history.length - 100);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
  } catch(e) {}
}

function formatDateLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date().toISOString().slice(0,10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  if (dateStr === today) return "今日";
  if (dateStr === yesterday) return "昨日";
  const weekDays = ["日","月","火","水","木","金","土"];
  return `${d.getMonth()+1}月${d.getDate()}日（${weekDays[d.getDay()]}）`;
}

function addMessageEl(text, type = "ai", save = true) {
  const messages = document.getElementById("chatMessages");
  if (!messages) return;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${type}`;
  bubble.innerHTML = text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  if (save) saveChatHistory(text, type);
  return bubble;
}

function addMessage(text, type = "ai", save = true) {
  return addMessageEl(text, type, save);
}

async function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  // 日付区切りを必要に応じて表示
  const today = new Date().toISOString().slice(0,10);
  const messages = document.getElementById("chatMessages");
  const lastDivider = messages.querySelector(".chat-date-divider:last-of-type");
  if (!lastDivider || lastDivider.textContent.trim() !== "今日") {
    const divider = document.createElement("div");
    divider.className = "chat-date-divider";
    divider.innerHTML = `<span>今日</span>`;
    messages.appendChild(divider);
  }

  addMessage(text, "user");
  const thinking = addMessage("考え中…", "ai thinking", false);

  try {
    const result = await processTaskCommand(text);
    thinking.remove();
    addMessage(result, "ai");
  } catch(e) {
    thinking.remove();
    addMessage("エラーが発生しました。もう一度お試しください。", "ai");
    console.error(e);
  }
}

async function processTaskCommand(text) {
  const taskList = localTasks.map(t =>
    `ID:${t.id} 案件:${t.project||"未設定"} タスク:${t.name} ステータス:${t.status}`
  ).join("\n");

  const prompt = `あなたはタスク管理アシスタントです。ユーザーの指示を解析して、JSONのみ返してください。

利用可能なステータス: ${STATUSES.join(", ")}

現在のタスク一覧:
${taskList || "（タスクなし）"}

ユーザーの指示: 「${text}」

以下のアクションをJSONで返してください:
- 追加: {"action":"add","project":"案件名","name":"タスク名","status":"ステータス"}
- ステータス変更: {"action":"update","id":"タスクID","status":"新ステータス","message":"説明"}
- 完了: {"action":"complete","id":"タスクID","message":"説明"}
- 一覧表示: {"action":"list","filter":"要対応|対応中|確認中|毎月対応|完了|all","message":"説明"}
- 不明: {"action":"unknown","message":"何をしたいか具体的に教えてください"}

JSONのみ返してください。`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();
  const raw = data.content?.[0]?.text || "";

  let parsed;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    return "解析できませんでした。「○○を追加して」「△△を完了にして」「要対応一覧」のように入力してください。";
  }

  return await executeAction(parsed);
}

async function executeAction(cmd) {
  if (cmd.action === "add") {
    const data = {
      project: cmd.project || "",
      name: cmd.name || "",
      status: STATUSES.includes(cmd.status) ? cmd.status : "要対応",
      deadline: "",
      subtasks: [],
      createdAt: Date.now()
    };
    const ref = await addDoc(collection(db, "tasks_v2"), data);
    localTasks.push({ id: ref.id, ...data });
    window.dispatchEvent(new Event("tasksUpdated"));
    return `✅ <strong>${data.name}</strong> を追加しました<br>案件: ${data.project||"未設定"} | ステータス: ${data.status}`;
  }

  if (cmd.action === "update" || cmd.action === "complete") {
    const status = cmd.action === "complete" ? "完了" : cmd.status;
    const task = localTasks.find(t => t.id === cmd.id);
    if (!task) return "該当するタスクが見つかりませんでした。";
    await updateDoc(doc(db, "tasks_v2", cmd.id), { status });
    task.status = status;
    window.dispatchEvent(new Event("tasksUpdated"));
    return `✅ <strong>${task.name}</strong> を<strong>${status}</strong>にしました`;
  }

  if (cmd.action === "list") {
    const filter = cmd.filter || "all";
    const filtered = filter === "all" ? localTasks : localTasks.filter(t => t.status === filter);
    if (!filtered.length) return `${filter === "all" ? "タスク" : filter}はまだありません。`;
    const items = filtered.slice(0, 10).map(t =>
      `• [${t.status}] ${t.project ? `<span style="color:var(--text-muted)">${t.project}</span> / ` : ""}${t.name}`
    ).join("<br>");
    const more = filtered.length > 10 ? `<br><span style="color:var(--text-muted)">他${filtered.length-10}件…</span>` : "";
    return `📋 ${filter === "all" ? "全タスク" : filter}（${filtered.length}件）<br>${items}${more}`;
  }

  return cmd.message || "指示を理解できませんでした。「○○を追加して」「△△を完了にして」「要対応一覧」のように入力してください。";
}
