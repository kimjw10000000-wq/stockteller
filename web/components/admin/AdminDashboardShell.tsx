"use client";

import { useCallback, useEffect, useState } from "react";
import type { DisclosureWithStock } from "@/lib/types";
import { disclosureToEditDraft, type AdminEditDraft } from "@/lib/admin-edit-draft";
import { AdminNewsManageList } from "@/components/admin/AdminNewsManageList";
import { AdminPublishForm } from "@/components/admin/AdminPublishForm";

export function AdminDashboardShell() {
  const [items, setItems] = useState<DisclosureWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editDraft, setEditDraft] = useState<AdminEditDraft | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);

  const loadList = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const sp = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await fetch(`/api/admin/disclosures${sp}`, { cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; items?: DisclosureWithStock[] };
      setItems(j.ok ? (j.items ?? []) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList(searchQuery);
  }, [loadList, searchQuery]);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
  }

  async function loadEditDraftById(articleId: string) {
    const targetId = articleId.trim();
    if (!targetId) return;

    setEditDraft(null);
    setEditingArticleId(null);
    setEditLoading(true);

    try {
      const res = await fetch(`/api/admin/publish/${encodeURIComponent(targetId)}?_=${Date.now()}`, {
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; item?: DisclosureWithStock; error?: string };

      if (!j.ok || !j.item) return;
      if (j.item.id !== targetId) {
        console.error("[admin/edit] id mismatch", { requested: targetId, received: j.item.id });
        return;
      }

      setEditDraft(disclosureToEditDraft(j.item));
      setEditingArticleId(targetId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("[admin/edit] fetch failed", err);
    } finally {
      setEditLoading(false);
    }
  }

  async function onEdit(item: DisclosureWithStock) {
    await loadEditDraftById(item.id);
  }

  function onCancelEdit() {
    setEditDraft(null);
    setEditingArticleId(null);
    setEditLoading(false);
  }

  function onSaved() {
    void loadList(searchQuery);
    setEditDraft(null);
    setEditingArticleId(null);
    setEditLoading(false);
  }

  function onDeleted(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (editDraft?.id === id) onCancelEdit();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <AdminPublishForm
        editDraft={editDraft}
        editLoading={editLoading}
        editingArticleId={editingArticleId}
        onCancelEdit={onCancelEdit}
        onSaved={onSaved}
      />
      <AdminNewsManageList
        items={items}
        loading={loading}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={onSearchSubmit}
        onEdit={onEdit}
        onSignalSaved={() => void loadList(searchQuery)}
        onDeleted={onDeleted}
        editingId={editingArticleId}
      />
    </div>
  );
}
