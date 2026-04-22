import { v2 as cloudinary } from "cloudinary";

if (process.env.CLOUDINARY_URL && (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)) {
  try {
    const parsed = new URL(process.env.CLOUDINARY_URL);
    process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || parsed.hostname;
    process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || decodeURIComponent(parsed.username);
    process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || decodeURIComponent(parsed.password);
  } catch {}
}

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  throw new Error("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET são obrigatórios.");
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

export async function generateUploadSignature(folder: string): Promise<{
  signature: string;
  timestamp: number;
  cloud_name: string;
  api_key: string;
  folder: string;
}> {
  const timestamp = Math.round(Date.now() / 1000);
  const params = { timestamp, folder };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET!);
  return {
    signature,
    timestamp,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    folder,
  };
}

export async function deleteCloudinaryAsset(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Falha ao excluir asset no Cloudinary:", err);
  }
}

export function extractPublicId(cloudinaryUrl: string): string | null {
  try {
    const url = new URL(cloudinaryUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const uploadIdx = parts.findIndex((p) => p === "upload");
    if (uploadIdx === -1) return null;
    let afterUpload = parts.slice(uploadIdx + 1);

    // Skip transformation segments (e.g. "c_fill,w_500", "f_auto", "q_auto:good").
    // Transformation segments come before the version (vXXXXX) or before the folder/public_id.
    // They contain commas or are short prefix_value tokens like c_fill, f_auto, w_500.
    while (
      afterUpload.length > 1 &&
      /^[a-z]{1,3}_/i.test(afterUpload[0]) &&
      !/^v\d+$/.test(afterUpload[0])
    ) {
      afterUpload = afterUpload.slice(1);
    }

    // Skip version segment (v + digits).
    if (afterUpload[0] && /^v\d+$/.test(afterUpload[0])) afterUpload = afterUpload.slice(1);

    if (afterUpload.length === 0) return null;

    const withExt = afterUpload.join("/");
    return withExt.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}
