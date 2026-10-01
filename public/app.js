// CaseDetective client: screens, case file, interviews and accusation.
// All AI calls go through the local server; nothing secret lives here.
import { World, drawPortrait } from "./world.js";
import { Sound } from "./audio.js";

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const SAMPLES = {
  photosynthesis:
    "Photosynthesis. Plants convert light energy into chemical energy stored in glucose, inside chloroplasts. Light-dependent reactions happen in the thylakoid membranes: chlorophyll absorbs light, water is split (photolysis) releasing oxygen, and the energy makes ATP and NADPH. The Calvin cycle happens in the stroma: the enzyme RuBisCO fixes CO2, and ATP and NADPH are used to build G3P and then glucose. Limiting factors: light intensity, CO2 concentration and temperature. Too high a temperature denatures enzymes.",
  ww1:
    "Causes of the First World War (MAIN): Militarism, the arms race and naval rivalry between Britain and Germany. Alliances, the Triple Entente and Triple Alliance turned a local conflict into a continental war. Imperialism, competition for colonies and markets. Nationalism, especially in the Balkans; Serbian nationalism and the assassination of Archduke Franz Ferdinand in Sarajevo in June 1914 was the trigger. The July Crisis: Austria-Hungary's ultimatum to Serbia, Russian mobilisation, Germany's Schlieffen Plan and the invasion of Belgium brought Britain in.",
  newton:
    "Newton's laws of motion. First law (inertia): an object stays at rest or moves at constant velocity unless a resultant force acts on it. Second law: resultant force equals mass times acceleration (F = ma); a bigger force gives a bigger acceleration, a bigger mass gives a smaller one. Third law: when object A exerts a force on B, B exerts an equal and opposite force on A; the pair acts on different objects, so they don't cancel. Friction and air resistance oppose motion; terminal velocity is reached when drag equals weight.",
  algorithms:
    "Sorting algorithms. Bubble sort repeatedly swaps adjacent out-of-order elements; O(n^2) comparisons, simple but slow. Merge sort is divide and conquer: split the list in half, sort each half recursively, merge the sorted halves; O(n log n) always, needs extra memory, stable. Quicksort picks a pivot and partitions elements into smaller and larger, then recurses; O(n log n) on average but O(n^2) worst case with bad pivots, sorts in place. Big-O describes how running time grows with input size.",
};

