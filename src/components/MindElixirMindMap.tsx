import MindElixir, { type MindElixirData, type NodeObj } from "mind-elixir";
import { cn } from "mind-elixir/i18n";
import "mind-elixir/style.css";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type CanvasItem = {
  id: string;
  kind: "rectangle" | "circle" | "cloud" | "text" | "arrow";
  text: string;
  x: number;
  y: number;
  arrowStyle?: "solid" | "dashed" | "double";
};

type LegacyNode = {
  id: string;
  parentId?: string | null;
  text?: string;
  kind?: string;
  color?: string;
};

function readNodes(payload: unknown): LegacyNode[] {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (Array.isArray(parsed)) return parsed.filter((item): item is LegacyNode => Boolean(item && typeof item === "object" && (item as LegacyNode).id));
    const root = parsed && typeof parsed === "object" && "nodeData" in parsed ? (parsed as { nodeData?: unknown }).nodeData : parsed;
    const result: LegacyNode[] = [];
    const visit = (item: any, parentId: string | null = null) => { if (!item || typeof item !== "object" || typeof item.id !== "string") return; result.push({ id: item.id, parentId, text: item.topic, color: item.style?.background, kind: "node" }); (Array.isArray(item.children) ? item.children : []).forEach((child: unknown) => visit(child, item.id)); };
    visit(root);
    return result;
  } catch {
    return [];
  }
}

function toMindData(payload: unknown): MindElixirData {
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

function readCanvasItems(payload: unknown): CanvasItem[] {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    const items = parsed?.meta?.miniNotesCanvas;
    return Array.isArray(items) ? items.filter((item): item is CanvasItem => Boolean(item?.id && item?.kind)) : [];
  } catch {
    return [];
  }
}

