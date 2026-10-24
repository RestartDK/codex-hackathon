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
  while (faqLog.children.length >= 20) faqLog.firstElementChild.remove();
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