const sound = new Sound();
let C = null; // public case view from the server
let chats = [[], [], []]; // display transcript per witness
let quick = [[], [], []];
let current = null; // witness index while interviewing
let busy = false;
let typing = null; // active typewriter
let freshClue = -1; // evidence card to animate on next render

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function api(path, body) {
  const init = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new Error("Can't reach the CaseDetective server. Is it still running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

// ---------------------------------------------------------------------------
// Screens and backdrop
// ---------------------------------------------------------------------------

const backdrop = new World($("#backdrop"), { attract: true });
backdrop.start();
document.fonts.ready.then(() => backdrop.build());

const world = new World($("#world"), {
  onNear: showPrompt,
  onInteract: handleInteract,
});

function show(name) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== `screen-${name}`;
  const game = name === "game";
  $("#backdrop").hidden = game || name === "report";
  if (game) {
    backdrop.stop();
    world.start();
  } else {
    world.stop();
    if (name !== "report") backdrop.start();
  }
  window.scrollTo(0, 0);
}

function remember(id) {
  try {
    if (id) sessionStorage.setItem("casedetective.case", id);
    else sessionStorage.removeItem("casedetective.case");
  } catch {
    // ignore
  }
}

function saveChats() {
  try {
    if (C) sessionStorage.setItem(`casedetective.chat.${C.id}`, JSON.stringify({ chats, quick }));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Title screen
// ---------------------------------------------------------------------------

const material = $("#material");
material.addEventListener("input", () => {
  $("#count").textContent = `${material.value.length.toLocaleString()} / 40,000`;
});
for (const chip of document.querySelectorAll("[data-sample]")) {
  chip.addEventListener("click", () => {
    material.value = SAMPLES[chip.dataset.sample];
    material.dispatchEvent(new Event("input"));
    material.focus();
  });
}

$("#intake").addEventListener("submit", async (e) => {
  e.preventDefault();
  sound.wake();
  const text = material.value.trim();
  const err = $("#intake-error");
  err.textContent = "";
  if (text.length < 3) {
    err.textContent = "Paste some notes or type a topic first.";
    material.focus();
    return;
  }
  show("loading");
  const stop = runLoading();
  try {
    const view = await api("/api/case", { material: text });
    stop(true);
    setTimeout(() => startCase(view), 450);
  } catch (error) {
    stop(false);
    show("title");
    err.textContent = error.message;
  }
});

$("#play-demo").addEventListener("click", async () => {
  sound.wake();
  const btn = $("#play-demo");
  btn.classList.add("loading");
  try {
    startCase(await api("/api/demo", {}));
  } catch (error) {
    $("#intake-error").textContent = error.message;
  } finally {
    btn.classList.remove("loading");
  }
});

function runLoading() {
  const items = [...document.querySelectorAll("#loading-steps li")];
  const bar = $("#loading-bar");
  let step = 0;
  const set = () => {
    items.forEach((li, i) => {
      li.className = i < step ? "done" : i === step ? "active" : "";
    });
    bar.style.width = `${Math.min(92, 8 + step * 26)}%`;
  };
  set();
  const timer = setInterval(() => {
    if (step < items.length - 1) {
      step++;
      set();
    }
  }, 6500);
  return (ok) => {
    clearInterval(timer);
    if (ok) {
      step = items.length;
      set();
      bar.style.width = "100%";
    }
  };
}

// ---------------------------------------------------------------------------
// Case setup
// ---------------------------------------------------------------------------

async function startCase(view, { resume = false } = {}) {
  C = view;
  remember(view.id);
  chats = [[], [], []];
  quick = [[], [], []];
  if (resume) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`casedetective.chat.${view.id}`) || "null");
      if (saved) ({ chats, quick } = saved);
    } catch {
      // ignore
    }
  }
  current = null;
  await document.fonts.ready;
  world.setCase(view);
  $("#hud-title").textContent = view.title;
  $("#hud-place").textContent = view.place;
  $("#file-title").textContent = view.title;
  $("#file-intro").textContent = view.intro;
  $("#file-objective").textContent = view.objective;
  $("#panel-chat").hidden = true;
  $("#panel-file").hidden = false;
  renderFile();
  show("game");
  if (!resume) openBrief();
  else $("#world").focus({ preventScroll: true });
}

function openBrief() {
  $("#brief-title").textContent = C.title;
  $("#brief-intro").textContent = C.intro;
  $("#brief-witnesses").innerHTML = C.npcs
    .map((n) => `<li><i style="background:${esc(n.color)}"></i><div><b>${esc(n.name)}</b><small>${esc(n.role)} · ${esc(n.location)} · guards <em>${esc(n.concept)}</em></small></div></li>`)
    .join("");
  const dlg = $("#dlg-brief");
  dlg.showModal();
  dlg.addEventListener(
    "close",
    () => {
      $("#world").focus({ preventScroll: true });
      if (!chats.some((c) => c.length)) toast("Find the witnesses marked with a ? on the street. Click to walk, or use WASD.", "gold", 6);
    },
    { once: true },
  );
}

