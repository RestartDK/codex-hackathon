// Navigation and the local FAQ chat are progressively enhanced. Initial content works without JS.
const toggle = document.querySelector(".menu-toggle");
const links = document.querySelector("#nav-links");
const compact = window.matchMedia("(max-width: 767px)");
const nav = document.querySelector(".nav-pill");
const menuMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let menuAnimation = null;
let menuContentAnimation = null;
let menuLabelAnimation = null;
let menuItemAnimations = [];
function setMenu(opening, returnFocus = false, immediate = false) {
  const wasOpen = toggle.getAttribute("aria-expanded") === "true";
  if (!opening && !wasOpen && !menuAnimation && !immediate) {
    if (returnFocus) toggle.focus();
    return;
  }
  const startHeight = nav.getBoundingClientRect().height;
  const wasHidden = links.hidden;
  const startOpacity = wasHidden ? 0 : Number(getComputedStyle(links).opacity);
  const startTransform = wasHidden ? "translateY(-6px)" : getComputedStyle(links).transform;
  menuAnimation?.cancel();
  menuContentAnimation?.cancel();
  menuLabelAnimation?.cancel();
  menuItemAnimations.forEach((animation) => animation.cancel());
  menuItemAnimations = [];
  menuAnimation = null;
  toggle.setAttribute("aria-expanded", String(opening));
  toggle.querySelector(".menu-label").textContent = opening ? "Close" : "Menu";
  nav.classList.toggle("is-open", opening);
  if (returnFocus) toggle.focus();
  links.inert = compact.matches && !opening;
  if (compact.matches && !opening) links.setAttribute("aria-hidden", "true");
  else links.removeAttribute("aria-hidden");
  if (immediate || !compact.matches || menuMotionPreference.matches || !nav.animate) {
    links.hidden = compact.matches && !opening;
    nav.style.overflow = "";
    return;
  }
  // Keep the closing content in layout until the panel has finished shrinking.
  links.hidden = false;
  let endHeight;
  if (opening) endHeight = nav.getBoundingClientRect().height;
  else {
    links.hidden = true;
    endHeight = nav.getBoundingClientRect().height;
    links.hidden = false;
  }
  nav.style.overflow = "hidden";
  const animation = nav.animate([{ height: `${startHeight}px` }, { height: `${endHeight}px` }], {
    duration: 650,
    easing: "cubic-bezier(.22,1,.36,1)",
  });
  menuAnimation = animation;
  menuContentAnimation = links.animate(
    [
      { opacity: startOpacity, transform: startTransform },
      { opacity: opening ? 1 : 0, transform: opening ? "translateY(0)" : "translateY(-4px)" },
    ],
    { duration: opening ? 500 : 220, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" },
  );
  menuLabelAnimation = toggle.querySelector(".menu-label").animate(
    [
      { opacity: 0.4, transform: "translateY(2px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" },
  );
  if (opening && wasHidden)
    menuItemAnimations = Array.from(links.children).map((item, index) =>
      item.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: 500,
          delay: 60 + index * 45,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "backwards",
        },
      ),
    );
  animation.finished
    .then(() => {
      if (menuAnimation !== animation) return;
      links.hidden = !opening;
      nav.style.overflow = "";
      menuAnimation = null;
      menuContentAnimation?.cancel();
      menuContentAnimation = null;
    })
    .catch(() => {});
}
function closeMenu(returnFocus = false) {
  setMenu(false, returnFocus);
}
function syncMenu() {
  const focusWillHide = compact.matches && links.contains(document.activeElement);
  const toggleWillHide = !compact.matches && document.activeElement === toggle;
  toggle.hidden = !compact.matches;
  setMenu(false, focusWillHide, true);
  if (toggleWillHide) links.querySelector("a").focus();
}
menuMotionPreference.addEventListener("change", () =>
  setMenu(toggle.getAttribute("aria-expanded") === "true", false, true),
);
toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
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

