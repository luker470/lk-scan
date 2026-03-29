import type { Firestore } from "firebase-admin/firestore";

type CreativeInput = {
  metrics?: any;
  queue?: any;
  incidents?: any[];
  commentsAi?: any;
};

function n(v: any, f = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : f;
}

export async function generateOperatorIdeas(
  db: Firestore,
  input: CreativeInput
) {
  const ideas: any[] = [];

  const broken = n(input.metrics?.totalBrokenChapters);
  const queue = n(input.queue?.queued);
  const commentsBug = n(input.commentsAi?.bug);

  // 🔴 CAPÍTULOS QUEBRADOS
  if (broken > 0) {
    ideas.push({
      type: "reader-change",
      title: "Sistema inteligente de páginas quebradas",
      description:
        "Detectar automaticamente páginas quebradas e tentar correção dinâmica no reader.",
      rationale:
        "Melhora direta na experiência do usuário e reduz abandono de leitura.",
      impact: "high",
      risk: "medium",
      relatedFiles: [
        "components/ReaderPro.tsx",
        "app/manga/[id]/chapter/[chapterId]/ChapterClient.tsx",
      ],
      generatedImagePrompt:
        "futuristic manga reader interface auto fixing broken pages neon UI cyberpunk style",
    });
  }

  // 🟡 FILA ALTA
  if (queue > 20) {
    ideas.push({
      type: "code-architecture-change",
      title: "Sistema de fila inteligente com prioridade dinâmica",
      description:
        "Reordenar fila baseado em impacto real no usuário (bugs > novos capítulos).",
      rationale:
        "Reduz tempo de correção de problemas críticos.",
      impact: "high",
      risk: "medium",
      relatedFiles: ["lib/operatorQueue.ts"],
    });
  }

  // 🧠 COMENTÁRIOS COM BUG
  if (commentsBug > 0) {
    ideas.push({
      type: "content-strategy-change",
      title: "Sistema de aprendizado por comentários",
      description:
        "Transformar comentários de bug em ações automáticas do operador.",
      rationale:
        "A comunidade vira sensor do sistema.",
      impact: "high",
      risk: "low",
      relatedFiles: ["lib/ai/commentBrain.ts"],
    });
  }

  // 🟢 IDEIA GLOBAL
  ideas.push({
    type: "ui-change",
    title: "Modo imersivo no leitor",
    description:
      "Criar modo full focus (sem UI, só páginas).",
    rationale:
      "Melhora retenção e experiência do leitor.",
    impact: "medium",
    risk: "low",
    relatedFiles: ["components/ReaderPro.tsx"],
    generatedImagePrompt:
      "minimalist manga reader full immersive dark mode no UI focus reading",
  });

  return ideas;
}

export async function autoCreateIdeas(db: Firestore, ideas: any[]) {
  const created: string[] = [];

  for (const idea of ideas) {
    const exists = await db
      .collection("system")
      .doc("proposals")
      .collection("items")
      .where("title", "==", idea.title)
      .limit(1)
      .get();

    if (!exists.empty) continue;

    const ref = await db
      .collection("system")
      .doc("proposals")
      .collection("items")
      .add({
        ...idea,
        status: "pending",
        proposedBy: "lk-ai-operator",
        requiresExplicitUserApproval: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    created.push(ref.id);
  }

  return created;
}