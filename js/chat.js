// js/chat.js
import { db, collection, doc, addDoc, updateDoc, getDocs } from "./firebase.js";

let localTasks = [];

export async function initChat() {
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSend");
  if (!input || !sendBtn) return;

  // Load tasks for context
  try {
    const snap = await getDocs(collection(db, "tasks_v2"));
    localTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.warn("tasks load error:", e); }

  sendBtn.addEventListener("click", () => sendChat());
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } });
}

function addMessage(text, type = "ai") {
  const messages = document.getElementById("chatMessages");
  if (!messages) return;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${type}`;
  bubble.innerHTML = text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

async function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  addMessage(text, "user");
  const thinking = addMessage("考え中…", "ai thinking");

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

const STATUSES = ["要対応","対応中","確認中","毎月対応","完了"];

async function processTaskCommand(text) {
  const taskList = localTasks.map(t => `ID:${t.id} 案件:${t.project||"未設定"} タスク:${t.name} ステータス:${t.status}`).join("\n");

  const prompt = `あなたはタスク管理アシスタントです。ユーザーの指示を解析して、以下のJSON形式でのみ返答してください。

利用可能なステータス: ${STATUSES.join(", ")}

現在のタスク一覧:
${taskList || "（タスクなし）"}

ユーザーの指示: 「${text}」

以下のどれかのアクションをJSONで返してください:
- 追加: {"action":"add","project":"案件名","name":"タスク名","status":"ステータス"}
- ステータス変更: {"action":"update","id":"タスクID","status":"新ステータス","message":"説明"}
- 完了: {"action":"complete","id":"タスクID","message":"説明"}
- 不明: {"action":"unknown","message":"何をしたいか具体的に教えてください"}

JSONのみ返してください。説明文は不要です。`;

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
    return "解析できませんでした。「○○を追加して」「△△を完了にして」のように入力してください。";
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

  return cmd.message || "指示を理解できませんでした。「○○を追加して」「△△を完了にして」のように入力してください。";
}