// Question messages disclose local, verified replies without an API or text composer.
const faqItems = Array.from(document.querySelectorAll(".bubble-faq"));
const faqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const faqTransitions = new Map();
function setFaqExpanded(item, expanded, immediate = false) {
  const summary = item.querySelector("summary");
  const response = item.querySelector(".faq-bubble-response");
  const previous = faqTransitions.get(item);
  const from = item.open ? response.getBoundingClientRect().height : 0;
  const fromOpacity = item.open ? Number(getComputedStyle(response).opacity) : 0;
  previous?.animation.cancel();
  faqTransitions.delete(item);
  item.dataset.expanded = String(expanded);
  summary.setAttribute("aria-expanded", String(expanded));
  response.inert = !expanded;
  if (expanded) response.removeAttribute("aria-hidden");
  else response.setAttribute("aria-hidden", "true");
  if (immediate || faqMotion.matches || !response.animate) {
    item.open = expanded;
    response.style.overflow = "";
    return;
  }
  item.open = true;
  const to = expanded ? response.scrollHeight : 0;
  response.style.overflow = "hidden";
  const animation = response.animate(
    [
      { height: `${from}px`, opacity: fromOpacity },
      { height: `${to}px`, opacity: expanded ? 1 : 0 },
    ],
    { duration: expanded ? 480 : 340, easing: "cubic-bezier(.22,1,.36,1)" },
  );
  faqTransitions.set(item, { animation, expanded });
  animation.finished
    .then(() => {
      if (faqTransitions.get(item)?.animation !== animation) return;
      item.open = expanded;
      response.style.overflow = "";
      faqTransitions.delete(item);
    })
    .catch(() => {});
}
faqItems.forEach((item) => {
  const summary = item.querySelector("summary");
  summary.setAttribute("aria-expanded", String(item.open));
  item.dataset.expanded = String(item.open);
  item.querySelector(".faq-bubble-response").inert = !item.open;
  summary.addEventListener("click", (event) => {
    event.preventDefault();
    const expanded = item.dataset.expanded !== "true";
    if (expanded)
      faqItems.forEach((other) => {
        if (other !== item && other.dataset.expanded === "true") setFaqExpanded(other, false);
      });
    setFaqExpanded(item, expanded);
  });
});
faqMotion.addEventListener("change", () => {
  if (!faqMotion.matches) return;
  for (const [item, state] of faqTransitions) setFaqExpanded(item, state.expanded, true);
});

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
  const label = paused ? "Resume animations" : "Pause animations";
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
            if (entry.isIntersecting) syncLiquidMotion();
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

