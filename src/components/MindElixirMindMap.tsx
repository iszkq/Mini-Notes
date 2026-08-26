import MindElixir, { type MindElixirData, type NodeObj } from "mind-elixir";
import { cn } from "mind-elixir/i18n";
import "mind-elixir/style.css";
import { useEffect, useRef, useState } from "react";

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

export function MindElixirMindMap({ block, editor }: { block: any; editor: any }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mindRef = useRef<MindElixir | null>(null);
  const lastPayload = useRef(String(block.props.payload || ""));
  const [template, setTemplate] = useState<"default" | "project" | "study">("default");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mind = new MindElixir({
      el: host,
      direction: MindElixir.RIGHT,
      contextMenu: { locale: cn, focus: true, link: true },
      toolBar: true,
      keypress: true,
      overflowHidden: false,
      allowUndo: true,
      newTopicName: "新主题"
    });
    mindRef.current = mind;
    void mind.init(toMindData(block.props.payload));
    const onOperation = () => {
      if (!editor.isEditable) return;
      const payload = JSON.stringify(mind.getData());
      lastPayload.current = payload;
      editor.updateBlock(block, { props: { payload } });
    };
    mind.bus.addListener("operation", onOperation);
    return () => { mind.bus.removeListener("operation", onOperation); mind.destroy(); mindRef.current = null; };
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

  return <section className="content-widget-block content-widget-mindmap mind-elixir-widget" contentEditable={false}>
    <div className="mind-elixir-header"><div><strong>思维导图</strong><span>Mind Elixir · 支持拖动、缩放、快捷键、右键菜单和全屏</span></div><label>模板 <select value={template} onChange={(event) => applyTemplate(event.target.value as typeof template)} disabled={!editor.isEditable}><option value="default">均衡放射</option><option value="project">项目规划</option><option value="study">学习笔记</option></select></label></div>
    <div ref={hostRef} className="mind-elixir-host" />
  </section>;
}
