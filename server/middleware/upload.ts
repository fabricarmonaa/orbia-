import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import fs from "fs/promises";

// Maximum upload size (10MB by default unless overridden by env variable)
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_ATTACHMENT_BYTES || "10485760", 10);

// Ensure the temp directory exists
const tempDir = path.join(process.cwd(), "storage", "tmp");

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            await fs.mkdir(tempDir, { recursive: true });
            cb(null, tempDir);
        } catch (err) {
            cb(err as Error, tempDir);
        }
    },
    filename: (req, file, cb) => {
        // Generate a random UUID for the temp file to prevent collisions
        const ext = path.extname(file.originalname);
        const safeName = `${randomUUID()}${ext}`;
        cb(null, safeName);
    },
});

export const upload = multer({
    storage,
    limits: {
        fileSize: MAX_UPLOAD_SIZE,
    },
    fileFilter: (req, file, cb) => {
        // Basic pre-filter check based on mimetype string from client
        // Actual magic-byte validation happens in the business logic later
        if (file.mimetype.startsWith("text/html") || file.mimetype.startsWith("application/javascript") || file.originalname.endsWith(".exe") || file.originalname.endsWith(".sh")) {
            cb(new Error("File type not allowed"));
            return;
        }
        cb(null, true);
    },
});
