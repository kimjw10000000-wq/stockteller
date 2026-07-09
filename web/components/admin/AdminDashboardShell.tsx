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

  async function onEdit(item: DisclosureWithStock) {
    try {
      const res = await fetch(`/api/admin/publish/${item.id}`, { cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; item?: DisclosureWithStock };
      if (j.ok && j.item) {
        setEditDraft(disclosureToEditDraft(j.item));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      /* ignore */
    }
  }

  function onCancelEdit() {
    setEditDraft(null);
  }

  function onSaved() {
    void loadList(searchQuery);
    if (editDraft) setEditDraft(null);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <AdminPublishForm editDraft={editDraft} onCancelEdit={onCancelEdit} onSaved={onSaved} />
      <AdminNewsManageList
        items={items}
        loading={loading}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={onSearchSubmit}
        onEdit={onEdit}
        editingId={editDraft?.id ?? null}
      />
    </div>
  );
}