export function MindElixirMindMap({ block, editor }: { block: any; editor: any }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mindRef = useRef<MindElixir | null>(null);
  const lastPayload = useRef(String(block.props.payload || ""));
  const [template, setTemplate] = useState<"default" | "project" | "study">("default");
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>(() => readCanvasItems(block.props.payload));
  const canvasItemsRef = useRef(canvasItems);

  const saveAll = (items = canvasItemsRef.current) => {
    const mind = mindRef.current;
    if (!mind || !editor.isEditable) return;
    const data = mind.getData() as MindElixirData & { meta?: Record<string, unknown> };
    data.meta = { ...(data.meta || {}), source: "mini-notes", miniNotesCanvas: items };
    const payload = JSON.stringify(data);
    lastPayload.current = payload;
    editor.updateBlock(block, { props: { payload } });
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mind = new MindElixir({
      el: host,
      direction: MindElixir.RIGHT,
      contextMenu: { locale: cn, focus: true, link: true },
      toolBar: true,
      keypress: true,
      // Use the primary pointer on empty canvas space for panning.  Mind
      // Elixir's default reserves left-drag for box selection, which makes a
      // blank canvas feel non-interactive in an embedded editor.
      mouseSelectionButton: 2,
      overflowHidden: false,
      allowUndo: true,
      newTopicName: "新主题"
    });
    mindRef.current = mind;
    void mind.init(toMindData(block.props.payload));
    let panPointerId: number | null = null;
    let panX = 0;
    let panY = 0;
    const startCanvasPan = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(".me-tpc, .me-epd, .mind-elixir-toolbar, .context-menu")) return;
      if (!target.closest(".map-container, .map-canvas")) return;
      event.preventDefault();
      event.stopPropagation();
      panPointerId = event.pointerId;
      panX = event.clientX;
      panY = event.clientY;
      host.classList.add("is-panning");
      host.setPointerCapture?.(event.pointerId);
    };
    const moveCanvasPan = (event: PointerEvent) => {
      if (panPointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const deltaX = event.clientX - panX;
      const deltaY = event.clientY - panY;
      panX = event.clientX;
      panY = event.clientY;
      mind.move(deltaX, deltaY);
    };
    const finishCanvasPan = (event: PointerEvent) => {
      if (panPointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      panPointerId = null;
      host.classList.remove("is-panning");
      if (host.hasPointerCapture?.(event.pointerId)) host.releasePointerCapture(event.pointerId);
    };
    host.addEventListener("pointerdown", startCanvasPan, true);
    host.addEventListener("pointermove", moveCanvasPan, true);
    host.addEventListener("pointerup", finishCanvasPan, true);
    host.addEventListener("pointercancel", finishCanvasPan, true);
    const onOperation = () => {
      if (!editor.isEditable) return;
      saveAll();
    };
    mind.bus.addListener("operation", onOperation);
    return () => {
      host.removeEventListener("pointerdown", startCanvasPan, true);
      host.removeEventListener("pointermove", moveCanvasPan, true);
      host.removeEventListener("pointerup", finishCanvasPan, true);
      host.removeEventListener("pointercancel", finishCanvasPan, true);
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
    const items = readCanvasItems(payload);
    canvasItemsRef.current = items;
    setCanvasItems(items);
  }, [block.props.payload]);

  useEffect(() => { canvasItemsRef.current = canvasItems; }, [canvasItems]);

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

  const addCanvasItem = (kind: CanvasItem["kind"], arrowStyle?: CanvasItem["arrowStyle"]) => {
    if (!editor.isEditable) return;
    const item: CanvasItem = {
      id: `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      text: kind === "text" ? "双击编辑文本" : kind === "arrow" ? "" : "",
      x: 250 + (canvasItems.length % 5) * 32,
      y: 120 + (canvasItems.length % 6) * 34,
      arrowStyle
    };
    const next = [...canvasItemsRef.current, item];
    canvasItemsRef.current = next;
    setCanvasItems(next);
    window.setTimeout(() => saveAll(next), 0);
  };

  const updateCanvasItem = (id: string, patch: Partial<CanvasItem>, persist = false) => {
    const next = canvasItemsRef.current.map((item) => item.id === id ? { ...item, ...patch } : item);
    canvasItemsRef.current = next;
    setCanvasItems(next);
    if (persist) saveAll(next);
  };

  const removeCanvasItem = (id: string) => {
    const next = canvasItemsRef.current.filter((item) => item.id !== id);
    canvasItemsRef.current = next;
    setCanvasItems(next);
    saveAll(next);
  };

  const beginCanvasDrag = (event: ReactPointerEvent<HTMLElement>, item: CanvasItem) => {
    if (!editor.isEditable) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => updateCanvasItem(item.id, {
      x: Math.max(8, item.x + moveEvent.clientX - startX),
      y: Math.max(56, item.y + moveEvent.clientY - startY)
    });
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      saveAll();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  return <section className="content-widget-block content-widget-mindmap mind-elixir-widget" contentEditable={false}>
    <div className="mind-elixir-header"><div><strong>思维导图</strong><span>Mind Elixir · 支持拖动、缩放、快捷键、右键菜单和全屏</span></div><label>模板 <select value={template} onChange={(event) => applyTemplate(event.target.value as typeof template)} disabled={!editor.isEditable}><option value="default">均衡放射</option><option value="project">项目规划</option><option value="study">学习笔记</option></select></label></div>
    <div className="mind-elixir-stage">
      {editor.isEditable ? <div className="mind-elixir-shape-toolbar" aria-label="自由绘图工具栏">
        <span>形状</span>
        <button onClick={() => addCanvasItem("rectangle")} type="button">矩形</button>
        <button onClick={() => addCanvasItem("circle")} type="button">圆形</button>
        <button onClick={() => addCanvasItem("cloud")} type="button">云朵</button>
        <button onClick={() => addCanvasItem("text")} type="button">文本</button>
        <i />
        <span>箭头</span>
        <button onClick={() => addCanvasItem("arrow", "solid")} type="button">实线 →</button>
        <button onClick={() => addCanvasItem("arrow", "dashed")} type="button">虚线 ⇢</button>
        <button onClick={() => addCanvasItem("arrow", "double")} type="button">双向 ↔</button>
      </div> : null}
      <div ref={hostRef} className="mind-elixir-host" />
      <div className="mind-elixir-free-layer">
        {canvasItems.map((item) => item.kind === "arrow" ? <div
          className={`mind-elixir-free-arrow is-${item.arrowStyle || "solid"}`}
          key={item.id}
          onDoubleClick={() => removeCanvasItem(item.id)}
          onPointerDown={(event) => beginCanvasDrag(event, item)}
          style={{ left: item.x, top: item.y }}
          title="拖动箭头；双击删除"
        ><span /></div> : <div
          className={`mind-elixir-free-shape is-${item.kind}`}
          key={item.id}
          onDoubleClick={() => item.kind !== "text" && removeCanvasItem(item.id)}
          onPointerDown={(event) => beginCanvasDrag(event, item)}
          style={{ left: item.x, top: item.y }}
          title={item.kind === "text" ? "点击编辑；拖动空白处移动" : "拖动形状；双击删除"}
        >{item.kind === "text" ? <input
          onChange={(event) => updateCanvasItem(item.id, { text: event.target.value })}
          onBlur={() => saveAll()}
          onPointerDown={(event) => event.stopPropagation()}
          value={item.text}
        /> : null}</div>)}
      </div>
    </div>
  </section>;
}
