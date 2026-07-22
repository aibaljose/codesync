import React, { useEffect, useRef, useState } from 'react';

const PreviewPane = ({ htmlContent, blobUrls }) => {
  const iframeRef = useRef(null);
  const fullIframeRef = useRef(null);
  const [viewSize, setViewSize] = useState('full'); // 'full' | 'tablet' | 'mobile' | 'small'
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let processedHtml = htmlContent || '';

    // Replace asset paths with blob URLs
    if (blobUrls) {
      for (const [path, blobUrl] of Object.entries(blobUrls)) {
        const regex1 = new RegExp(`"${path}"`, 'g');
        const regex2 = new RegExp(`'${path}'`, 'g');
        processedHtml = processedHtml.replace(regex1, `"${blobUrl}"`);
        processedHtml = processedHtml.replace(regex2, `'${blobUrl}'`);
      }
    }

    const updateIframe = (iframe) => {
      if (iframe) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc) {
            doc.open();
            doc.write(processedHtml);
            doc.close();
          }
        } catch (e) {
          console.error("Iframe update error:", e);
        }
      }
    };

    updateIframe(iframeRef.current);
    updateIframe(fullIframeRef.current);
  }, [htmlContent, blobUrls, refreshKey, isFullScreen]);

  const getSizeStyles = () => {
    switch (viewSize) {
      case 'tablet':
        return { width: '768px', height: '100%', maxHeight: '1024px' };
      case 'mobile':
        return { width: '375px', height: '100%', maxHeight: '667px' };
      case 'small':
        return { width: '320px', height: '100%', maxHeight: '568px' };
      case 'full':
      default:
        return { width: '100%', height: '100%' };
    }
  };

  const sizes = [
    { id: 'full', label: '🖥️ 100%', title: 'Full Desktop Viewport' },
    { id: 'tablet', label: '💻 Tablet', title: '768px Width' },
    { id: 'mobile', label: '📱 Mobile', title: '375px Width' },
    { id: 'small', label: '📱 Small', title: '320px Width' },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-[#181818] text-[#eff1f6]">
      {/* Viewport Control Toolbar */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a] bg-[#202020] px-3 py-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold text-[#8c8c8c] uppercase tracking-wider">Size:</span>
          {sizes.map((size) => (
            <button
              key={size.id}
              onClick={() => setViewSize(size.id)}
              title={size.title}
              className={`rounded px-2 py-1 font-medium transition ${
                viewSize === size.id
                  ? 'bg-[#3b82f6] text-white shadow-sm'
                  : 'bg-[#2a2a2a] text-[#a0a0a0] hover:bg-[#333] hover:text-white'
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshKey((prev) => prev + 1)}
            className="flex items-center gap-1 rounded bg-[#2a2a2a] px-2 py-1 text-[#a0a0a0] hover:bg-[#333] hover:text-white transition"
            title="Reload Preview Frame"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsFullScreen(true)}
            className="flex items-center gap-1 rounded bg-[#2a2a2a] px-2.5 py-1 font-semibold text-[#d1d5db] hover:bg-[#2cbb5d] hover:text-white transition shadow-sm"
            title="Open Full Screen Preview"
          >
            <span>⛶</span>
            <span>Full Screen</span>
          </button>
        </div>
      </div>

      {/* Main Preview Area */}
      <div
        className="flex-1 flex items-center justify-center overflow-auto bg-[#111] p-3"
        style={{
          backgroundImage: viewSize !== 'full' ? 'radial-gradient(#2a2a2a 1px, transparent 0)' : 'none',
          backgroundSize: '12px 12px',
        }}
      >
        <div
          style={getSizeStyles()}
          className={`transition-all duration-200 flex items-center justify-center ${
            viewSize !== 'full'
              ? 'border-[6px] border-[#2c2c2c] rounded-2xl shadow-2xl overflow-hidden bg-white'
              : 'w-full h-full bg-white'
          }`}
        >
          <iframe
            ref={iframeRef}
            className="h-full w-full border-none bg-white"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>

      {/* Full Screen Live Preview Lightbox */}
      {isFullScreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0f0f0f] text-white">
          {/* Full Screen Header */}
          <div className="flex h-14 items-center justify-between border-b border-[#2a2a2a] bg-[#1a1a1a] px-5 shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-xl">⛶</span>
              <span className="text-base font-bold text-white">Live HTML Preview</span>
              <span className="flex items-center gap-1.5 rounded-full bg-[#112a1c] px-2.5 py-0.5 text-xs font-semibold text-[#2cbb5d] border border-[#1e4a31]">
                <span className="h-2 w-2 rounded-full bg-[#2cbb5d] animate-pulse"></span>
                Realtime DOM
              </span>
            </div>

            {/* Viewport Size Selector in Full Screen */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#8c8c8c] uppercase tracking-wider mr-1">Device Viewport:</span>
              {sizes.map((size) => (
                <button
                  key={size.id}
                  onClick={() => setViewSize(size.id)}
                  title={size.title}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    viewSize === size.id
                      ? 'bg-[#3b82f6] text-white shadow'
                      : 'bg-[#2a2a2a] text-[#a0a0a0] hover:bg-[#333] hover:text-white'
                  }`}
                >
                  {size.label} {size.id !== 'full' ? `(${getSizeStyles().width})` : ''}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setRefreshKey((prev) => prev + 1)}
                className="flex items-center gap-1.5 rounded-md bg-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-[#d1d5db] hover:bg-[#333] hover:text-white transition"
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
              <button
                onClick={() => setIsFullScreen(false)}
                className="flex items-center gap-1 rounded-md bg-[#ef4444] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#dc2626] transition shadow"
              >
                <span>✕ Exit Full Screen</span>
              </button>
            </div>
          </div>

          {/* Full Screen Iframe Area */}
          <div
            className="flex-1 flex items-center justify-center overflow-auto bg-[#111] p-6"
            style={{
              backgroundImage: viewSize !== 'full' ? 'radial-gradient(#2a2a2a 1px, transparent 0)' : 'none',
              backgroundSize: '16px 16px',
            }}
          >
            <div
              style={getSizeStyles()}
              className={`transition-all duration-300 flex items-center justify-center ${
                viewSize !== 'full'
                  ? 'border-[8px] border-[#2c2c2c] rounded-3xl shadow-2xl overflow-hidden bg-white max-h-[85vh]'
                  : 'w-full h-full bg-white'
              }`}
            >
              <iframe
                ref={fullIframeRef}
                className="h-full w-full border-none bg-white"
                title="Full Screen Live Preview"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviewPane;
