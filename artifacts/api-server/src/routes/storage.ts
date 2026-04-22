import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth.js";
import { generateUploadSignature, cloudinary } from "../utils/cloudinary.js";

const router: IRouter = Router();

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

const MAX_SIZE_BYTES = 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
});

router.post("/uploads/request-url", authMiddleware, async (req: Request, res: Response) => {
  const { name, size, contentType, folder } = req.body;

  if (!name || !size || !contentType) {
    res.status(400).json({ error: "name, size e contentType são obrigatórios" });
    return;
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    res.status(400).json({ error: "Tipo de arquivo não permitido" });
    return;
  }

  if (size > MAX_SIZE_BYTES) {
    res.status(400).json({ error: "Arquivo muito grande (máx. 20MB)" });
    return;
  }

  try {
    const uploadFolder = folder || "fisiogest/uploads";
    const params = await generateUploadSignature(uploadFolder);
    res.json(params);
  } catch (error) {
    console.error("Error generating Cloudinary upload signature:", error);
    res.status(500).json({ error: "Falha ao gerar parâmetros de upload" });
  }
});

// Server-side proxy upload — bypasses browser→Cloudinary CORS/adblock issues.
// Accepts multipart/form-data with field "file" and optional "folder".
router.post(
  "/uploads/proxy",
  authMiddleware,
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Arquivo é obrigatório (campo 'file')" });
      return;
    }

    const contentType = file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype;

    if (!ALLOWED_TYPES.includes(contentType)) {
      res.status(400).json({ error: `Tipo de arquivo não permitido: ${contentType}` });
      return;
    }

    const folder = (req.body.folder as string) || "fisiogest/uploads";

    try {
      const result = await new Promise<{ secure_url: string; bytes: number; format: string }>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: "auto" },
            (err, data) => {
              if (err || !data) return reject(err ?? new Error("Cloudinary retornou resposta vazia"));
              resolve(data as { secure_url: string; bytes: number; format: string });
            },
          );
          stream.end(file.buffer);
        },
      );

      res.json({
        secure_url: result.secure_url,
        bytes: result.bytes,
        format: result.format,
      });
    } catch (err) {
      console.error("Cloudinary upload (proxy) failed:", err);
      const message = err instanceof Error ? err.message : "Falha desconhecida";
      res.status(502).json({ error: "Falha ao enviar para Cloudinary", message });
    }
  },
);

// Multer error handler (e.g. file too large) — must come after the route.
router.use((err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: `Arquivo muito grande (máx. ${MAX_SIZE_BYTES / 1024 / 1024}MB)` });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "Internal Server Error" });
});

export default router;
