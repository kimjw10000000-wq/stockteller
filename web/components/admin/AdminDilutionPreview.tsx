"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DilutionClassification } from "@/lib/together/dilution";
import { cn } from "@/lib/utils";

type ApiOk = { ok: true; model: string; result: DilutionClassification };
type ApiErr = { ok: false; error: string };

export function AdminDilutionPreview() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [result, setResult] = useState<DilutionClassification | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/dilution-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const data = (await res.json()) as ApiOk | ApiErr;
      if (!data.ok) {
        setError(data.error || "요약에 실패했습니다.");
        return;
      }
      setModel(data.model);
      setResult(data.result);
    } catch {
      setError("네트워크 오류가 났습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
            <div>
              <label htmlFor="dilution-title" className="mb-1.5 block text-sm font-medium text-foreground">
                제목 (선택)
              </label>
              <Input
                id="dilution-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Press release headline"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="dilution-body" className="mb-1.5 block text-sm font-medium text-foreground">
                원문
              </label>
              <textarea
                id="dilution-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={18}
                placeholder="Paste the full English press release or 8-K text here."
                className={cn(
                  "flex min-h-[20rem] w-full rounded-md border border-border bg-input-background px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm",
                  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                )}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={loading || !body.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    요약 중
                  </>
                ) : (
                  "영어 요약"
                )}
              </Button>
              <p className="text-xs text-muted-foreground">결과는 영어로만 나옵니다.</p>
            </div>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex min-h-[20rem] flex-col gap-4">
          <p className="text-sm font-medium text-foreground">결과</p>
          {!result && !loading ? (
            <p className="text-sm text-muted-foreground">원문을 넣고 요약하면 여기에 표시됩니다.</p>
          ) : null}
          {loading ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              분류하는 중…
            </p>
          ) : null}
          {result ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={result.dilution ? "default" : "secondary"}>
                  {result.dilution ? "Dilution" : "Not dilution"}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  {result.type}
                </Badge>
                {model ? (
                  <span className="text-xs text-muted-foreground">{model}</span>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
                {result.summary}
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
