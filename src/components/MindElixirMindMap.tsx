import MindElixir, { type MindElixirData, type NodeObj } from "mind-elixir";
import { cn } from "mind-elixir/i18n";
import "mind-elixir/style.css";
import { useEffect, useRef, useState } from "react";

type LegacyNode = { id: string; parentId?: string | null; text?: string; kind?: string; color?: string };

function readNodes(payload: unknown): LegacyNode[] {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (Array.isArray(parsed)) return parsed.filter((item): item is LegacyNode => Boolean(item && typeof item === "object" && (item as LegacyNode).id));
    const root = parsed && typeof parsed === "object" && "nodeData" in parsed ? (parsed as { nodeData?: unknown }).nodeData : parsed;
    const result: LegacyNode[] = [];
    const visit = (item: any, parentId: string | null = null) => {
      if (!item || typeof item !== "object" || typeof item.id !== "string") return;
      result.push({ id: item.id, parentId, text: item.topic, color: item.style?.background, kind: "node" });
      (Array.isArray(item.children) ? item.children : []).forEach((child: unknown) => visit(child, item.id));
    };
    visit(root);
    return result;
  } catch { return []; }
}

function toMindData(payload: unknown): MindElixirData {
  // Keep native Mind Elixir payloads intact. This preserves node styles,
  // positions, summaries, arrows and metadata when a document is reopened.
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "nodeData" in parsed) {
      const native = parsed as Partial<MindElixirData>;
      if (native.nodeData && typeof native.nodeData === "object") {
        return {
          ...native,
          direction: native.direction ?? MindElixir.RIGHT
        } as MindElixirData;
      }
    }
  } catch {
    // Fall through to the legacy block-array converter below.
  }
  const source = readNodes(payload).filter((item) => !item.kind || item.kind === "node");
  const root = source.find((item) => !item.parentId) ?? source[0] ?? { id: "mind-root", text: "中心主题" };
  const build = (item: LegacyNode): NodeObj => ({
    id: item.id,
    topic: item.text || "新主题",
    style: item.color ? { background: item.color } : undefined,
    children: source.filter((child) => child.parentId === item.id).map(build),
    expanded: true
  });
  return { nodeData: build(root), direction: MindElixir.RIGHT, meta: { source: "mini-notes" } };
}

