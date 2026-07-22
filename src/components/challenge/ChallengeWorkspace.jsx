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

const ChallengeWorkspace = ({ onExit, ticketUrl, ticketName, ticketId, user }) => {
  const [challengeData, setChallengeData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [activeLeftTab, setActiveLeftTab] = useState('description'); // 'description' | 'files'

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
  const parseZip = async (arrayBuffer, fileName) => {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const files = zip.files;

    let instructionText = "No instruction file found.";
    for (const filename of Object.keys(files)) {
      if (filename.toLowerCase().includes('instruction') || filename.toLowerCase().endsWith('.md') || filename.toLowerCase().endsWith('.txt')) {
        if (!files[filename].dir) {
          instructionText = await files[filename].async("string");
          break;
        }
      }
    }

    let htmlContentText = "<!-- No starter HTML found -->\n<h1>Hello World</h1>";
    const starterFile = Object.keys(files).find(
      name => name.toLowerCase().endsWith('.html') && !files[name].dir && !name.toLowerCase().includes('instruction')
    ) || Object.keys(files).find(name => name.toLowerCase().endsWith('.html') && !files[name].dir);

    if (starterFile) {
      htmlContentText = await files[starterFile].async("string");
    }

    const assetsMap = {};
    const blobUrlsMap = {};

    for (const [filename, fileObj] of Object.entries(files)) {
      if (fileObj.dir) continue;
      if (filename === starterFile || filename.toLowerCase().includes('instruction')) continue;

      const blob = await fileObj.async("blob");
      assetsMap[filename] = blob;
      blobUrlsMap[filename] = URL.createObjectURL(blob);
    }

    setChallengeData({
      instruction: instructionText,
      htmlContent: htmlContentText,
      assets: assetsMap,
      blobUrls: blobUrlsMap,
      startTime: Date.now(),
      fileName: fileName
    });
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
      setError('Error reading ZIP file: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHtmlChange = (value) => {
    setChallengeData(prev => ({
      ...prev,
      htmlContent: value
    }));
  };

  const handleSubmit = async () => {
    if (!challengeData) return;
    setIsSubmitting(true);
    setSubmitStatus('Preparing submission package...');
    setError('');

    try {
      const zip = new JSZip();
      const taskId = challengeData.fileName ? challengeData.fileName.replace(/\.zip$/i, '') : 'Task001';
      const outputFileName = `${taskId}.html`;

      // 1. Add modified HTML
      zip.file(outputFileName, challengeData.htmlContent);

      // 2. Add assets
      for (const [path, blob] of Object.entries(challengeData.assets)) {
        zip.file(path, blob);
      }

      // Ensure starter.html exists in the zip
      if (!zip.file('starter.html')) {
        zip.file('submission.html', challengeData.htmlContent);
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

      // Determine target submission folder based on ticket number (e.g. 1-10 -> submitted/home)
      let folderPrefix = 'submitted';
      let num = parseInt(ticketId, 10);
      if (isNaN(num)) {
        const match = (taskId || challengeData.fileName || ticketName || '').match(/\d+/);
        if (match) {
          num = parseInt(match[0], 10);
        }
      }
      if (!isNaN(num)) {
        if (num >= 1 && num <= 10) folderPrefix = 'submitted/home';
        else if (num >= 11 && num <= 20) folderPrefix = 'submitted/about';
        else if (num >= 21 && num <= 30) folderPrefix = 'submitted/schedule';
        else if (num >= 31 && num <= 40) folderPrefix = 'submitted/participate';
        else if (num >= 41 && num <= 50) folderPrefix = 'submitted/register';
      }

      // 4. Save the zip to Cloudflare R2 inside appropriate submitted/ folder
      setSubmitStatus(`Saving "${baseName}" to Cloudflare R2 (${folderPrefix})...`);
      const arrayBuffer = await content.arrayBuffer();
      const fileBody = new Uint8Array(arrayBuffer);
      const r2Key = `${folderPrefix}/${baseName}`;

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
          <h2>Challenge Environment</h2>
          <p>Select a challenge ZIP package (e.g., ticket_001.zip) to load your interactive IDE.</p>
          
          <label className="file-upload-btn">
            {isLoading ? 'Loading Package...' : 'Open Challenge Package'}
            <input 
              type="file" 
              accept=".zip,application/zip" 
              onChange={handleZipUpload} 
              disabled={isLoading}
              style={{ display: 'none' }}
            />
          </label>

          {error && <div className="error-msg">{error}</div>}
          
          <button className="back-btn" onClick={onExit}>← Return to Portal</button>
        </div>
      </div>
    );
  }

  const assetCount = Object.keys(challengeData.assets || {}).length + 1;

  return (
    <div className="challenge-workspace">
      {/* Top Material Bar (LeetCode Style) */}
      <header className="leetcode-navbar">
        <div className="navbar-left">
          <button className="leetcode-back-btn" onClick={onExit} title="Exit Workspace">
            <span>&larr;</span>
            <span>back to base</span>
          </button>
          <div className="navbar-divider"></div>
          <div className="workspace-title-pill">
            <span className="workspace-title-text">Challenge Workspace</span>
            <span className="file-name-badge">{challengeData.fileName}</span>
          </div>
        </div>

        <div className="navbar-center">
          <span className="sync-dproblemot"></span>
          <span>Realtime updation..</span>
        </div>

        <div className="navbar-right">
          <button className="leetcode-exit-btn" onClick={onExit}>Exit</button>
          <button className="leetcode-submit-btn" onClick={handleSubmit}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Submit for intagration</span>
          </button>
        </div>
      </header>
      
      {/* Split-Pane Grid (LeetCode Material Panels) */}
      <div className="leetcode-workspace-main">
        {/* Left Panel: Description & File Tree */}
        <section className="leetcode-panel">
          <div className="panel-tab-bar">
            <div className="tab-list">
              <button
                className={`panel-tab ${activeLeftTab === 'description' ? 'active' : ''}`}
                onClick={() => setActiveLeftTab('description')}
              >
                <span>Description</span>
              </button>
              <button
                className={`panel-tab ${activeLeftTab === 'files' ? 'active' : ''}`}
                onClick={() => setActiveLeftTab('files')}
              >
                <span>Project Files ({assetCount})</span>
              </button>
            </div>
            <div className="panel-tab-right">
              <span>Markdown</span>
            </div>
          </div>

          <div className="panel-body">
            {activeLeftTab === 'description' ? (
              <div className="instructions-content">
                <pre>{challengeData.instruction}</pre>
              </div>
            ) : (
              <FileExplorer assets={challengeData.assets} />
            )}
          </div>
        </section>

        {/* Middle Panel: Monaco Code Editor */}
        <section className="leetcode-panel">
          <div className="panel-tab-bar">
            <div className="tab-list">
              <button className="panel-tab active">
                <span>&lt;&gt; starter.html</span>
              </button>
            </div>
            <div className="panel-tab-right">
              <span className="language-tag">HTML</span>
            </div>
          </div>

          <div className="panel-body">
            <EditorPane 
              htmlContent={challengeData.htmlContent} 
              onChange={handleHtmlChange} 
            />
          </div>
        </section>

        {/* Right Panel: Live Preview Output */}
        <section className="leetcode-panel">
          <div className="panel-tab-bar">
            <div className="tab-list">
              <button className="panel-tab active">
                <span>Live Preview Output</span>
              </button>
            </div>
            <div className="panel-tab-right">
              <span className="sync-dot"></span>
              <span>DOM Ready</span>
            </div>
          </div>

          <div className="panel-body">
            <PreviewPane 
              htmlContent={challengeData.htmlContent} 
              blobUrls={challengeData.blobUrls} 
            />
          </div>
        </section>
      </div>

      {/* Submission Modal Overlay */}
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
