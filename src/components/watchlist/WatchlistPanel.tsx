"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWatchlists } from "../../lib/watchlists/WatchlistsContext";
import { FAVORITES_ID } from "../../lib/watchlists/model";
import { useSpotFeedContext } from "../../lib/context/SpotFeedContext";
import { MARKETS } from "../../lib/pricing";
import { MiniQuote, type Quote } from "./MiniQuote";

const smallBtn: React.CSSProperties = {
  background: "none", border: "1px solid var(--border-default)", color: "var(--text-mid)",
  fontSize: 10, padding: "2px 6px", cursor: "pointer",
};

function useQuotes(): (sym: string) => Quote {
  const { data, session } = useSpotFeedContext();
  return (sym: string) => {
    const spot = data?.prices[sym] ?? null;
    const open = session.open[sym]?.price;
    return {
      spot,
      change: spot !== null && open ? spot / open - 1 : null,
      atmIv: data?.vols[sym] ?? null,
      ticks: session.ticks[sym] ?? [],
    };
  };
}

interface RowProps {
  sym: string;
  index: number;
  count: number;
  quote: Quote;
  editable: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  onNavigate?: () => void;
}

function Row({ sym, index, count, quote, editable, onMove, onRemove, onNavigate }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sym, disabled: !editable });
  // Keyboard alternative to dragging: Alt+↑/↓ anywhere on the row.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editable || !e.altKey) return;
    if (e.key === "ArrowUp" && index > 0) { e.preventDefault(); onMove(index, index - 1); }
    if (e.key === "ArrowDown" && index < count - 1) { e.preventDefault(); onMove(index, index + 1); }
  };
  return (
    <li ref={setNodeRef} data-testid="watchlist-row" data-symbol={sym} onKeyDown={onKeyDown}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
        borderBottom: "1px solid var(--border-subtle)", listStyle: "none",
        background: isDragging ? "var(--bg-overlay)" : "transparent",
        transform: CSS.Transform.toString(transform), transition,
      }}>
      {editable && (
        <button {...attributes} {...listeners} aria-label={`Drag to reorder ${sym}`} style={{ ...smallBtn, border: "none", cursor: "grab", padding: "2px 2px" }}>⠿</button>
      )}
      <Link href={`/options?u=${sym}`} onClick={onNavigate} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-hi)", textDecoration: "none", minWidth: 40 }}>
        {sym}
      </Link>
      <MiniQuote quote={quote} />
      {editable && (
        <span style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
          <button onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label={`Move ${sym} up`} style={{ ...smallBtn, opacity: index === 0 ? 0.3 : 1 }}>▲</button>
          <button onClick={() => onMove(index, index + 1)} disabled={index === count - 1} aria-label={`Move ${sym} down`} style={{ ...smallBtn, opacity: index === count - 1 ? 0.3 : 1 }}>▼</button>
          <button onClick={onRemove} aria-label={`Remove ${sym}`} style={{ ...smallBtn, border: "none", fontSize: 13 }}>×</button>
        </span>
      )}
    </li>
  );
}

