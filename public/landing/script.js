// Only the navigation disclosure needs JavaScript. The page and FAQ work without it.
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
