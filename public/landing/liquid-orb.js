// Adapted from the user's Liquid Orb export. The shader and thinking preset
// retain the supplied liquid/refraction model; the landing page owns lifecycle.
export async function enhanceLiquidOrbs(onReady, root = document) {
  if (!navigator.gpu) return; // Keep the existing WebGL/SVG fallback.
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return;
  const device = await adapter.requestDevice();
  const [shaderResponse, presetResponse] = await Promise.all([
    fetch("/landing/assets/liquid-glass.wgsl"),
    fetch("/landing/assets/liquid-glass-preset.json"),
  ]);
  if (!shaderResponse.ok || !presetResponse.ok) {
    device.destroy();
    return;
  }
  const shader = device.createShaderModule({ code: await shaderResponse.text() });
  const compilation = await shader.getCompilationInfo();
  if (compilation.messages.some((message) => message.type === "error")) {
    device.destroy();
    return;
  }
  const preset = await presetResponse.json();
  const format = navigator.gpu.getPreferredCanvasFormat();
  const pipeline = await device.createRenderPipelineAsync({
    layout: "auto",
    vertex: { module: shader, entryPoint: "vs_main" },
    fragment: { module: shader, entryPoint: "fs_main", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const instances = new Map();
  let frameId = 0;
  let previousTime = null;
  let disposed = false;
  const moving = () =>
    !document.hidden &&
    !reducedMotion.matches &&
    !document.documentElement.classList.contains("motion-paused");

  function draw(instance) {
    const { canvas, host, values, buffer, context, bindGroup } = instance;
    const side = Math.min(
      2048,
      Math.max(512, Math.ceil(host.clientWidth * Math.min(devicePixelRatio || 1, 2))),
    );
    if (canvas.width !== side || canvas.height !== side) {
      canvas.width = side;
      canvas.height = side;
    }
    values[0] = side;
    values[1] = side;
    values[2] = instance.time;
    device.queue.writeBuffer(buffer, 0, values);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function tick(now) {
    frameId = 0;
    const delta = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    try {
      for (const instance of instances.values()) {
        if (!instance.visible) continue;
        instance.time += delta;
        draw(instance);
      }
    } catch {
      dispose();
      return;
    }
    sync();
  }
  function sync() {
    if (disposed) return;
    if (moving() && [...instances.values()].some((instance) => instance.visible)) {
      if (!frameId) frameId = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frameId);
      frameId = 0;
      previousTime = null;
    }
  }
  const visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const instance = instances.get(entry.target);
        if (instance) instance.visible = entry.isIntersecting;
      }
      sync();
    },
    { rootMargin: "32px" },
  );
  const resize = new ResizeObserver((entries) => {
    if (disposed) return;
    try {
      for (const entry of entries) {
        const instance = instances.get(entry.target);
        if (instance) draw(instance);
      }
    } catch {
      dispose();
    }
  });
  const pause = new MutationObserver(sync);
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    visibility.disconnect();
    resize.disconnect();
    pause.disconnect();
    document.removeEventListener("visibilitychange", sync);
    reducedMotion.removeEventListener("change", sync);
    window.removeEventListener("pagehide", dispose);
    for (const instance of instances.values()) {
      instance.host.classList.remove("liquid-glass-ready");
      instance.canvas.remove();
      instance.buffer.destroy();
      instance.context.unconfigure();
    }
    device.destroy();
  }
  void device.lost.then(dispose);
  device.addEventListener("uncapturederror", dispose);
  try {
    const hosts = root.matches?.(".orb") ? [root] : root.querySelectorAll(".orb");
    for (const host of hosts) {
      const canvas = document.createElement("canvas");
      canvas.className = "orb-glass";
      canvas.setAttribute("aria-hidden", "true");
      host.append(canvas);
      const context = canvas.getContext("webgpu");
      if (!context) {
        canvas.remove();
        continue;
      }
      context.configure({ device, format, alphaMode: "premultiplied" });
      const values = new Float32Array(preset);
      values[4] = 0.96; // Fill the existing orb slot, rather than a fullscreen export.
      values.set([0.91, 0.96, 0.98, 0], 80); // Light-page refraction backdrop.
      if (host.classList.contains("orb-demo")) {
        // Chess keeps its own game palette while sharing the liquid geometry.
        values.set(
          [0.96, 0.98, 0.89, 1, 0.82, 0.9, 0.65, 1, 0.63, 0.76, 0.43, 1, 0.38, 0.55, 0.27, 1],
          40,
        );
      } else if (host.classList.contains("orb-amber")) {
        // Loups-Garous uses the same liquid geometry with its warm village palette.
        values.set(
          [1, 0.95, 0.76, 1, 0.99, 0.79, 0.42, 1, 0.95, 0.58, 0.2, 1, 0.82, 0.38, 0.09, 1],
          40,
        );
      }
      const buffer = device.createBuffer({
        size: values.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer } }],
      });
      const instance = {
        host,
        canvas,
        context,
        values,
        buffer,
        bindGroup,
        time: 0,
        visible: false,
      };
      instances.set(host, instance);
      draw(instance);
      // Reveal only after the GPU has finished its first frame.
      await device.queue.onSubmittedWorkDone();
      if (disposed) return;
      onReady(host);
      host.classList.add("liquid-glass-ready");
      visibility.observe(host);
      resize.observe(host);
    }
    pause.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", sync);
    reducedMotion.addEventListener("change", sync);
    window.addEventListener("pagehide", dispose);
    sync();
    return dispose;
  } catch {
    dispose();
  }
}
