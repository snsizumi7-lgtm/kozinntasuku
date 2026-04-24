// js/report.js

export function initReport() {
  // Set default date to today
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("reportDate").value = today;

  document.getElementById("generateReportBtn").addEventListener("click", generateReport);
  document.getElementById("copyReportBtn").addEventListener("click", copyReport);
}

function generateReport() {
  const dateStr = document.getElementById("reportDate").value;
  const done = document.getElementById("reportDone").value.trim();
  const tomorrow = document.getElementById("reportTomorrow").value.trim();
  const memo = document.getElementById("reportMemo").value.trim();

  if (!dateStr) { alert("対象日を選択してください"); return; }

  const d = new Date(dateStr + "T00:00:00");
  const weekDays = ["日","月","火","水","木","金","土"];
  const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日（${weekDays[d.getDay()]}）`;

  // Format lines with bullet indent
  const formatLines = (text) => {
    if (!text) return "　（なし）";
    return text.split("\n")
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        // Add bullet if not already starting with ・ or •
        if (trimmed.startsWith("・") || trimmed.startsWith("•") || trimmed.startsWith("・")) {
          return `　${trimmed}`;
        }
        return `　・${trimmed}`;
      })
      .filter(l => l !== "")
      .join("\n");
  };

  const report = `【日報】${dateLabel}

■ 本日の作業内容
${formatLines(done)}

■ 明日の予定
${formatLines(tomorrow)}

■ 特記事項・連絡
${memo ? `　${memo}` : "　（なし）"}`;

  document.getElementById("reportPreview").textContent = report;
  document.getElementById("copyReportBtn").style.display = "block";
}

async function copyReport() {
  const text = document.getElementById("reportPreview").textContent;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("copyReportBtn");
    const orig = btn.textContent;
    btn.textContent = "✓ コピー済み";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  } catch (e) {
    alert("コピーに失敗しました。手動でコピーしてください。");
  }
}