function renderFile() {
  const s = C.state;
  const earned = s.clues.filter(Boolean).length;
  $("#evidence-count").textContent = `${earned} / 3`;
  $("#evidence").innerHTML = C.npcs.map((n, i) => evidenceCard(n, i, i === freshClue)).join("");
  freshClue = -1;
  // suspicion
  const sus = s.suspicion;
  for (const el of [$("#sus-fill"), $("#chat-sus-fill")]) {
    el.style.width = `${Math.max(4, sus)}%`;
  }
  $("#sus-meter").setAttribute("aria-valuenow", sus);
  $("#sus-meter").classList.toggle("hot", sus >= 70);
  $("#sus-label").textContent = sus < 35 ? `Calm · ${sus}` : sus < 70 ? `Wary · ${sus}` : `Hostile · ${sus}`;
  // witnesses
  $("#witnesses").innerHTML = C.npcs
    .map(
      (n, i) => `<li><button type="button" data-walk="${i}">
        <span class="sw" style="background:${esc(n.color)}"></span>
        <span><b>${esc(n.name)}</b><small>${esc(n.role)} · ${esc(n.location)}</small></span>
        <span class="st ${s.clues[i] ? "ok" : ""}">${s.clues[i] ? "Clue earned" : chats[i].length ? "Questioned" : "Not seen"}</span>
      </button></li>`,
    )
    .join("");
  for (const b of document.querySelectorAll("[data-walk]")) {
    b.addEventListener("click", () => {
      world.walkToNpc(Number(b.dataset.walk));
      $("#world").focus({ preventScroll: true });
    });
  }
  const all = s.clues.every(Boolean);
  const st = $("#btn-station");
  st.disabled = !all || s.verdict === "solved";
  st.classList.toggle("ready", all && s.verdict !== "solved");
  st.textContent = s.verdict === "solved" ? "Case closed" : all ? "Report to the Politiebureau" : `Report to the Politiebureau · ${earned}/3 clues`;
  world.setClues(s.clues);
}

function evidenceCard(n, i, fresh = false) {
  const earned = Boolean(n.clue);
  return `<article class="ev ${earned ? "earned" : ""} ${fresh ? "fresh" : ""}">
    <div class="ev-num">0${i + 1}</div>
    <div><span class="ev-concept">${esc(n.concept)}</span><p>${earned ? esc(n.clue) : `Sealed. Earn it from ${esc(n.name)}.`}</p></div>
  </article>`;
}

// ---------------------------------------------------------------------------
// World interaction
// ---------------------------------------------------------------------------

function showPrompt(it) {
  const p = $("#prompt");
  if (!it || current !== null) {
    p.hidden = true;
    return;
  }
  let text = "";
  if (it.type === "npc") text = `Talk to ${C.npcs[it.index].name}`;
  else if (it.type === "station") text = C.state.clues.every(Boolean) ? "Enter the Politiebureau" : "Politiebureau (locked until you have 3 clues)";
  else if (it.type === "board") text = "Read the case notice";
  $("#prompt-text").textContent = text;
  $("#touch-action").textContent = it.type === "npc" ? "Talk" : "Open";
  p.hidden = false;
}

function handleInteract(it) {
  sound.wake();
  if (it.type === "npc") openChat(it.index);
  else if (it.type === "board") openBrief();
  else if (it.type === "station") {
    if (C.state.verdict === "solved") return toast("The inspector already closed this case.", "gold");
    if (!C.state.clues.every(Boolean)) {
      const missing = C.npcs.filter((n) => !n.clue).map((n) => n.name);
      toast(`The desk sergeant shakes his head. Bring evidence from ${missing.join(" and ")}.`, "bad", 5);
      return;
    }
    openAccuse();
  }
}

let toastId = 0;
function toast(text, kind = "", secs = 4) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = text;
  el.style.setProperty("--life", `${secs}s`);
  el.dataset.id = ++toastId;
  const box = $("#toasts");
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), secs * 1000 + 600);
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

