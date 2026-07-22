
import { useState } from "react";
import { S3Client, PutObjectCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { collection, setDoc, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../config/firebase";

// --- R2 CONFIG -------------------------------------------------------
// These values are bundled into your JS and visible to anyone who opens
// devtools. Use a token scoped to ONLY this bucket with write-only
// permission — never your account's global R2 key.
//
// Vite:   import.meta.env.VITE_R2_ACCOUNT_ID   (prefix VITE_)
// CRA:    process.env.REACT_APP_R2_ACCOUNT_ID  (prefix REACT_APP_)
// Next:   process.env.NEXT_PUBLIC_R2_ACCOUNT_ID (prefix NEXT_PUBLIC_)
// Adjust the four lines below to match your build tool.

const R2_ACCOUNT_ID = "96a84fbb4e733cd323a8446d6b88f63f";
const R2_ACCESS_KEY_ID = "80b17dec3ca834adacf020d44c723a31";
const R2_SECRET_ACCESS_KEY = "f5480c6cac0b7d3c4e9530bb5b89b1ce87d492128c397d06f03859f840666f93";
const R2_BUCKET = "ticket-storage";
const R2_PUBLIC_URL = "https://pub-8c5726df2e3046a1a68c9dc28431874f.r2.dev"; // e.g. https://pub-xxxx.r2.dev

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
    <div className="max-w-md mx-auto p-6 border rounded-lg space-y-4">
      <h2 className="text-lg font-semibold">Upload Ticket Zip</h2>

      <input
        type="file"
        accept=".zip"
        onChange={handleFileChange}
        disabled={uploading}
        className="block w-full text-sm"
      />

      {file && !uploading && (
        <p className="text-sm text-gray-600">
          Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">
          Folder inside <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">tickets/</code> <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          placeholder="e.g. batch-1 or june-evals"
          disabled={uploading}
          className="block w-full text-sm border rounded px-3 py-2"
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
          className="block w-full text-sm border rounded px-3 py-2"
        />
        <p className="text-xs text-gray-400 mt-1">Leave empty to keep the uploaded zip file name ({file ? file.name : ".zip added automatically if omitted"}).</p>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload"}
      </button>

      {savedUrl && (
        <div className="text-sm">
          <p className="text-green-600">Uploaded and saved.</p>
          <a
            href={savedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline break-all"
          >
            {savedUrl}
          </a>
        </div>
      )}

      {/* ── Temporary: click once to apply CORS, then remove ── */}
      <hr />
      <button
        onClick={handleSetCors}
        className="px-4 py-2 bg-gray-700 text-white rounded text-sm"
      >
        🔧 Set Bucket CORS (run once)
      </button>
      {corsStatus && <p className="text-sm mt-1">{corsStatus}</p>}
    </div>
  );
}