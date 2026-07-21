import React, { useState } from 'react';
import JSZip from 'jszip';
import FileExplorer from './FileExplorer';
import EditorPane from './EditorPane';
import PreviewPane from './PreviewPane';
import './ChallengeWorkspace.css';

const ChallengeWorkspace = ({ onExit }) => {
  const [challengeData, setChallengeData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleZipUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setError('');

    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);

      let instruction = '';
      let htmlContent = '';
      const assets = {};
      const blobUrls = {};
      let hasStarter = false;
      let hasInstruction = false;

      for (const relativePath in loadedZip.files) {
        const zipEntry = loadedZip.files[relativePath];
        if (zipEntry.dir) continue; // Skip directories

        // Handle macOS __MACOSX and hidden files
        if (relativePath.startsWith('__MACOSX/') || relativePath.split('/').pop().startsWith('.')) {
          continue;
        }

        if (relativePath === 'instruction.txt' || relativePath.endsWith('/instruction.txt')) {
          instruction = await zipEntry.async('string');
          hasInstruction = true;
        } else if (relativePath === 'starter.html' || relativePath.endsWith('/starter.html')) {
          htmlContent = await zipEntry.async('string');
          hasStarter = true;
        } else if (relativePath.includes('assets/')) {
          // Keep only the path starting from 'assets/' to avoid nested root folder issues
          const assetPath = relativePath.substring(relativePath.indexOf('assets/'));
          const blob = await zipEntry.async('blob');
          
          // Determine mime type from extension for blob (useful for fonts/images if browser needs it)
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

      setChallengeData({
        instruction,
        htmlContent,
        assets,
        blobUrls,
        startTime: Date.now(),
        fileName: file.name
      });
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

    try {
      const zip = new JSZip();
      
      // Determine taskId from instructions or fallback
      let taskId = 'Task001';
      const taskMatch = challengeData.instruction.match(/Task\s*(\d+)/i);
      if (taskMatch) {
        taskId = `Task${taskMatch[1].padStart(3, '0')}`;
      } else {
        // Look for any mention of a taskId pattern
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
      const metadata = {
        taskId: taskId,
        submittedAt: new Date().toISOString(),
        duration: duration
      };
      zip.file('metadata.json', JSON.stringify(metadata, null, 2));

      // Generate and download
      const content = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'submission.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to generate submission.');
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
    </div>
  );
};

export default ChallengeWorkspace;
