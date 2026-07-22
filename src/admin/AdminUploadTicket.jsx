
import { useState } from "react";
import { S3Client, PutObjectCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { collection, setDoc, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../config/firebase";
import Adminticketview from "./Adminticketview";

// --- R2 CONFIG -------------------------------------------------------
// These values are bundled into your JS and visible to anyone who opens
// devtools. Use a token scoped to ONLY this bucket with write-only
// permission — never your account's global R2 key.
//
// Vite:   import.meta.env.VITE_R2_ACCOUNT_ID   (prefix VITE_)
// CRA:    process.env.REACT_APP_R2_ACCOUNT_ID  (prefix REACT_APP_)
// Next:   process.env.NEXT_PUBLIC_R2_ACCOUNT_ID (prefix NEXT_PUBLIC_)
// Adjust the four lines below to match your build tool.

const R2_ACCOUNT_ID = import.meta.env.VITE_R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = import.meta.env.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET =import.meta.env.VITE_R2_BUCKET;
const R2_PUBLIC_URL =import.meta.env.VITE_R2_PUBLIC_URL;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export default function AdminUploadTicket() {
  const [file, setFile] = useState(null);
  const [customFileName, setCustomFileName] = useState("");
  const [folderName, setFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [corsStatus, setCorsStatus] = useState("");

  // Run once to apply CORS policy to the bucket.
  // Remove this function and button after CORS is confirmed working.
  const handleSetCors = async () => {
    setCorsStatus("Setting CORS...");
    try {
      await s3.send(
        new PutBucketCorsCommand({
          Bucket: R2_BUCKET,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: ["http://localhost:5173", "https://your-production-domain.com"],
                AllowedMethods: ["GET", "PUT", "HEAD", "DELETE"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        })
      );
      setCorsStatus("✅ CORS set successfully! You can remove this button now.");
    } catch (err) {
      setCorsStatus(`❌ Failed: ${err.message}`);
    }
  };
  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] || null;
    setError("");
    setSavedUrl("");

    if (selected) {
      if (!selected.name.toLowerCase().endsWith(".zip")) {
        setError("Please select a .zip file.");
        setFile(null);
        return;
      }
      if (selected.size > MAX_FILE_SIZE) {
        setError("File is too large (max 50MB).");
        setFile(null);
        return;
      }
    }
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Choose a zip file first.");
      return;
    }
    setUploading(true);
    setError("");
    setSavedUrl("");

    try {
      // Build the storage key using the admin-provided name (or default to uploaded zip file name)
      const rawName = customFileName.trim() || file.name;
      const sanitized = rawName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const baseName = sanitized.toLowerCase().endsWith(".zip") ? sanitized : `${sanitized}.zip`;

      const cleanFolder = folderName.trim().replace(/^[\/]+|[\/]+$/g, "").replace(/[^a-zA-Z0-9._/-]/g, "-");
      const key = cleanFolder ? `tickets/${cleanFolder}/${baseName}` : `tickets/${baseName}`;

      // If folder name is provided, create the folder object in R2 inside tickets
      if (cleanFolder) {
        try {
          await s3.send(
            new PutObjectCommand({
              Bucket: R2_BUCKET,
              Key: `tickets/${cleanFolder}/`,
              Body: new Uint8Array(0),
            })
          );
        } catch (folderErr) {
          console.warn("Folder creation warning:", folderErr);
        }
      }

      // Convert File → ArrayBuffer → Uint8Array so AWS SDK v3 can handle it in the browser.
      // Passing a raw File object causes "readableStream.getReader is not a function"
      // because the SDK attempts to use Node.js stream APIs not available in browsers.
      const arrayBuffer = await file.arrayBuffer();
      const fileBody = new Uint8Array(arrayBuffer);

      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: fileBody,
          ContentType: "application/zip",
        })
      );

      const publicUrl = `${R2_PUBLIC_URL}/${key}`;

      // Atomically increment a counter document to get the next sequential ticket ID.
      // This is race-condition safe and only requires read/write on meta/ticketCounter.
      const counterRef = doc(db, "meta", "ticketCounter");
      let nextId;
      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        nextId = (counterSnap.exists() ? counterSnap.data().count : 0) + 1;
        transaction.set(counterRef, { count: nextId });
      });

      await setDoc(doc(db, "tickets", String(nextId)), {
        fileName: file.name,
        storedAs: baseName,
        folder: cleanFolder || null,
        fileSize: file.size,
        url: publicUrl,
        key,
        assignedTo: null,        // null = available for assignment
        uploadedBy: auth.currentUser?.uid || null,
        uploadedByEmail: auth.currentUser?.email || null,
        createdAt: serverTimestamp(),
      });

      setSavedUrl(publicUrl);
      setFile(null);
      setCustomFileName("");
      setFolderName("");
    } catch (err) {
      console.error("Upload failed:", err);
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-10">
      <div className="max-w-md mx-auto p-6 border border-gray-700 rounded-2xl bg-gray-800/50 shadow-lg space-y-4 text-white font-sans">
        <h2 className="text-lg font-semibold">Upload Ticket Zip</h2>

        <input
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          disabled={uploading}
          className="block w-full text-sm"
        />

        {file && !uploading && (
          <p className="text-sm text-gray-300">
            Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">
            Folder inside <code className="text-xs bg-gray-900 px-1 py-0.5 rounded text-amber-300">tickets/</code> <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="e.g. batch-1 or june-evals"
            disabled={uploading}
            className="block w-full text-sm bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          <p className="text-xs text-gray-400 mt-1">Folder to create inside <code className="text-xs">tickets/</code> in R2.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Storage name <span className="text-gray-400 font-normal">(what it's saved as in the bucket)</span>
          </label>
          <input
            type="text"
            value={customFileName}
            onChange={(e) => setCustomFileName(e.target.value)}
            placeholder={file ? file.name : "e.g. ticket-june-2026"}
            disabled={uploading}
            className="block w-full text-sm bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          <p className="text-xs text-gray-400 mt-1">Leave empty to keep the uploaded zip file name ({file ? file.name : ".zip added automatically if omitted"}).</p>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
        >
          {uploading ? "Uploading..." : "Upload to R2 & Firestore"}
        </button>

        {savedUrl && (
          <div className="text-sm p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-lg">
            <p className="text-emerald-400 font-semibold mb-1">✅ Uploaded and saved!</p>
            <a
              href={savedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 underline break-all text-xs"
            >
              {savedUrl}
            </a>
          </div>
        )}

        {/* ── Temporary: click once to apply CORS, then remove ── */}
        <hr className="border-gray-700" />
        <button
          onClick={handleSetCors}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs transition-colors"
        >
          🔧 Set Bucket CORS (run once)
        </button>
        {corsStatus && <p className="text-xs text-amber-300 mt-1">{corsStatus}</p>}
      </div>

      {/* Ticket Viewer Section */}
      <div className="border-t border-gray-700/60 pt-6">
        <Adminticketview />
      </div>
    </div>
  );
}