// Navigation and the local FAQ chat are progressively enhanced. Initial content works without JS.
const toggle = document.querySelector(".menu-toggle");
const links = document.querySelector("#nav-links");
const compact = window.matchMedia("(max-width: 767px)");
function closeMenu(returnFocus = false) {
  toggle.setAttribute("aria-expanded", "false");
  links.hidden = compact.matches;
  if (returnFocus) toggle.focus();
}
function syncMenu() {
  const focusWillHide = compact.matches && links.contains(document.activeElement);
  const toggleWillHide = !compact.matches && document.activeElement === toggle;
  toggle.hidden = !compact.matches;
  closeMenu(focusWillHide);
  if (toggleWillHide) links.querySelector("a").focus();
}
toggle.addEventListener("click", () => {
  const opening = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(opening));
  links.hidden = !opening;
});
links.addEventListener("click", (event) => {
  if (event.target.closest("a") && compact.matches) closeMenu(true);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
    closeMenu(true);
  }
});
document.addEventListener("click", (event) => {
  if (compact.matches && !event.target.closest(".nav-pill")) closeMenu();
});
document.querySelector(".nav-pill").addEventListener("focusout", (event) => {
  if (compact.matches && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
    closeMenu();
});
compact.addEventListener("change", syncMenu);
syncMenu();

// The FAQ is a local product guide. It never sends questions to a server.
const faqAnswers = {
  games: {
    question: "Which games can I try?",
    answer:
      "Chess is playable now, against the computer or in local two-player mode. Loups-Garous and Tic-Tac-Toe are in the making. The collection is intended to grow, so these are our starting point, rather than the whole world of Play by Voice.",
  },
  start: {
    question: "How do I start?",
    answer:
      "Choose Start playing to open the game picker, then select Chess. To use live voice, select the companion orb and allow microphone access. You can ask for a quick guide, describe the board, or propose a move. Voice needs the game server to be configured; keyboard and typed commands work without it.",
  },
  typing: {
    question: "Can I type instead?",
    answer:
      "Yes. Open the keyboard button beside the companion orb in the game. Try “e2 to e4”, “describe the board”, “hint”, or “help”. Say or type “yes” to confirm a proposed move. You can also explore the board with arrow keys and select with Enter or Space.",
  },
  privacy: {
    question: "What happens to my voice?",
    answer:
      "This landing page does not record audio or send your questions anywhere. When you explicitly start live voice in the game, microphone audio is sent to OpenAI for the conversation. The app saves game position and preferences on your device, but does not store raw audio or transcripts in local storage. Use End voice to close the session. Provider retention is separate from device storage; check the project documentation before enabling voice.",
  },
  access: {
    question: "Do I need to see the screen?",
    answer:
      "The companion supports spoken navigation, board descriptions, and moves. Starting voice requires an initial action and microphone permission. Some settings still use on-screen or keyboard controls. Testing with blind and low-vision players and across assistive technologies is still ahead.",
  },
  help: {
    question: "Can I ask for help with a move?",
    answer:
      "Yes. Ask for a hint, a description of the board, or a suggested move. A suggested move is a proposal and needs confirmation before it is played. You can also ask for a quick guide, review move history, pause, or resume.",
  },
  microphone: {
    question: "Do I need a microphone or API key?",
    answer:
      "Live voice needs a microphone, your permission, and a server configured with an OpenAI API key. Players do not enter a key on this page. Keyboard controls and typed commands work without live voice. This FAQ never asks for microphone access.",
  },
  about: {
    question: "What is Play by Voice?",
    answer:
      "Play by Voice is a hackathon project exploring games through speaking and listening. A conversational companion helps you navigate, understand a game, and make your next move, with blind and low-vision players in mind.",
  },
};
const faqLog = document.querySelector("#faq-chat-log");
const faqForm = document.querySelector("#faq-chat-form");
const faqInput = document.querySelector("#faq-question");
const faqSend = faqForm.querySelector("button");
const faqSuggestions = document.querySelector(".chat-suggestions");

function matchFaq(question) {
  const text = question.toLowerCase().replace(/[’']/g, "");
  if (/privac|record|stor(e|age)|data|retain|retention|sent|send.*voice/.test(text))
    return "privacy";
  if (/screen.?reader|blind|low.?vision|accessib|see|sight|screen/.test(text)) return "access";
  if (/typ(e|ed|ing)|keyboard|without.*(voice|mic)|no.*microphone/.test(text)) return "typing";
  if (/microphone|\bmic\b|api|key|voice.*(need|work)/.test(text)) return "microphone";
  if (/hint|help.*move|suggest|guid(e|ance)|rules/.test(text)) return "help";
  if (/start|begin|how.*play|setup|set.up/.test(text)) return "start";
  if (/games?|chess|loups|werewolf|tic.?tac|collection|coming/.test(text)) return "games";
  if (/what.*play.by.voice|about|what.*(this|project)|who.*you/.test(text)) return "about";
  return null;
}

function appendFaqMessage(text, fromPlayer) {
  const message = document.createElement("div");
  message.className = `chat-message ${fromPlayer ? "chat-question" : "chat-reply"}`;
  if (fromPlayer) {
    const label = document.createElement("span");
    label.className = "chat-sr-only";
    label.textContent = "You: ";
    message.append(label);
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    message.append(paragraph);
  } else {
    const orb = document.createElement("span");
    orb.className = "brand-orb";
    orb.setAttribute("aria-hidden", "true");
    registerAnimatedOrb(orb);
    prepareParticleOrb(orb);
    const content = document.createElement("div");
    const speaker = document.createElement("span");
    speaker.className = "chat-speaker";
    speaker.textContent = "Play by Voice";
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    content.append(speaker, paragraph);
    message.append(orb, content);
  }
  faqLog.append(message);
}

function askFaq(question, topic = matchFaq(question)) {
  question = question.trim().slice(0, 300);
  if (!question) return;
  // Bound this in-memory transcript; no questions are persisted.
  while (faqLog.children.length >= 20) {
    const oldest = faqLog.firstElementChild;
    oldest.querySelectorAll(".brand-orb").forEach((orb) => {
      motionObserver?.unobserve(orb);
      particleOrbs.delete(orb);
    });
    oldest.remove();
  }
  appendFaqMessage(question, true);
  const answer = topic
    ? faqAnswers[topic].answer
    : "I’m a product FAQ guide with a fixed set of answers. I can help with available games, getting started, keyboard controls, accessibility, move guidance, and voice privacy. Try one of the suggested questions below. For anything else, visit the project documentation linked at the bottom of this page.";
  appendFaqMessage(answer, false);
  faqInput.value = "";
  faqSend.disabled = true;
  const lastReply = faqLog.lastElementChild;
  // Keep the start of the new answer visible, including long answers on small screens.
  faqLog.scrollTop = Math.max(0, lastReply.offsetTop - faqLog.offsetTop - 24);
}
faqForm.addEventListener("submit", (event) => {
  event.preventDefault();
  askFaq(faqInput.value);
});
faqInput.addEventListener("input", () => {
  faqSend.disabled = !faqInput.value.trim();
});
faqSuggestions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-faq]");
  if (!button) return;
  const topic = button.dataset.faq;
  if (Object.hasOwn(faqAnswers, topic)) askFaq(faqAnswers[topic].question, topic);
});
faqForm.hidden = false;
faqSuggestions.hidden = false;