function openChat(i) {
  if (current !== null) return;
  current = i;
  const n = C.npcs[i];
  sound.door();
  world.enterInterior(i);
  $("#prompt").hidden = true;
  $("#panel-file").hidden = true;
  $("#panel-chat").hidden = false;
  $("#chat-name").textContent = n.name;
  $("#chat-role").textContent = `${n.role} · ${n.location}`;
  $("#chat-concept").textContent = n.concept;
  drawPortrait($("#portrait"), i, n.color);
  updateChatStatus();

  const log = $("#chat-log");
  log.innerHTML = "";
  if (!chats[i].length) {
    chats[i].push({ who: "npc", text: n.greeting }, { who: "npc", text: n.challenge, challenge: true });
    quick[i] = ["Can I have a hint?", "Explain it another way.", "Let me try an answer."];
    for (const m of chats[i]) appendMsg(m, false);
    animateLast();
  } else {
    for (const m of chats[i]) appendMsg(m, false);
    appendSys(`You're back with ${n.name}.`, "info", false);
    if (n.clue) quick[i] = ["Can you explain it more deeply?", "How does this connect to the case?", "Give me an exam-style question."];
  }
  renderQuick();
  saveChats();
  log.scrollTop = log.scrollHeight;
  setTimeout(() => $("#chat-input").focus({ preventScroll: true }), 50);
}

function closeChat() {
  if (current === null) return;
  finishTyping();
  current = null;
  world.exitInterior();
  $("#panel-chat").hidden = true;
  $("#panel-file").hidden = false;
  renderFile();
  $("#world").focus({ preventScroll: true });
  if (C.state.clues.every(Boolean) && C.state.verdict !== "solved") toast("All three clues logged. Report to the Politiebureau at the east end of the street.", "gold", 6);
}

function updateChatStatus() {
  const earned = Boolean(C.npcs[current]?.clue);
  const pill = $("#chat-status");
  pill.textContent = earned ? "Clue earned" : "Clue sealed";
  pill.classList.toggle("ok", earned);
  $("#chat-input").placeholder = earned ? "Ask anything about this concept…" : "Explain it in your own words…";
}

function appendMsg(m, record = true) {
  if (m.who === "sys") return appendSys(m.text, m.kind, record);
  if (record) chats[current].push(m);
  const n = C.npcs[current];
  const el = document.createElement("div");
  el.className = `msg ${m.who === "me" ? "me" : "npc"}`;
  el.innerHTML = `<span class="from">${m.who === "me" ? "You" : esc(n.name.split(" ")[0])}</span><div class="bubble ${m.challenge ? "challenge" : ""}"></div>`;
  el.querySelector(".bubble").textContent = m.text;
  $("#chat-log").append(el);
  scrollLog();
  return el;
}

function appendSys(text, kind, record = true) {
  if (record) chats[current].push({ who: "sys", text, kind });
  const el = document.createElement("div");
  el.className = `sys ${kind}`;
  el.textContent = text;
  $("#chat-log").append(el);
  scrollLog();
}

function scrollLog() {
  const log = $("#chat-log");
  log.scrollTop = log.scrollHeight;
}

/** Typewriter-reveal the last NPC bubble(s) for a "speaking" feel. */
function animateLast() {
  const bubbles = [...$("#chat-log").querySelectorAll(".msg.npc .bubble")].slice(-2);
  typeBubbles(bubbles);
}

function typeBubbles(bubbles) {
  finishTyping();
  if (reduceMotion || !bubbles.length) return;
  const texts = bubbles.map((b) => b.textContent);
  bubbles.forEach((b) => (b.textContent = ""));
  let bi = 0;
  let ci = 0;
  world.setSpeaking(true);
  const state = { done: false };
  const stepFn = () => {
    if (state.done) return;
    if (bi >= bubbles.length) return finish();
    ci = Math.min(texts[bi].length, ci + 2);
    bubbles[bi].textContent = texts[bi].slice(0, ci);
    if (ci % 12 === 0) sound.tick();
    scrollLog();
    if (ci >= texts[bi].length) {
      bi++;
      ci = 0;
      state.timer = setTimeout(stepFn, 260);
    } else {
      state.timer = setTimeout(stepFn, 16);
    }
  };
  const finish = () => {
    state.done = true;
    clearTimeout(state.timer);
    bubbles.forEach((b, i) => (b.textContent = texts[i]));
    world.setSpeaking(false);
    typing = null;
    scrollLog();
  };
  typing = { finish };
  stepFn();
}