// Continuous color fields bend like water inside fixed spheres; no dots or audio state.
const liquidOrbs = new Map();
const reducedOrbMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let orbFrame = 0;
let orbLastFrame = 0;
function prepareLiquidOrb(orb) {
  if (liquidOrbs.has(orb) || orb.classList.contains("brand-orb")) return;
  const sky = orb.classList.contains("hero-sky");
  const canvas = document.createElement("canvas");
  canvas.className = sky ? "ice-liquid" : "orb-liquid";
  canvas.setAttribute("aria-hidden", "true");
  orb.append(canvas);
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
    depth: false,
    powerPreference: "low-power",
  });
  if (!gl) {
    canvas.remove();
    return;
  } // Scalable SVG and CSS are the fallback.
  const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
  const fragment = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time;
    uniform float green;
    uniform float sky;
    uniform sampler2D scene;
    void main(){
      if(sky>.5){
        vec2 p=gl_FragCoord.xy/resolution;
        p.y=1.-p.y;
        float t=time*.4;
        vec2 bend=vec2(sin(p.y*5.+t)+sin(p.x*3.-t*.7),cos(p.x*4.+t*.8));
        p=(p-.5)*.74+.5+bend*.055+vec2(sin(t*.55),cos(t*.45))*.015;
        float aspect=resolution.x/resolution.y;
        p=(p-.5)*vec2(min(1.,aspect/1.333333),min(1.,1.333333/aspect))+.5;
        vec3 color=texture2D(scene,p).rgb;
        float light=sin(p.x*4.+p.y*3.-t)*.012;
        gl_FragColor=vec4(clamp(color+light,0.,1.),1.);
        return;
      }
      vec2 uv=gl_FragCoord.xy/resolution*2.-1.;
      uv.y=-uv.y;
      float r=dot(uv,uv);
      float depth=sqrt(max(0.,1.-r));
      float t=time*.36;
      float x=uv.x+.38*sin(uv.y*3.2+t)+.12*cos(uv.x*4.-t*.6);
      float y=uv.y+.32*sin(uv.x*3.5-t*.8);
      float wave=.5+.5*sin(y*4.6+x*2.4-t*1.1);
      float fold=.5+.5*cos(x*3.8-y*2.2+t*.7);
      float pearl=pow(max(0.,sin(y*2.4+x*2.1+t*.5)),4.);
      vec4 w=vec4(.24+pearl*.8,wave*.8,(1.-wave)*fold*.8,(1.-fold)*.35);
      vec3 a=mix(vec3(229.,246.,255.),vec3(240.,248.,212.),green);
      vec3 b=mix(vec3(111.,178.,238.),vec3(162.,192.,105.),green);
      vec3 c=mix(vec3(148.,143.,221.),vec3(109.,151.,74.),green);
      vec3 d=mix(vec3(232.,192.,224.),vec3(211.,231.,166.),green);
      vec3 color=(a*w.x+b*w.y+c*w.z+d*w.w)/(w.x+w.y+w.z+w.w)/255.;
      float highlight=exp(-dot(uv+vec2(.4,.45),uv+vec2(.4,.45))*4.)*.24;
      color=mix(color*(.85+depth*.15),vec3(1.),highlight);
      gl_FragColor=vec4(color,1.);
    }`;
  function shader(type, source) {
    const value = gl.createShader(type);
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
      gl.deleteShader(value);
      return null;
    }
    return value;
  }
  const vs = shader(gl.VERTEX_SHADER, vertex),
    fs = shader(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) {
    canvas.remove();
    return;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    canvas.remove();
    return;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([232, 244, 249, 255]),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const state = {
    sky,
    texture,
    skyUniform: gl.getUniformLocation(program, "sky"),
    gl,
    canvas,
    program,
    buffer,
    time: 0,
    green: orb.classList.contains("orb-demo"),
    resolution: gl.getUniformLocation(program, "resolution"),
    clock: gl.getUniformLocation(program, "time"),
    palette: gl.getUniformLocation(program, "green"),
  };
  liquidOrbs.set(orb, state);
  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = sky
      ? Math.min(2560, Math.ceil(orb.clientWidth * ratio))
      : Math.min(2048, Math.max(512, Math.ceil(orb.clientWidth * ratio)));
    const height = sky ? Math.ceil((width * orb.clientHeight) / orb.clientWidth) : width;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    drawLiquidOrb(state);
  }
  if ("ResizeObserver" in window) {
    state.resize = new ResizeObserver(resize);
    state.resize.observe(orb);
  }
  window.addEventListener("resize", resize);
  state.release = () => {
    state.resize?.disconnect();
    window.removeEventListener("resize", resize);
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  };
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    canvas.style.visibility = "hidden";
  });
  canvas.addEventListener("webglcontextrestored", () => {
    state.release();
    liquidOrbs.delete(orb);
    canvas.remove();
    prepareLiquidOrb(orb);
    syncLiquidMotion();
  });
  resize();
  if (sky) {
    const image = new Image();
    image.onload = () => {
      if (!canvas.isConnected || gl.isContextLost()) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      drawLiquidOrb(state);
    };
    image.src = "./assets/ice-flow.svg";
  }
}
function drawLiquidOrb(state) {
  const { gl, canvas } = state;
  if (gl.isContextLost()) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(state.program);
  gl.uniform2f(state.resolution, canvas.width, canvas.height);
  gl.uniform1f(state.clock, state.time);
  gl.uniform1f(state.palette, state.green ? 1 : 0);
  gl.uniform1f(state.skyUniform, state.sky ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
function liquidMotionAllowed() {
  return (
    !reducedOrbMotion.matches &&
    !document.hidden &&
    !document.documentElement.classList.contains("motion-paused")
  );
}
function runLiquidFrame(timestamp) {
  orbFrame = 0;
  if (!liquidMotionAllowed()) {
    orbLastFrame = 0;
    return;
  }
  const elapsed = orbLastFrame ? Math.min((timestamp - orbLastFrame) / 1000, 0.05) : 0;
  orbLastFrame = timestamp;
  let visible = false;
  for (const [orb, state] of liquidOrbs) {
    if (!orb.isConnected) {
      state.release();
      liquidOrbs.delete(orb);
      continue;
    }
    if (!orb.classList.contains("orb-motion-visible")) continue;
    visible = true;
    state.time += elapsed;
    drawLiquidOrb(state);
  }
  if (visible) orbFrame = requestAnimationFrame(runLiquidFrame);
  else orbLastFrame = 0;
}
function syncLiquidMotion() {
  if (liquidMotionAllowed() && !orbFrame) orbFrame = requestAnimationFrame(runLiquidFrame);
}
document.querySelectorAll(".orb").forEach(prepareLiquidOrb);
const heroSky = document.querySelector(".hero-sky");
prepareLiquidOrb(heroSky);
registerAnimatedOrb(heroSky);
motionControl.addEventListener("click", syncLiquidMotion);
document.addEventListener("visibilitychange", syncLiquidMotion);
reducedOrbMotion.addEventListener("change", () => {
  if (reducedOrbMotion.matches) {
    for (const state of liquidOrbs.values()) {
      state.time = 0;
      drawLiquidOrb(state);
    }
  }
  syncLiquidMotion();
});
syncLiquidMotion();

// Short entrance choreography preserves readable content if enhancement is unavailable.
if ("IntersectionObserver" in window && !reducedOrbMotion.matches) {
  const reveals = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveals.unobserve(entry.target);
        if (reducedOrbMotion.matches || !entry.target.animate) continue;
        const animation = entry.target.animate(
          [
            { opacity: 0, transform: "translateY(20px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 800, easing: "cubic-bezier(.32,.72,0,1)" },
        );
        const stopForReducedMotion = () => {
          if (reducedOrbMotion.matches) animation.cancel();
        };
        reducedOrbMotion.addEventListener("change", stopForReducedMotion);
        animation.finished
          .catch(() => {})
          .finally(() => reducedOrbMotion.removeEventListener("change", stopForReducedMotion));
      }
    },
    { threshold: 0.12 },
  );
  document
    .querySelectorAll(
      ".library-game,.steps li,.voice-copy,.turn-story,.accessibility-visual,.accessibility-copy,.faq-bubbles-scene,.footer-invitation",
    )
    .forEach((element) => reveals.observe(element));
}

// Reference-style rolling labels retain a single accessible name.
document
  .querySelectorAll(
    ".button,.text-link,.preview-launch-link,.nav-links>a:not(.button),.footer-links>a",
  )
  .forEach((control) => {
    const label = control.textContent.trim().replace(/\s+/g, " ");
    if (!control.hasAttribute("aria-label")) control.setAttribute("aria-label", label);
    const clip = document.createElement("span");
    clip.className = "roll-clip";
    clip.setAttribute("aria-hidden", "true");
    const face = document.createElement("span");
    face.className = "roll-face";
    while (control.firstChild) face.append(control.firstChild);
    const ghost = face.cloneNode(true);
    ghost.className = "roll-face roll-ghost";
    clip.append(face, ghost);
    control.append(clip);
    control.classList.add("roll-control");
  });

// The reference reveals headline characters in reading order.
if ("IntersectionObserver" in window && !reducedOrbMotion.matches) {
  const headlines = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        headlines.unobserve(entry.target);
        if (reducedOrbMotion.matches) continue;
        entry.target.querySelectorAll(".motion-char").forEach((letter, index) => {
          const animation = letter.animate(
            [
              { opacity: 0, transform: "translateY(12px)", filter: "blur(6px)" },
              { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
            ],
            {
              duration: 800,
              delay: index * 16,
              easing: "cubic-bezier(.16,1,.3,1)",
              fill: "backwards",
            },
          );
          const stop = () => {
            if (reducedOrbMotion.matches) animation.cancel();
          };
          reducedOrbMotion.addEventListener("change", stop);
          animation.finished
            .catch(() => {})
            .finally(() => reducedOrbMotion.removeEventListener("change", stop));
        });
      }
    },
    { threshold: 0.2 },
  );
  document.querySelectorAll(".hero h1,.section-heading h2").forEach((heading) => {
    heading.setAttribute("aria-label", heading.innerText.replace(/\s+/g, " ").trim());
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((word) => {
        if (!word.trim()) {
          fragment.append(document.createTextNode(word));
          return;
        }
        const span = document.createElement("span");
        span.className = "motion-word";
        span.setAttribute("aria-hidden", "true");
        for (const character of word) {
          const letter = document.createElement("span");
          letter.className = "motion-char";
          letter.textContent = character;
          span.append(letter);
        }
        fragment.append(span);
      });
      node.replaceWith(fragment);
    });
    headlines.observe(heading);
  });
}