// Scale actual HTML rather than a screenshot, so the product preview stays sharp at zoom.
const previewViewport = document.querySelector(".preview-viewport");
const previewFrame = document.querySelector(".product-frame");
function scaleProductPreview() {
  previewFrame.style.transform = `scale(${previewViewport.clientWidth / 1440})`;
}
scaleProductPreview();
if ("ResizeObserver" in window) {
  new ResizeObserver(scaleProductPreview).observe(previewViewport);
} else {
  window.addEventListener("resize", scaleProductPreview);
}

// Ambient motion lives inside fixed spheres. The icon button names its next action.
const motionControl = document.querySelector("#orb-motion-toggle");
const motionIcon = motionControl.querySelector("use");
motionControl.hidden = false;
motionControl.addEventListener("click", () => {
  const paused = document.documentElement.classList.toggle("motion-paused");
  const label = paused ? "Resume orb animation" : "Pause orb animation";
  motionControl.setAttribute("aria-label", label);
  motionControl.setAttribute("title", label);
  motionIcon.setAttribute("href", `./assets/icons.svg#${paused ? "play" : "pause"}`);
});
const motionObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            entry.target.classList.toggle("orb-motion-visible", entry.isIntersecting);
            if (entry.isIntersecting) syncParticleMotion();
          }
        },
        { rootMargin: "32px" },
      )
    : null;
