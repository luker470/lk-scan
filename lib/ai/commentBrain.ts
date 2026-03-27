import type { CommentAnalysis } from "@/lib/operatorTypes";

function normalize(text: string) {
  return text.toLowerCase().trim();
}

function countMatches(text: string, words: string[]) {
  let count = 0;
  for (const word of words) {
    if (text.includes(word)) count += 1;
  }
  return count;
}

function isVeryShortText(text: string) {
  return text.replace(/\s+/g, "").length <= 4;
}

function looksLikeOnlyEmojiOrNoise(text: string) {
  const cleaned = text.replace(/[a-zà-ú0-9\s?!.,-]/gi, "").trim();
  return cleaned.length > 0 && cleaned.length >= text.trim().length * 0.5;
}

function compactSpaces(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function analyzeComment(textInput: string): CommentAnalysis {
  const raw = compactSpaces(textInput || "");
  const text = normalize(raw);

  const praiseWords = [
    "top",
    "bom",
    "boa",
    "gostei",
    "perfeito",
    "perfeita",
    "ótimo",
    "otimo",
    "incrível",
    "incrivel",
    "parabéns",
    "parabens",
    "amei",
    "muito bom",
    "ficou bom",
    "ficou top",
    "excelente",
    "brabo",
    "massa",
    "show",
    "curti",
    "legal",
  ];

  const bugWords = [
    "erro",
    "bug",
    "quebrado",
    "quebrada",
    "não abre",
    "nao abre",
    "sem página",
    "sem pagina",
    "página",
    "pagina",
    "carrega infinito",
    "travou",
    "não carrega",
    "nao carrega",
    "imagem quebrada",
    "página quebrada",
    "pagina quebrada",
    "faltando página",
    "faltando pagina",
    "capítulo quebrado",
    "capitulo quebrado",
    "não passa",
    "nao passa",
    "não funciona",
    "nao funciona",
    "bugado",
    "cortado",
    "duplicada",
    "duplicado",
    "repetida",
    "repetido",
    "não aparece",
    "nao aparece",
    "fora de ordem",
    "ordem errada",
    "não carrega a imagem",
    "nao carrega a imagem",
  ];

  const questionWords = [
    "como",
    "quando",
    "onde",
    "por que",
    "porque",
    "?",
    "vai sair",
    "tem previsão",
    "tem previsao",
    "qual",
    "cadê o próximo",
    "cade o proximo",
    "que horas",
    "vai atualizar",
    "quando sai",
    "quando lança",
    "quando lança o próximo",
    "quando lança o proximo",
    "onde está",
    "onde esta",
    "como faz",
  ];

  const requestWords = [
    "adiciona",
    "adicionar",
    "coloquem",
    "quero",
    "traz",
    "cadê",
    "cade",
    "coloca",
    "ponha",
    "posta",
    "adicionem",
    "coloquem essa obra",
    "quero essa obra",
    "traz esse mangá",
    "traz esse manga",
    "posta mais",
    "upa isso",
    "upem",
    "coloca no site",
    "adiciona no site",
  ];

  const toxicWords = [
    "lixo",
    "merda",
    "idiota",
    "burro",
    "porra",
    "foda-se",
    "fdp",
    "desgraça",
    "desgraca",
    "arrombado",
    "imbecil",
    "otário",
    "otario",
    "palhaço",
    "palhaco",
    "vagabundo",
    "inútil",
    "inutil",
  ];

  const spoilerWords = [
    "spoiler",
    "morre",
    "morreu",
    "final",
    "fim",
    "vilão",
    "vilao",
    "último capítulo",
    "ultimo capitulo",
    "no final",
    "ele morre",
    "ela morre",
    "o vilão",
    "o viloes",
    "último ep",
    "ultimo ep",
  ];

  const spamWords = [
    "grupo vip",
    "chama no pv",
    "me chama",
    "telegram",
    "whatsapp",
    "pix",
    "vendo",
    "promoção",
    "promocao",
    "me chama no zap",
    "clica no link",
    "entra no grupo",
    "grupo privado",
    "chama inbox",
    "ganhe dinheiro",
    "renda extra",
    "divulgação",
    "divulgacao",
  ];

  let classification: CommentAnalysis["classification"] = "generic";
  let priority = 20;
  let sentiment: CommentAnalysis["sentiment"] = "neutral";
  let toxicityScore = 0;
  let needsReview = false;
  let suggestedResponse = "Obrigado pelo seu comentário.";

  if (!text) {
    return {
      classification,
      priority,
      sentiment,
      toxicityScore,
      needsReview,
      suggestedResponse,
    };
  }

  const toxicMatches = countMatches(text, toxicWords);
  const spamMatches = countMatches(text, spamWords);
  const bugMatches = countMatches(text, bugWords);
  const spoilerMatches = countMatches(text, spoilerWords);
  const requestMatches = countMatches(text, requestWords);
  const questionMatches = countMatches(text, questionWords);
  const praiseMatches = countMatches(text, praiseWords);

  const hasToxic = toxicMatches > 0;
  const hasSpam = spamMatches > 0;
  const hasBug = bugMatches > 0;
  const hasSpoiler = spoilerMatches > 0;
  const hasRequest = requestMatches > 0;
  const hasQuestion = questionMatches > 0;
  const hasPraise = praiseMatches > 0;

  if (hasToxic) {
    classification = "toxic";
    priority = Math.min(100, 92 + toxicMatches * 2);
    sentiment = "negative";
    toxicityScore = Math.min(100, 88 + toxicMatches * 3);
    needsReview = true;
    suggestedResponse =
      "Seu comentário foi sinalizado para revisão por linguagem inadequada.";
  } else if (hasSpam) {
    classification = "toxic";
    priority = Math.min(100, 85 + spamMatches * 2);
    sentiment = "negative";
    toxicityScore = 75;
    needsReview = true;
    suggestedResponse =
      "Seu comentário foi sinalizado por possível spam e está em revisão.";
  } else if (hasBug) {
    classification = "bug";
    priority = Math.min(100, 88 + bugMatches * 2);
    sentiment = "negative";
    needsReview = true;
    suggestedResponse =
      "Obrigado por avisar. Já registramos esse problema para revisão automática no sistema.";
  } else if (hasSpoiler) {
    classification = "spoiler";
    priority = Math.min(100, 78 + spoilerMatches * 2);
    sentiment = "neutral";
    needsReview = true;
    suggestedResponse =
      "Atenção: seu comentário pode conter spoiler e foi marcado para revisão.";
  } else if (hasRequest) {
    classification = "request";
    priority = Math.min(100, 68 + requestMatches * 2);
    sentiment = "neutral";
    suggestedResponse =
      "Pedido registrado. O sistema vai considerar essa solicitação na fila de prioridade.";
  } else if (hasQuestion) {
    classification = "question";
    priority = Math.min(100, 62 + questionMatches * 2);
    sentiment = "neutral";
    suggestedResponse =
      "Recebemos sua dúvida. O sistema vai tentar responder ou encaminhar para revisão.";
  } else if (hasPraise) {
    classification = "praise";
    priority = Math.min(100, 30 + praiseMatches * 2);
    sentiment = "positive";
    suggestedResponse =
      "Obrigado pelo apoio. Ficamos felizes que você esteja curtindo o conteúdo.";
  }

  if (classification === "generic") {
    if (raw.length > 400) {
      priority = 45;
      needsReview = true;
      suggestedResponse =
        "Comentário longo recebido. Ele pode passar por revisão antes da publicação completa.";
    } else if (isVeryShortText(text) || looksLikeOnlyEmojiOrNoise(raw)) {
      priority = 10;
      suggestedResponse = "Comentário recebido.";
    } else if (raw.length > 120) {
      priority = 35;
      suggestedResponse =
        "Comentário recebido e incluído na leitura de contexto da comunidade.";
    }
  }

  if (classification === "question" && hasRequest) {
    classification = "request";
    priority = Math.max(priority, 72);
    suggestedResponse =
      "Recebemos sua dúvida e seu pedido. O sistema vai tentar responder e considerar isso nas prioridades.";
  }

  if (classification === "bug" && raw.length > 160) {
    priority = Math.max(priority, 95);
  }

  if (
    classification === "generic" &&
    (raw.includes("obrigado") || raw.includes("valeu"))
  ) {
    sentiment = "positive";
    priority = Math.max(priority, 18);
    suggestedResponse = "Obrigado pelo retorno.";
  }

  return {
    classification,
    priority,
    sentiment,
    toxicityScore,
    needsReview,
    suggestedResponse,
  };
}