export function MindElixirMindMap({ block, editor }: { block: any; editor: any }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mindRef = useRef<MindElixir | null>(null);
  const panGestureRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const lastPayload = useRef(String(block.props.payload || ""));
  const [template, setTemplate] = useState<"default" | "project" | "study">("default");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mind = new MindElixir({
      el: host,
      direction: MindElixir.RIGHT,
      editable: editor.isEditable,
      // The public/preview view must remain a true viewer: Mind Elixir's
      // focus context menu otherwise leaves its modal state and hand cursor
      // active after clicking outside the map.
      contextMenu: editor.isEditable ? { locale: cn, focus: true, link: true } : false,
      // Keep the native view controls (fullscreen, locate, zoom) available
      // in public previews while context-menu editing stays disabled.
      toolBar: true,
      keypress: editor.isEditable,
      // Left-drag on empty canvas pans; node dragging and node editing remain
      // handled by Mind Elixir itself.
      mouseSelectionButton: 2,
      overflowHidden: false,
      allowUndo: true,
      newTopicName: "新主题"
    });
    mindRef.current = mind;
    void mind.init(toMindData(block.props.payload));

    // Keep native drags inside the embedded canvas. Without this boundary,
    // BlockNote can interpret a node/canvas gesture as dragging the whole
    // custom block and create another mind-map block at the drop position.
    const containNativeDrag = (event: DragEvent) => event.stopPropagation();
    const containPointerGesture = (event: PointerEvent) => event.stopPropagation();
    const startCanvasPan = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType !== "touch") return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(".me-tpc, .me-epd, .mind-elixir-toolbar")) return;
      // Mind Elixir renders its context menu as a full-viewport overlay. Do
      // not start a canvas pan from that overlay; close it when the user taps
      // outside the compact menu itself so focus mode cannot get stuck.
      const contextMenu = host.querySelector<HTMLElement>(".context-menu");
      if (contextMenu && !contextMenu.hidden) {
        if (!target.closest(".context-menu .menu-list")) contextMenu.hidden = true;
        return;
      }
      panGestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      host.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };
    const moveCanvasPan = (event: PointerEvent) => {
      const pan = panGestureRef.current;
      if (!pan || pan.pointerId !== event.pointerId || !mindRef.current) return;
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      pan.x = event.clientX;
      pan.y = event.clientY;
      if (dx || dy) mindRef.current.move(dx, dy);
      event.preventDefault();
      event.stopPropagation();
    };
    const endCanvasPan = (event: PointerEvent) => {
      if (!panGestureRef.current || panGestureRef.current.pointerId !== event.pointerId) return;
      panGestureRef.current = null;
      if (host.hasPointerCapture?.(event.pointerId)) host.releasePointerCapture(event.pointerId);
      event.stopPropagation();
    };
    const closeContextMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const contextMenu = host.querySelector<HTMLElement>(".context-menu");
      if (contextMenu && !contextMenu.hidden) {
        contextMenu.hidden = true;
        event.stopPropagation();
      }
    };
    host.addEventListener("dragstart", containNativeDrag);
    host.addEventListener("dragover", containNativeDrag);
    host.addEventListener("drop", containNativeDrag);
    host.addEventListener("dragend", containNativeDrag);
    host.addEventListener("pointerdown", containPointerGesture);
    host.addEventListener("pointermove", containPointerGesture);
    host.addEventListener("pointerup", containPointerGesture);
    host.addEventListener("pointercancel", containPointerGesture);
    host.addEventListener("pointerdown", startCanvasPan, true);
    host.addEventListener("pointermove", moveCanvasPan, true);
    host.addEventListener("pointerup", endCanvasPan, true);
    host.addEventListener("pointercancel", endCanvasPan, true);
    host.addEventListener("keydown", closeContextMenuOnEscape, true);

    let wasFullscreen = document.fullscreenElement === host;
    let centerTimer: number | null = null;
    const fitAfterLayout = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (!mindRef.current || !host.isConnected) return;
          mindRef.current.scaleFit();
          mindRef.current.toCenter();
        });
      });
    };
    const handleFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement === host;
      if (wasFullscreen && !isFullscreen) {
        fitAfterLayout();
        centerTimer = window.setTimeout(fitAfterLayout, 120);
      }
      wasFullscreen = isFullscreen;
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    const onOperation = () => {
      if (!editor.isEditable) return;
      const payload = JSON.stringify(mind.getData());
      lastPayload.current = payload;
      editor.updateBlock(block, { props: { payload } });
    };
    mind.bus.addListener("operation", onOperation);
    return () => {
      if (centerTimer !== null) window.clearTimeout(centerTimer);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      host.removeEventListener("dragstart", containNativeDrag);
      host.removeEventListener("dragover", containNativeDrag);
      host.removeEventListener("drop", containNativeDrag);
      host.removeEventListener("dragend", containNativeDrag);
      host.removeEventListener("pointerdown", containPointerGesture);
      host.removeEventListener("pointermove", containPointerGesture);
      host.removeEventListener("pointerup", containPointerGesture);
      host.removeEventListener("pointercancel", containPointerGesture);
      host.removeEventListener("pointerdown", startCanvasPan, true);
      host.removeEventListener("pointermove", moveCanvasPan, true);
      host.removeEventListener("pointerup", endCanvasPan, true);
      host.removeEventListener("pointercancel", endCanvasPan, true);
      host.removeEventListener("keydown", closeContextMenuOnEscape, true);
      mind.bus.removeListener("operation", onOperation);
      mind.destroy();
      mindRef.current = null;
    };
  }, [block.id, editor]);

  useEffect(() => {
    const payload = String(block.props.payload || "");
    if (!mindRef.current || !payload || payload === lastPayload.current) return;
    void mindRef.current.refresh(toMindData(payload));
    mindRef.current.clearHistory?.();
    lastPayload.current = payload;
  }, [block.props.payload]);

  const applyTemplate = (value: "default" | "project" | "study") => {
    setTemplate(value);
    const mind = mindRef.current;
    if (!mind) return;
    const labels = value === "project" ? ["目标", "需求", "计划", "风险"] : value === "study" ? ["概念", "定义", "例题", "总结"] : ["分支一", "分支二", "分支三"];
    const root = MindElixir.new(value === "project" ? "项目规划" : value === "study" ? "学习主题" : "中心主题");
    root.nodeData.children = labels.map((topic, index) => ({ id: `template-${Date.now()}-${index}`, topic, direction: index % 2 ? MindElixir.LEFT : MindElixir.RIGHT }));
    void mind.refresh(root);
    mind.clearHistory?.();
    if (editor.isEditable) { const payload = JSON.stringify(root); lastPayload.current = payload; editor.updateBlock(block, { props: { payload } }); }
  };

  const styleSelected = (patch: Record<string, string>) => {
    const mind = mindRef.current;
    if (!mind || !editor.isEditable) return;
    const nodes = mind.currentNodes?.length ? mind.currentNodes : (mind.currentNode ? [mind.currentNode] : []);
    nodes.forEach((node: any) => {
      void mind.reshapeNode(node, { style: { ...(node.nodeObj?.style || {}), ...patch } });
    });
  };

  return <section className="content-widget-block content-widget-mindmap mind-elixir-widget" contentEditable={false}>
    <div className="mind-elixir-header">
      <div><strong>思维导图</strong><span>Mind Elixir · 拖动节点/画布，滚轮缩放，右键编辑</span></div>
      <div className="mind-elixir-controls">
        <span className="mind-elixir-style-label">节点样式</span>
        {["#e8f3ff", "#fff4d6", "#e8f8ef", "#f7eaff", "#ffe9e9"].map((color) => <button key={color} type="button" className="mind-elixir-color" style={{ background: color }} aria-label={`设置节点背景色 ${color}`} onClick={() => styleSelected({ background: color })} disabled={!editor.isEditable} />)}
        <select aria-label="节点文字大小" defaultValue="16" onChange={(event) => styleSelected({ fontSize: `${event.target.value}px` })} disabled={!editor.isEditable}><option value="14">小字</option><option value="16">正文</option><option value="20">大字</option><option value="26">标题</option></select>
        <label>模板 <select value={template} onChange={(event) => applyTemplate(event.target.value as typeof template)} disabled={!editor.isEditable}><option value="default">均衡放射</option><option value="project">项目规划</option><option value="study">学习笔记</option></select></label>
      </div>
    </div>
    <div ref={hostRef} className="mind-elixir-host" />
  </section>;
}