function registerAnimatedOrb(orb) {
  if (motionObserver) motionObserver.observe(orb);
  else orb.classList.add("orb-motion-visible");
}
document.querySelectorAll(".orb, .brand-orb").forEach(registerAnimatedOrb);
function syncPageMotion() {
  document.documentElement.classList.toggle("motion-document-hidden", document.hidden);
}
document.addEventListener("visibilitychange", syncPageMotion);
syncPageMotion();

// Fine particles follow rippling spherical bands, with no microphone or audio state.
const particleOrbs = new Map();
const reducedOrbMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let orbFrame = 0;
let orbLastFrame = 0;
function prepareParticleOrb(orb) {
  if (particleOrbs.has(orb)) return;
  const canvas = document.createElement("canvas");
  canvas.className = "orb-particles";
  canvas.setAttribute("aria-hidden", "true");
  orb.append(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }
  const small = orb.classList.contains("brand-orb");
  const size = small ? 96 : 640;
  canvas.width = canvas.height = size;
  const state = { context, size, small, green: orb.classList.contains("orb-demo"), time: 0 };
  particleOrbs.set(orb, state);
  drawParticleOrb(state);
}
function drawParticleOrb({ context: ctx, size, small, green, time }) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.495, 0, Math.PI * 2);
  ctx.clip();
  const rows = small ? 14 : 28;
  const columns = small ? 25 : 64;
  const rotation = time * 0.12;
  const color = green ? "83, 121, 49" : "48, 111, 184";
  for (let row = 0; row < rows; row++) {
    const latitude = -Math.PI / 2 + ((row + 0.5) / rows) * Math.PI;
    for (let col = 0; col < columns; col++) {
      const angle = (col / columns) * Math.PI * 2 + rotation + row * 0.027;
      const ripple = Math.sin(angle * 3 + latitude * 5 - time * 0.75);
      const radius = 0.83 + ripple * 0.07 + Math.cos(angle * 2 - time * 0.5) * 0.035;
      const x = Math.cos(latitude) * Math.cos(angle) * radius;
      const z = Math.cos(latitude) * Math.sin(angle) * radius;
      const y =
        Math.sin(latitude) * radius + Math.sin(angle * 2 + time * 0.65 + latitude * 4) * 0.055;
      const perspective = 1 / (1.18 - z * 0.18);
      const px = size * (0.5 + x * 0.51 * perspective);
      const py = size * (0.5 + y * 0.51 * perspective);
      const depth = (z + 1) / 2;
      ctx.fillStyle = `rgba(${color},${0.1 + depth * 0.55})`;
      ctx.beginPath();
      ctx.arc(px, py, size * (small ? 0.008 : 0.00165) * (0.65 + depth * 0.65), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
function particleMotionAllowed() {
  return (
    !reducedOrbMotion.matches &&
    !document.hidden &&
    !document.documentElement.classList.contains("motion-paused")
  );
}
function runParticleFrame(timestamp) {
  orbFrame = 0;
  if (!particleMotionAllowed()) {
    orbLastFrame = 0;
    return;
  }
  const elapsed = orbLastFrame ? Math.min((timestamp - orbLastFrame) / 1000, 0.05) : 0;
  orbLastFrame = timestamp;
  let visible = false;
  for (const [orb, state] of particleOrbs) {
    if (!orb.isConnected) {
      particleOrbs.delete(orb);
      continue;
    }
    if (!orb.classList.contains("orb-motion-visible")) continue;
    visible = true;
    state.time += elapsed;
    drawParticleOrb(state);
  }
  if (visible) orbFrame = requestAnimationFrame(runParticleFrame);
  else orbLastFrame = 0;
}
function syncParticleMotion() {
  if (particleMotionAllowed() && !orbFrame) orbFrame = requestAnimationFrame(runParticleFrame);
}
document.querySelectorAll(".orb, .brand-orb").forEach(prepareParticleOrb);
motionControl.addEventListener("click", syncParticleMotion);
document.addEventListener("visibilitychange", syncParticleMotion);
reducedOrbMotion.addEventListener("change", () => {
  if (reducedOrbMotion.matches) {
    for (const state of particleOrbs.values()) {
      state.time = 0;
      drawParticleOrb(state);
    }
  }
  syncParticleMotion();
});
syncParticleMotion();
