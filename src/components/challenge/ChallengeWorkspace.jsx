import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ref, push, set, update, serverTimestamp } from 'firebase/database';
import { rtdb, auth } from '../../config/firebase';
import FileExplorer from './FileExplorer';
import EditorPane from './EditorPane';
import PreviewPane from './PreviewPane';
import './ChallengeWorkspace.css';

// R2 Configuration (Same credentials & endpoint as AdminUploadTicket)
const R2_ACCOUNT_ID = "96a84fbb4e733cd323a8446d6b88f63f";
const R2_ACCESS_KEY_ID = "80b17dec3ca834adacf020d44c723a31";
const R2_SECRET_ACCESS_KEY = "f5480c6cac0b7d3c4e9530bb5b89b1ce87d492128c397d06f03859f840666f93";
const R2_BUCKET = "ticket-storage";
const R2_PUBLIC_URL = "https://pub-8c5726df2e3046a1a68c9dc28431874f.r2.dev";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const ChallengeWorkspace = ({ onExit, ticketUrl, ticketName, user }) => {
  const [challengeData, setChallengeData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');

  // Auto-load the zip from the assigned ticket URL when provided
  useEffect(() => {
    if (!ticketUrl) return;
    const loadFromUrl = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await fetch(ticketUrl);
        if (!response.ok) throw new Error(`Failed to fetch ticket (${response.status})`);
        const arrayBuffer = await response.arrayBuffer();
        await parseZip(arrayBuffer, ticketName || 'ticket.zip');
      } catch (err) {
        console.error(err);
        setError('Could not load ticket: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    };
    loadFromUrl();
  }, [ticketUrl]);

  // Shared ZIP parsing logic used by both URL-load and manual upload
  const parseZip = async (source, fileName) => {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(source);

    let instruction = '';
    let htmlContent = '';
    const assets = {};
    const blobUrls = {};
    let hasStarter = false;
    let hasInstruction = false;

    for (const relativePath in loadedZip.files) {
      const zipEntry = loadedZip.files[relativePath];
      if (zipEntry.dir) continue;
      if (relativePath.startsWith('__MACOSX/') || relativePath.split('/').pop().startsWith('.')) continue;

      if (relativePath === 'instruction.txt' || relativePath.endsWith('/instruction.txt')) {
        instruction = await zipEntry.async('string');
        hasInstruction = true;
      } else if (relativePath === 'starter.html' || relativePath.endsWith('/starter.html')) {
        htmlContent = await zipEntry.async('string');
        hasStarter = true;
      } else if (relativePath.includes('assets/')) {
        const assetPath = relativePath.substring(relativePath.indexOf('assets/'));
        const blob = await zipEntry.async('blob');
        const ext = assetPath.split('.').pop().toLowerCase();
        let mimeType = 'application/octet-stream';
        if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext}`;
        else if (['woff', 'woff2', 'ttf', 'otf'].includes(ext)) mimeType = `font/${ext}`;
        else if (ext === 'css') mimeType = 'text/css';
        else if (ext === 'js') mimeType = 'text/javascript';
        const typedBlob = new Blob([blob], { type: mimeType });
        assets[assetPath] = typedBlob;
        blobUrls[assetPath] = URL.createObjectURL(typedBlob);
      }
    }

    if (!hasStarter || !hasInstruction) {
      throw new Error('Invalid ZIP format. Must contain instruction.txt and starter.html');
    }

    setChallengeData({ instruction, htmlContent, assets, blobUrls, startTime: Date.now(), fileName });
  };
  const handleZipUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsLoading(true);
    setError('');
    try {
      const arrayBuffer = await file.arrayBuffer();
      await parseZip(arrayBuffer, file.name);
    } catch (err) {
      console.error(err);
      setError('Failed to extract ZIP: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHtmlChange = (newContent) => {
    setChallengeData(prev => ({
      ...prev,
      htmlContent: newContent
    }));
  };

  const handleSubmit = async () => {
    if (!challengeData) return;
    setIsSubmitting(true);
    setSubmitStatus('Building submission package...');

    try {
      const zip = new JSZip();
      
      // Determine taskId from instructions or fallback
      let taskId = 'Task001';
      const taskMatch = challengeData.instruction.match(/Task\s*(\d+)/i);
      if (taskMatch) {
        taskId = `Task${taskMatch[1].padStart(3, '0')}`;
      } else {
        const genericMatch = challengeData.instruction.match(/taskId"?:\s*"?([^"\s]+)/i);
        if (genericMatch) taskId = genericMatch[1];
      }

      const outputFileName = `${taskId}.html`;

      // 1. Add modified HTML
      zip.file(outputFileName, challengeData.htmlContent);

      // 2. Add assets
      for (const [path, blob] of Object.entries(challengeData.assets)) {
        zip.file(path, blob);
      }

      // 3. Add metadata.json
      const duration = Math.floor((Date.now() - challengeData.startTime) / 1000);
      const currentUser = user || auth.currentUser || { uid: 'anonymous', displayName: 'Anonymous User', email: 'anonymous@codesync.dev' };
      
      const metadata = {
        taskId: taskId,
        submittedAt: new Date().toISOString(),
        durationSeconds: duration,
        user: {
          uid: currentUser.uid,
          displayName: currentUser.displayName || 'Anonymous User',
          email: currentUser.email || ''
        }
      };
      zip.file('metadata.json', JSON.stringify(metadata, null, 2));

      // Generate zip blob
      const content = await zip.generateAsync({ type: 'blob' });

      // Name as the same name before unzip
      const originalName = challengeData.fileName || ticketName || `${taskId}.zip`;
      const sanitizedName = originalName.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
      const baseName = sanitizedName.toLowerCase().endsWith(".zip") ? sanitizedName : `${sanitizedName}.zip`;

      // 4. Save the zip to Cloudflare R2
      setSubmitStatus(`Saving "${baseName}" to Cloudflare R2...`);
      const arrayBuffer = await content.arrayBuffer();
      const fileBody = new Uint8Array(arrayBuffer);
      const r2Key = `submitted/${baseName}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: r2Key,
          Body: fileBody,
          ContentType: "application/zip",
        })
      );

      const r2PublicUrl = `${R2_PUBLIC_URL}/${r2Key}`;

      // 5. Store the log to Realtime Database of each user and global dashboard feed
      setSubmitStatus('Logging submission to Realtime Database...');
      const submissionRecord = {
        uid: currentUser.uid,
        displayName: currentUser.displayName || 'Anonymous User',
        email: currentUser.email || '',
        fileName: baseName,
        originalName: challengeData.fileName || baseName,
        r2Url: r2PublicUrl,
        r2Key: r2Key,
        taskId: taskId,
        fileSizeBytes: content.size,
        durationSeconds: duration,
        submittedAt: serverTimestamp(),
        submittedAtISO: new Date().toISOString()
      };

      try {
        // Store in individual user's realtime database node
        const userSubmissionRef = push(ref(rtdb, `logs/users/${currentUser.uid}/submissions`));
        await set(userSubmissionRef, { ...submissionRecord, id: userSubmissionRef.key });

        // Store in global dashboard node for admin analytics
        const globalSubmissionRef = ref(rtdb, `logs/all_submissions/${userSubmissionRef.key}`);
        await set(globalSubmissionRef, { ...submissionRecord, id: userSubmissionRef.key });

        // Update user status for dashboard counters
        const userStatusRef = ref(rtdb, `status/users/${currentUser.uid}`);
        await update(userStatusRef, {
          uid: currentUser.uid,
          displayName: currentUser.displayName || 'Anonymous User',
          email: currentUser.email || '',
          hasSubmitted: true,
          lastSubmissionAt: serverTimestamp(),
          lastSubmissionUrl: r2PublicUrl,
          lastSubmissionFile: baseName
        });
      } catch (dbErr) {
        console.warn('Realtime Database write warning:', dbErr);
        if (dbErr?.message?.includes('PERMISSION_DENIED') || dbErr?.code === 'PERMISSION_DENIED') {
          console.error('Firebase RTDB PERMISSION_DENIED: Please allow reads/writes in your Firebase Console -> Realtime Database -> Rules.');
        }
      }

      // 6. Download local copy with same name before unzip
      setSubmitStatus(`Downloading "${baseName}" locally...`);
      const downloadUrl = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = baseName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setSubmitStatus('✅ Submission complete! Saved to R2 & Realtime Database.');
      setTimeout(() => {
        setIsSubmitting(false);
        setSubmitStatus('');
      }, 2500);
    } catch (err) {
      console.error('Submit error:', err);
      setError('Failed to generate/save submission: ' + err.message);
      setIsSubmitting(false);
      setSubmitStatus('');
    }
  };

  if (!challengeData) {
    return (
      <div className="challenge-import-screen">
        <div className="import-card">
          <h2>Challenge Import</h2>
          <p>Select a challenge ZIP file (e.g., ticket_001.zip) to begin.</p>
          
          <label className="file-upload-btn">
            {isLoading ? 'Loading...' : 'Open Challenge'}
            <input 
              type="file" 
              accept=".zip,application/zip" 
              onChange={handleZipUpload} 
              disabled={isLoading}
              style={{ display: 'none' }}
            />
          </label>

          {error && <div className="error-msg">{error}</div>}
          
          <button className="back-btn" onClick={onExit}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="challenge-workspace">
      <header className="workspace-header">
        <div className="header-left">
          <h1>Challenge Environment</h1>
          <span className="file-name-badge">{challengeData.fileName}</span>
        </div>
        <div className="header-right">
          <button className="exit-btn" onClick={onExit}>Exit</button>
          <button className="submit-btn" onClick={handleSubmit}>Submit</button>
        </div>
      </header>
      
      <div className="workspace-main">
        <FileExplorer assets={challengeData.assets} />
        
        <div className="instructions-pane">
          <div className="pane-header">Instructions</div>
          <div className="pane-content">
            <pre>{challengeData.instruction}</pre>
          </div>
        </div>

        <div className="editor-pane">
          <div className="pane-header">starter.html</div>
          <EditorPane 
            htmlContent={challengeData.htmlContent} 
            onChange={handleHtmlChange} 
          />
        </div>

        <div className="preview-pane-container">
          <div className="pane-header">Live Preview</div>
          <PreviewPane 
            htmlContent={challengeData.htmlContent} 
            blobUrls={challengeData.blobUrls} 
          />
        </div>
      </div>

      {isSubmitting && (
        <div className="submission-overlay">
          <div className="submission-modal">
            {submitStatus.includes('✅') ? (
              <div className="submission-success-icon">✓</div>
            ) : (
              <div className="submission-spinner"></div>
            )}
            <div className="submission-status-text">{submitStatus}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChallengeWorkspace;
