import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getOrderedSources, type MangaSourceEntry } from "@/lib/sourceResolver";

type SourceCheckResult = {
  url: string;
  host: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
  latencyMs?: number;
};

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout ao acessar fonte.")), ms)
    ),
  ]);
}

async function checkUrl(url: string): Promise<SourceCheckResult> {
  const startedAt = Date.now();

  try {
    const origin = new URL(url).origin;

    const res = await withTimeout(
      fetch(url, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          Referer: origin,
          Origin: origin,
        },
        cache: "no-store",
      }),
      12000
    );

    return {
      url,
      host: safeHostname(url),
      ok: res.ok,
      statusCode: res.status,
      error: res.ok ? "" : `HTTP ${res.status}`,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error: unknown) {
    return {
      url,
      host: safeHostname(url),
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao acessar URL.",
      latencyMs: Date.now() - startedAt,
    };
  }
}

function normalizeBackupSources(sources: MangaSourceEntry[] = []) {
  return sources.map((item) => ({
    url: String(item?.url || "").trim(),
    host: String(item?.host || "").trim(),
    label: String(item?.label || item?.host || "").trim(),
    priority: Number(item?.priority || 99),
    failCount: Number(item?.failCount || 0),
    isActive: item?.isActive !== false,
    lastSuccessAt: item?.lastSuccessAt || null,
    lastErrorAt: item?.lastErrorAt || null,
    lastErrorMessage: String(item?.lastErrorMessage || ""),
  }));
}

export async function runSourceHealthCheck(db: Firestore) {
  const snap = await db.collection("mangas").where("autoSync", "==", true).get();

  const results: Array<{
    mangaId: string;
    title: string;
    primaryBefore: string;
    primaryAfter: string;
    switched: boolean;
    ok: boolean;
    error?: string;
  }> = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, any>;
    const sources = getOrderedSources(data);

    if (!sources.length) {
      results.push({
        mangaId: doc.id,
        title: String(data?.title || doc.id),
        primaryBefore: "",
        primaryAfter: "",
        switched: false,
        ok: false,
        error: "Mangá sem fontes cadastradas.",
      });
      continue;
    }

    const checks: SourceCheckResult[] = [];

    for (const source of sources) {
      if (!source?.url) continue;
      const result = await checkUrl(source.url);
      checks.push(result);
    }

    const firstOk = checks.find((item) => item.ok);
    const currentPrimary = String(
      data?.primarySourceUrl || data?.sourceUrl || ""
    ).trim();

    const backupSources = normalizeBackupSources(
      Array.isArray(data?.backupSources) ? data.backupSources : []
    );

    let newPrimary = currentPrimary;
    let switched = false;

    if (firstOk?.url && firstOk.url !== currentPrimary) {
      newPrimary = firstOk.url;
      switched = true;
    }

    const updatedBackupSources = backupSources.map((item) => {
      const found = checks.find((check) => check.url === item.url);
      if (!found) return item;

      return {
        ...item,
        host: found.host || item.host,
        isActive: found.ok,
        failCount: found.ok ? 0 : Number(item.failCount || 0) + 1,
        lastSuccessAt: found.ok ? FieldValue.serverTimestamp() : item.lastSuccessAt,
        lastErrorAt: found.ok ? item.lastErrorAt : FieldValue.serverTimestamp(),
        lastErrorMessage: found.ok ? "" : String(found.error || ""),
      };
    });

    const primaryCheck = checks.find((item) => item.url === newPrimary) || null;

    await doc.ref.set(
      {
        primarySourceUrl: newPrimary,
        primarySourceHost: newPrimary ? safeHostname(newPrimary) : "",
        sourceUrl: newPrimary || currentPrimary || "",
        sourceHost: newPrimary || currentPrimary
          ? safeHostname(newPrimary || currentPrimary)
          : "",
        backupSources: updatedBackupSources,
        sourceHealth: primaryCheck?.ok ? "healthy" : "warning",
        sourceFailCount: primaryCheck?.ok
          ? 0
          : Number(data?.sourceFailCount || 0) + 1,
        lastSuccessSource: primaryCheck?.ok
          ? newPrimary
          : String(data?.lastSuccessSource || ""),
        lastSuccessAt: primaryCheck?.ok
          ? FieldValue.serverTimestamp()
          : data?.lastSuccessAt || null,
        lastErrorAt: primaryCheck?.ok
          ? data?.lastErrorAt || null
          : FieldValue.serverTimestamp(),
        lastErrorMessage: primaryCheck?.ok
          ? ""
          : String(primaryCheck?.error || "Fonte principal indisponível."),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    results.push({
      mangaId: doc.id,
      title: String(data?.title || doc.id),
      primaryBefore: currentPrimary,
      primaryAfter: newPrimary,
      switched,
      ok: Boolean(firstOk?.ok),
      error: firstOk?.ok ? "" : String(checks[0]?.error || "Sem fonte saudável."),
    });
  }

  return {
    total: results.length,
    okCount: results.filter((item) => item.ok).length,
    switchedCount: results.filter((item) => item.switched).length,
    errorCount: results.filter((item) => !item.ok).length,
    results,
  };
}