export function WatchlistPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { mode, lists, canEditFavorites, error, clearError, createList, renameList, deleteList, addSymbol, removeSymbol, moveSymbol } = useWatchlists();
  const { data } = useSpotFeedContext();
  const quoteOf = useQuotes();
  const [activeId, setActiveId] = useState(FAVORITES_ID);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const active = lists.find(l => l.id === activeId) ?? lists[0];
  const isFavorites = active.id === FAVORITES_ID;
  const editable = !isFavorites || canEditFavorites;

  const universe = useMemo(
    () => Array.from(new Set([...MARKETS.map(m => m.sym), ...Object.keys(data?.prices ?? {})])).sort(),
    [data],
  );
  const addable = universe.filter(s => !active.symbols.includes(s));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    if (!over || a.id === over.id) return;
    void moveSymbol(active.id, active.symbols.indexOf(String(a.id)), active.symbols.indexOf(String(over.id)));
  };

  return (
    <div style={{ width: 460 }}>
      <div role="tablist" aria-label="Watchlists" style={{ display: "flex", gap: 2, padding: "8px 10px", borderBottom: "1px solid var(--border-default)", flexWrap: "wrap", alignItems: "center" }}>
        {lists.map(l => (
          <button key={l.id} role="tab" aria-selected={l.id === active.id} onClick={() => { setActiveId(l.id); setRenaming(null); }} style={{
            padding: "3px 8px", border: "none", cursor: "pointer", fontSize: 11,
            background: l.id === active.id ? "var(--atm-dim)" : "transparent",
            color: l.id === active.id ? "var(--atm)" : "var(--text-mid)",
          }}>{l.name} <span style={{ color: "var(--text-lo)" }}>{l.symbols.length}</span></button>
        ))}
        <form onSubmit={async e => { e.preventDefault(); const l = await createList(newName); if (l) { setActiveId(l.id); setNewName(""); } }}
          style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New list" aria-label="New list name" maxLength={40}
            style={{ width: 90, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-hi)", fontSize: 11, padding: "2px 6px" }} />
          <button type="submit" disabled={!newName.trim()} style={{ ...smallBtn, opacity: newName.trim() ? 1 : 0.4 }}>+ Add</button>
        </form>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
        {renaming === active.id ? (
          <form onSubmit={e => { e.preventDefault(); void renameList(active.id, (e.currentTarget.elements.namedItem("name") as HTMLInputElement).value); setRenaming(null); }}
            style={{ display: "flex", gap: 4 }}>
            <input name="name" defaultValue={active.name} autoFocus aria-label="List name" maxLength={40}
              style={{ width: 140, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-hi)", fontSize: 11, padding: "2px 6px" }} />
            <button type="submit" style={smallBtn}>Save</button>
            <button type="button" onClick={() => setRenaming(null)} style={smallBtn}>Cancel</button>
          </form>
        ) : !isFavorites && (
          <>
            <button onClick={() => setRenaming(active.id)} style={smallBtn}>Rename</button>
            <button onClick={() => { if (window.confirm(`Delete the list "${active.name}"?`)) { void deleteList(active.id); setActiveId(FAVORITES_ID); } }} style={smallBtn}>Delete</button>
          </>
        )}
        {editable && addable.length > 0 && (
          <select value="" onChange={e => e.target.value && void addSymbol(active.id, e.target.value)} aria-label={`Add a symbol to ${active.name}`}
            style={{ marginLeft: "auto", background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-hi)", fontSize: 11, padding: "2px" }}>
            <option value="">+ Add symbol…</option>
            {addable.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div role="alert" style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 10px", fontSize: 11, color: "var(--put)", background: "var(--put-dim)" }}>
          {error}
          <button onClick={clearError} aria-label="Dismiss error" style={{ background: "none", border: "none", color: "var(--put)", cursor: "pointer" }}>×</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, padding: "4px 10px", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-lo)" }}>
        <span style={{ minWidth: editable ? 64 : 40 }}>Symbol</span>
        <span style={{ minWidth: 84, textAlign: "right" }}>Spot</span>
        <span style={{ minWidth: 56, textAlign: "right" }} title="Change since this session's first price">Δ Session</span>
        <span style={{ minWidth: 40, textAlign: "right" }}>ATM IV</span>
      </div>

      {active.symbols.length === 0 ? (
        <div style={{ padding: "18px 10px", fontSize: 12, color: "var(--text-lo)", textAlign: "center" }}>
          {isFavorites
            ? canEditFavorites ? "No favorites yet. Star a market or add a symbol above." : "Connect your wallet to see your favorites."
            : "This list is empty. Add a symbol above."}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={active.symbols} strategy={verticalListSortingStrategy}>
            <ul aria-label={`${active.name} symbols`} style={{ margin: 0, padding: 0 }}>
              {active.symbols.map((sym, i) => (
                <Row key={sym} sym={sym} index={i} count={active.symbols.length} quote={quoteOf(sym)} editable={editable}
                  onMove={(from, to) => void moveSymbol(active.id, from, to)} onRemove={() => void removeSymbol(active.id, sym)}
                  onNavigate={onNavigate} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div style={{ padding: "6px 10px", fontSize: 10, color: "var(--text-lo)", lineHeight: 1.5 }}>
        {mode === "local" ? "Lists are saved in this browser; they'll move to your account once the server supports them. " : ""}
        Drag ⠿ or press Alt+↑/↓ on a row to reorder. Δ is the change since this session started, not 24h.
      </div>
    </div>
  );
}
