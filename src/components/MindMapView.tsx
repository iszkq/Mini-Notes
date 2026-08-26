import { Minus, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Note, NoteBlock } from "../shared";

type MindNode = {
  id: string;
  text: string;
  level: number;
  children: MindNode[];
};

function inlineText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => inlineText(item)).join("");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content !== "undefined") return inlineText(record.content);
  }
  return "";
}

function blockText(block: NoteBlock): string {
  return inlineText(block.content).trim() || inlineText(block.props).trim();
}

function buildTree(note: Note): MindNode {
  const root: MindNode = { id: "root", text: note.title || "未命名页面", level: 0, children: [] };
  const stack: MindNode[] = [root];
  let index = 0;
  const visit = (blocks: NoteBlock[]) => {
    blocks.forEach((block) => {
      const text = blockText(block);
      const type = String(block.type ?? "paragraph");
      if (text) {
        const match = type.match(/heading/i);
        const level = match ? Math.max(1, Number((block.props as any)?.level ?? 1)) : 99;
        if (level < 99) {
          while (stack.length > 1 && (stack[stack.length - 1]?.level ?? 0) >= level) stack.pop();
          const node: MindNode = { id: `node-${index++}`, text, level, children: [] };
          stack[stack.length - 1].children.push(node);
          stack.push(node);
        } else {
          stack[stack.length - 1].children.push({ id: `node-${index++}`, text, level: stack[stack.length - 1].level + 1, children: [] });
        }
      }
      if (Array.isArray(block.children)) visit(block.children as NoteBlock[]);
    });
  };
  visit(note.content ?? []);
  return root;
}

function MindNodeView({ node, collapsed, toggle }: { node: MindNode; collapsed: Set<string>; toggle: (id: string) => void }) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  return (
    <li className={`mindmap-node level-${Math.min(node.level, 4)}`}>
      <div className="mindmap-node-card">
        {hasChildren ? <button className="mindmap-toggle" onClick={() => toggle(node.id)} aria-label={isCollapsed ? "展开" : "折叠"}>{isCollapsed ? <Plus size={14} /> : <Minus size={14} />}</button> : <span className="mindmap-toggle-placeholder" />}
        <span>{node.text}</span>
      </div>
      {hasChildren && !isCollapsed ? <ul>{node.children.map((child) => <MindNodeView key={child.id} node={child} collapsed={collapsed} toggle={toggle} />)}</ul> : null}
    </li>
  );
}

export function MindMapView({ note }: { note: Note }) {
  const tree = useMemo(() => buildTree(note), [note]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const toggle = (id: string) => setCollapsed((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  return (
    <section className="mindmap-view">
      <div className="mindmap-toolbar">
        <span className="mindmap-hint">按标题层级自动生成思维导图，可点击节点折叠/展开</span>
        <div className="mindmap-zoom">
          <button className="icon-button" onClick={() => setZoom((v) => Math.max(0.6, +(v - 0.1).toFixed(1)))} aria-label="缩小"><Minus size={16} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="icon-button" onClick={() => setZoom((v) => Math.min(1.8, +(v + 0.1).toFixed(1)))} aria-label="放大"><Plus size={16} /></button>
          <button className="icon-button" onClick={() => { setZoom(1); setCollapsed(new Set()); }} aria-label="重置"><RotateCcw size={15} /></button>
        </div>
      </div>
      <div className="mindmap-canvas" style={{ "--mindmap-zoom": zoom } as CSSProperties}>
        <ul className="mindmap-tree"><MindNodeView node={tree} collapsed={collapsed} toggle={toggle} /></ul>
      </div>
    </section>
  );
}
