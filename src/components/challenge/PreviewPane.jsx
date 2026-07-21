import React, { useEffect, useRef } from 'react';

const PreviewPane = ({ htmlContent, blobUrls }) => {
  const iframeRef = useRef(null);

  useEffect(() => {
    let processedHtml = htmlContent;

    // Replace asset paths with blob URLs
    if (blobUrls) {
      for (const [path, blobUrl] of Object.entries(blobUrls)) {
        // match both exact quotes to prevent replacing partial paths incorrectly
        // e.g. "assets/logo.png" -> "blob:http..."
        const regex1 = new RegExp(`"${path}"`, 'g');
        const regex2 = new RegExp(`'${path}'`, 'g');
        // Also handle cases without quotes if needed, but standard HTML uses quotes.
        processedHtml = processedHtml.replace(regex1, `"${blobUrl}"`);
        processedHtml = processedHtml.replace(regex2, `'${blobUrl}'`);
      }
    }

    const iframe = iframeRef.current;
    if (iframe) {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(processedHtml);
      doc.close();
    }
  }, [htmlContent, blobUrls]);

  return (
    <iframe
      ref={iframeRef}
      className="preview-iframe"
      title="Live Preview"
      sandbox="allow-scripts allow-same-origin"
    />
  );
};

export default PreviewPane;
