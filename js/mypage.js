// js/mypage.js
import { db, collection, getDocs, doc, updateDoc, addDoc } from "./firebase.js";

const MY_NAME_KEY = "tasuku_myname";

export function initMypage() {
  document.getElementById("addRequestBtn")?.addEventListener("click", addRequest);
}

// ===== マイページレンダリング =====
export async function renderMypage() {
  const el = document.getElementById("mypageContent");
  if (!el) return;
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  const myName = localStorage.getItem(MY_NAME_KEY) || "";

  // 名前設定UI
  const nameHtml = `
    <div class="mypage-name-row">
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">あなたの名前（依頼の受信に使用）</div>
      <div style="display:flex;gap:8px">
        <input type="text" class="form-input" id="myNameInput" value="${myName}" placeholder="名前を入力" style="max-width:200px">
        <button class="btn-save" id="saveMyName" style="padding:7px 14px">保存</button>
      </div>
    </div>`;

  // タスクデータ取得
  let tasks = [];
  let requests = [];
  try {
    const tsnap = await getDocs(collection(db, "tasks_v2"));
    tasks = tsnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rsnap = await getDocs(collection(db, "requests"));
    requests = rsnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {}

  const notifications = buildNotifications(tasks, requests, myName);
  updateBadge(notifications.filter(n => !n.read).length);

  el.innerHTML = nameHtml + renderNotifications(notifications);

  document.getElementById("saveMyName")?.addEventListener("click", () => {
    const val = document.getElementById("myNameInput").value.trim();
    if (!val) return;
    localStorage.setItem(MY_NAME_KEY, val);
    showToast("名前を保存しました");
    renderMypage();
  });

  // 既読ボタン
  el.querySelectorAll(".notif-read-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const type = btn.dataset.type;
      if (type === "request") {
        try {
          await updateDoc(doc(db, "requests", id), { read: true });
        } catch(e) {}
      }
      renderMypage();
    });
  });
}

function buildNotifications(tasks, requests, myName) {
  const notifs = [];
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const dow = today.getDay(); // 0=日, 5=金

  // ① 金曜アラート
  if (dow === 5) {
    notifs.push({
      id: "friday_alert",
      type: "friday",
      level: "warning",
      title: "週次近況報告のお時間です",
      body: "今週のタスクを確認し、全件の近況を更新してください。週次サマリーも作成しましょう。",
      time: "毎週金曜",
      read: false,
      icon: "📅"
    });
  }

  // ② 3日以上更新なしタスク
  const stale = tasks.filter(t => {
    if (t.done) return false;
    const updated = t.updatedAt || t.createdAt;
    if (!updated) return false;
    const diff = (today - new Date(updated)) / (1000 * 60 * 60 * 24);
    return diff >= 3;
  });

  if (stale.length > 0) {
    stale.slice(0, 5).forEach(t => {
      const updated = t.updatedAt || t.createdAt;
      const diff = Math.floor((today - new Date(updated)) / (1000 * 60 * 60 * 24));
      notifs.push({
        id: `stale_${t.id}`,
        type: "stale",
        level: "alert",
        title: "近況報告が必要です",
        body: `「${t.name}」が${diff}日間更新されていません。現在の状況を更新してください。`,
        time: `${diff}日前に最終更新`,
        read: false,
        icon: "⚠️"
      });
    });
  }

  // ③ 自分宛の依頼
  if (myName) {
    const myRequests = requests.filter(r =>
      r.assignee === myName && !r.read
    );
    myRequests.forEach(r => {
      notifs.push({
        id: r.id,
        type: "request",
        level: "info",
        title: "新しい依頼があります",
        body: `【${r.title}】${r.body ? "\n" + r.body : ""}${r.deadline ? "\n期限: " + r.deadline : ""}`,
        time: r.createdAt ? new Date(r.createdAt).toLocaleDateString("ja-JP") : "",
        read: false,
        icon: "📨"
      });
    });
  }

  return notifs;
}

function renderNotifications(notifs) {
  if (!notifs.length) {
    return `<div class="empty-guide" style="margin-top:20px">
      <div class="empty-guide-icon">✅</div>
      <div class="empty-guide-title">通知はありません</div>
      <div class="empty-guide-desc">タスクの近況報告や依頼があればここに表示されます</div>
    </div>`;
  }

  const levelColor = { alert:"#ef4444", warning:"#f59e0b", info:"#3b82f6" };
  const levelBg = { alert:"#fef2f2", warning:"#fffbeb", info:"#eff6ff" };
  const levelBorder = { alert:"#fca5a5", warning:"#fcd34d", info:"#93c5fd" };

  return `<div class="notif-list">
    ${notifs.map(n => `
      <div class="notif-card" style="border-left-color:${levelColor[n.level]}">
        <div class="notif-header">
          <span class="notif-icon">${n.icon}</span>
          <div class="notif-title-wrap">
            <div class="notif-title">${n.title}</div>
            <div class="notif-time">${n.time}</div>
          </div>
          ${n.type === "request" ? `<button class="notif-read-btn" data-id="${n.id}" data-type="request">既読</button>` : ""}
        </div>
        <div class="notif-body">${n.body.replace(/\n/g,"<br>")}</div>
      </div>
    `).join("")}
  </div>`;
}

// ===== 管理設定：依頼追加 =====
async function addRequest() {
  const title = document.getElementById("reqTitle")?.value.trim();
  const assignee = document.getElementById("reqAssignee")?.value.trim();
  const body = document.getElementById("reqBody")?.value.trim();
  const deadline = document.getElementById("reqDeadline")?.value;

  if (!title || !assignee) { showToast("タイトルと担当者名は必須です"); return; }

  try {
    await addDoc(collection(db, "requests"), {
      title, assignee, body: body || "", deadline: deadline || "",
      read: false, createdAt: Date.now()
    });
    document.getElementById("reqTitle").value = "";
    document.getElementById("reqAssignee").value = "";
    document.getElementById("reqBody").value = "";
    document.getElementById("reqDeadline").value = "";
    showToast(`${assignee}さんに依頼を送信しました`);
    loadAdminRequestList();
  } catch(e) { showToast("送信に失敗しました"); }
}

export async function loadAdminRequestList() {
  const el = document.getElementById("adminRequestList");
  if (!el) return;
  try {
    const snap = await getDocs(collection(db, "requests"));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    if (!list.length) { el.innerHTML = '<div class="empty-state">送信済みの依頼はありません</div>'; return; }
    el.innerHTML = list.map(r => `
      <div class="admin-request-item">
        <div class="admin-request-header">
          <span class="admin-request-title">${r.title}</span>
          <span class="admin-request-assignee">→ ${r.assignee}</span>
          <span class="admin-request-status ${r.read ? "read" : "unread"}">${r.read ? "既読" : "未読"}</span>
        </div>
        ${r.body ? `<div class="admin-request-body">${r.body}</div>` : ""}
        ${r.deadline ? `<div class="admin-request-deadline">期限: ${r.deadline}</div>` : ""}
      </div>
    `).join("");
  } catch(e) { el.innerHTML = '<div class="empty-state">読み込みエラー</div>'; }
}

export function updateBadge(count) {
  ["navBadgeMypage","bottomBadgeMypage"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
      el.style.display = "inline-flex";
      el.textContent = count;
    } else {
      el.style.display = "none";
    }
  });
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}
