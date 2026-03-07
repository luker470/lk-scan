const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

function chapterToNumber(ch) {
  const n = parseInt(ch, 10);
  return Number.isFinite(n) ? n : 0;
}

exports.syncChapters = functions.pubsub
  .schedule("every 30 minutes")
  .onRun(async () => {
    const mangasSnap = await db.collection("mangas").get();

    for (const mangaDoc of mangasSnap.docs) {
      const mangaId = mangaDoc.id;

      const [files] = await bucket.getFiles({
        prefix: `mangas/${mangaId}/chapters/`,
      });

      const chaptersMap = new Map();

      for (const f of files) {
        const name = f.name;
        const parts = name.split("/");

        // mangas/{mangaId}/chapters/{chapterId}/{file}
        if (parts.length < 5) continue;

        const chapterId = parts[3];
        const fileName = parts[4];

        if (!fileName.match(/\.(jpg|jpeg|png|webp)$/i)) continue;

        if (!chaptersMap.has(chapterId)) {
          chaptersMap.set(chapterId, []);
        }

        chaptersMap.get(chapterId).push(name);
      }

      for (const [chapterId, pathList] of chaptersMap.entries()) {
        pathList.sort((a, b) => a.localeCompare(b));

        const pages = [];

        for (const path of pathList) {
          const file = bucket.file(path);

          const [url] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 dias
          });

          pages.push(url);
        }

        const chapterRef = db
          .collection("mangas")
          .doc(mangaId)
          .collection("chapters")
          .doc(chapterId);

        await chapterRef.set(
          {
            number: chapterToNumber(chapterId),
            pages,
            pagesCount: pages.length,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      await db.collection("mangas").doc(mangaId).set(
        {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return null;
  });