function finishTyping() {
  if (typing) typing.finish();
}

$("#chat-log").addEventListener("click", finishTyping);

function renderQuick() {
  const box = $("#quick");
  box.innerHTML = "";
  (quick[current] || []).slice(0, 3).forEach((q, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<kbd>${i + 1}</kbd><span></span>`;
    b.querySelector("span").textContent = q;
    b.disabled = busy;
    b.addEventListener("click", () => pickQuick(q));
    box.append(b);
  });
}

function pickQuick(q) {
  if (/^let me (try|answer)/i.test(q)) {
    $("#chat-input").focus();
    return;
  }
  send(q);
}

async function send(text) {
  text = text.trim();
  if (!text || busy || current === null) return;
  finishTyping();
  const i = current;
  busy = true;
  $("#chat-input").value = "";
  autosize();
  $("#chat-send").disabled = true;
  appendMsg({ who: "me", text });
  renderQuick();
  const wait = document.createElement("div");
  wait.className = "msg npc";
  wait.innerHTML = `<span class="from">${esc(C.npcs[i].name.split(" ")[0])}</span><div class="bubble typing"><i></i><i></i><i></i></div>`;
  $("#chat-log").append(wait);
  scrollLog();
  world.setThinking(true);

  try {
    const r = await api(`/api/case/${C.id}/talk`, { npc: i, text });
    wait.remove();
    world.setThinking(false);
    if (current !== i) {
      // Player left mid-answer; keep the transcript consistent anyway.
      chats[i].push({ who: "npc", text: r.reply });
      C.state = r.state;
      if (r.clue) C.npcs[i].clue = r.clue;
      saveChats();
      renderFile();
      return;
    }
    const el = appendMsg({ who: "npc", text: r.reply });
    typeBubbles([el.querySelector(".bubble")]);
    C.state = r.state;
    if (r.suspicionDelta > 0) {
      appendSys(`Suspicion +${r.suspicionDelta}`, "bad");
      sound.thud();
      world.shake();
      document.querySelector(".stage").classList.remove("shake");
      void document.querySelector(".stage").offsetWidth;
      document.querySelector(".stage").classList.add("shake");
    } else if (r.understanding === "partial" && !C.npcs[i].clue) {
      appendSys("On the right track", "info");
    }
    if (r.clue) {
      C.npcs[i].clue = r.clue;
      freshClue = i;
      appendSys(`Evidence logged: ${r.clue}`, "good");
      sound.chime();
      world.celebrate();
      toast(`Evidence logged: ${r.clue}`, "good", 5);
      updateChatStatus();
      const earned = C.state.clues.filter(Boolean).length;
      if (earned === 3) setTimeout(() => toast("That's all three. Head to the Politiebureau to make your case.", "gold", 6), 1200);
    }
    if (r.offline) appendSys("Offline mode: simple grading", "info");
    quick[i] = r.quickReplies?.length ? r.quickReplies : ["Can I have a hint?", "Explain it another way.", "Let me try again."];
    renderFile();
    if (r.ejected) {
      appendSys("You've pushed too far. You're shown the door.", "bad");
      toast(`${C.npcs[i].name} threw you out. Cool off, then try again.`, "bad", 5);
      setTimeout(closeChat, 2200);
    }
  } catch (error) {
    wait.remove();
    world.setThinking(false);
    if (current === i) appendSys(error.message, "bad", false);
  } finally {
    busy = false;
    $("#chat-send").disabled = false;
    if (current === i) {
      renderQuick();
      saveChats();
      $("#chat-input").focus({ preventScroll: true });
    }
  }
}

const input = $("#chat-input");
function autosize() {
  input.style.height = "auto";
  input.style.height = `${Math.min(140, input.scrollHeight)}px`;
}
input.addEventListener("input", autosize);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send(input.value);
  } else if (/^[1-3]$/.test(e.key) && !input.value) {
    const q = (quick[current] || [])[Number(e.key) - 1];
    if (q) {
      e.preventDefault();
      pickQuick(q);
    }
  }
});
$("#chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  send(input.value);
});
$("#btn-leave").addEventListener("click", closeChat);

// ---------------------------------------------------------------------------
// Accusation
// ---------------------------------------------------------------------------

function openAccuse() {
  const dlg = $("#dlg-accuse");
  $("#accuse-evidence").innerHTML = C.npcs.map((n, i) => evidenceCard(n, i)).join("");
  $("#accuse-q").textContent = C.accusationQuestion;
  $("#accuse-result").hidden = true;
  $("#accuse-submit").hidden = false;
  $("#accuse-submit").disabled = false;
  $("#accuse-submit").textContent = "Present the case";
  delete $("#accuse-submit").dataset.mode;
  sound.door();
  dlg.showModal();
  setTimeout(() => $("#accuse-text").focus(), 60);
}

function closeAccuse() {
  $("#dlg-accuse").close();
  $("#world").focus({ preventScroll: true });
}
$("#accuse-x").addEventListener("click", closeAccuse);
$("#accuse-back").addEventListener("click", closeAccuse);

$("#accuse-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#accuse-submit");
  if (btn.dataset.mode === "report") return openReport();
  const text = $("#accuse-text").value.trim();
  const res = $("#accuse-result");
  if (text.length < 10) {
    res.hidden = false;
    res.innerHTML = `<p>Make your case in a few sentences, using all three pieces of evidence.</p>`;
    return;
  }
  btn.disabled = true;
  btn.textContent = "The inspector is reading…";
  try {
    const r = await api(`/api/case/${C.id}/accuse`, { text });
    C.state = r.state;
    res.hidden = false;
    const label = { solved: "Case solved", partial: "Not convinced", no: "Rejected" }[r.verdict];
    res.innerHTML = `<span class="verdict ${r.verdict}">${label}</span><p></p>${r.missing?.length ? `<p class="missing">Weak or missing: ${esc(r.missing.join(", "))}</p>` : ""}`;
    res.querySelector("p").textContent = r.feedback;
    if (r.verdict === "solved") {
      sound.solved();
      btn.dataset.mode = "report";
      btn.textContent = "Close the case and see your report";
      renderFile();
    } else {
      sound.thud();
      btn.textContent = "Revise and present again";
    }
  } catch (error) {
    res.hidden = false;
    res.innerHTML = `<p></p>`;
    res.querySelector("p").textContent = error.message;
    btn.textContent = "Present the case";
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

async function openReport() {
  if ($("#dlg-accuse").open) $("#dlg-accuse").close();
  closeChat();
  let r;
  try {
    r = await api(`/api/case/${C.id}/report`);
  } catch (error) {
    toast(error.message, "bad");
    return;
  }
  const solved = r.verdict === "solved";
  const earned = r.concepts.filter((c) => c.earned).length;
  const exchanges = r.concepts.reduce((a, c) => a + c.exchanges, 0);
  $("#report").innerHTML = `
    <article class="report-sheet">
      <div class="big-stamp ${solved ? "solved" : "open"}">${solved ? "CASE CLOSED" : "CASE OPEN"}</div>
      <p class="kicker">Case report &middot; ${esc(r.place)}</p>
      <h1>${esc(r.title)}</h1>
      <p class="sub">${solved ? "Solved. Here is what you proved you understand." : "Not solved yet. Here is where you stand."}</p>
      <div class="stats">
        <div><b>${earned}/3</b><span>Clues earned</span></div>
        <div><b>${exchanges}</b><span>Answers given</span></div>
        <div><b>${r.attempts}</b><span>Accusations</span></div>
        <div><b>${r.suspicion}</b><span>Final suspicion</span></div>
      </div>
      <h3>Concepts</h3>
      ${r.concepts
        .map(
          (c, i) => `<div class="concept-row"><span class="n">0${i + 1}</span><div><b>${esc(c.concept)}</b><p>${esc(c.earned ? c.clue : c.challenge)}</p><p style="font-size:12.5px;color:#6d5f4c">Witness: ${esc(c.witness)}</p></div><span class="tag ${c.earned ? "ok" : "no"}">${c.earned ? "Earned" : "Missed"}</span></div>`,
        )
        .join("")}
      <h3>The solution</h3>
      <p class="solution">${esc(r.solution)}</p>
      ${r.feedback ? `<p class="inspector"><b>Inspector:</b> ${esc(r.feedback)}</p>` : ""}
      <h3>Review next</h3>
      ${
        r.notes.length
          ? `<ul class="review">${r.notes.map((n) => `<li><b>${esc(n.concept)}:</b> ${esc(n.note)}</li>`).join("")}</ul>`
          : `<p>No slips recorded. You explained every concept cleanly. Try a harder topic next.</p>`
      }
    </article>
    <div class="report-actions">
      ${solved ? "" : `<button class="btn primary" id="rep-resume">Resume the case</button>`}
      <button class="btn ${solved ? "primary" : "ghost"}" id="rep-new">Open a new case</button>
      <button class="btn ghost" id="rep-print">Print study sheet</button>
    </div>`;
  show("report");
  $("#rep-new").addEventListener("click", () => {
    remember(null);
    C = null;
    show("title");
  });
  $("#rep-print").addEventListener("click", () => window.print());
  $("#rep-resume")?.addEventListener("click", () => {
    show("game");
    $("#world").focus({ preventScroll: true });
  });
}

$("#btn-close").addEventListener("click", openReport);
$("#btn-help").addEventListener("click", openBrief);
$("#btn-station").addEventListener("click", () => {
  world.walkToStation();
  $("#world").focus({ preventScroll: true });
});
const soundBtn = $("#btn-sound");
const syncSound = () => {
  soundBtn.setAttribute("aria-pressed", String(sound.on));
  soundBtn.setAttribute("aria-label", sound.on ? "Sound on" : "Sound off");
};
syncSound();
soundBtn.addEventListener("click", () => {
  sound.toggle();
  syncSound();
});

// ---------------------------------------------------------------------------
// Keyboard and touch
// ---------------------------------------------------------------------------

const KEYMAP = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };

addEventListener("keydown", (e) => {
  if ($("#screen-game").hidden || document.querySelector("dialog[open]")) return;
  const k = e.key.toLowerCase();
  const typingIn = ["INPUT", "TEXTAREA"].includes(e.target.tagName);
  if (k === "escape" && current !== null) {
    e.preventDefault();
    closeChat();
    return;
  }
  if (typingIn || current !== null) return;
  if (KEYMAP[k]) {
    world.setKey(KEYMAP[k], true);
    e.preventDefault();
  } else if (k === "e" || k === "enter" || k === " ") {
    e.preventDefault();
    world.interact();
  }
});
addEventListener("keyup", (e) => {
  const k = KEYMAP[e.key.toLowerCase()];
  if (k) world.setKey(k, false);
});
addEventListener("blur", () => ["up", "down", "left", "right"].forEach((k) => world.setKey(k, false)));

for (const b of document.querySelectorAll(".dpad button")) {
  const k = b.dataset.key;
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    world.setKey(k, true);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => world.setKey(k, false));
}
$("#touch-action").addEventListener("click", () => world.interact());

// ---------------------------------------------------------------------------
// Resume a case after a page refresh
// ---------------------------------------------------------------------------

(async () => {
  let id = null;
  try {
    id = sessionStorage.getItem("casedetective.case");
  } catch {
    // ignore
  }
  if (!id) return;
  try {
    const view = await api(`/api/case/${id}`);
    startCase(view, { resume: true });
  } catch {
    remember(null);
  }
})();
