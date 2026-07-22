import React, { useState } from "react";

const FileExplorer = ({ assets, blobUrls }) => {
  const [expandedImage, setExpandedImage] = useState(null);
  const [modalImage, setModalImage] = useState(null);
  const [copiedPath, setCopiedPath] = useState('');

  const fileKeys = Object.keys(assets || {}).sort();

  const isImage = (name) => {
    const lower = name.toLowerCase();
    return (
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".gif") ||
      lower.endsWith(".svg") ||
      lower.endsWith(".webp") ||
      lower.endsWith(".ico")
    );
  };

  const getFileIcon = (name) => {
    if (isImage(name)) {
      return "🖼️";
    }
    if (
      name.endsWith(".css") ||
      name.endsWith(".js") ||
      name.endsWith(".jsx") ||
      name.endsWith(".ts") ||
      name.endsWith(".tsx")
    ) {
      return "📄";
    }
    return "📎";
  };

  const handleCopyPath = (e, pathStr) => {
    e.stopPropagation();
    navigator.clipboard.writeText(pathStr);
    setCopiedPath(pathStr);
    setTimeout(() => setCopiedPath(''), 2000);
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="rounded-lg border border-[#2a2a2a] bg-[#181818] shadow-inner">
        <div className="flex items-center gap-2 rounded-t-lg bg-[#1f1f1f] px-3 py-2 text-sm font-medium text-white">
          <span>📄</span>
          <span className="truncate">starter.html</span>
        </div>

        <div className="border-t border-[#2a2a2a]">
          <div className="flex items-center justify-between px-3 py-2 text-sm text-[#d1d5db]">
            <div className="flex items-center gap-2">
              <span>📁</span>
              <span className="font-medium">assets</span>
            </div>
            <span className="rounded bg-[#1f2937] px-1.5 py-0.5 text-[10px] text-[#9ca3af]">
              {fileKeys.length}
            </span>
          </div>

          {fileKeys.length > 0 && (
            <div className="space-y-1 pb-2 pl-6 pr-2">
              {fileKeys.map((path) => {
                const name = path.replace(/^assets\//, "");
                const imageFile = isImage(name);
                const imageUrl = imageFile
                  ? blobUrls?.[path] || (assets?.[path] instanceof Blob ? URL.createObjectURL(assets[path]) : null)
                  : null;

                return (
                  <div key={path} className="flex flex-col">
                    <div
                      onClick={() => {
                        if (imageFile && imageUrl) {
                          setExpandedImage(expandedImage === path ? null : path);
                        }
                      }}
                      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[#bfbfbf] transition hover:bg-[#232323] hover:text-white ${
                        imageFile ? "cursor-pointer" : ""
                      } ${expandedImage === path ? "bg-[#232323] text-white font-medium" : ""}`}
                    >
                      <span>{getFileIcon(name)}</span>
                      <span className="truncate flex-1">{name}</span>
                      {imageFile && (
                        <span className="text-[11px] text-[#888] opacity-70 group-hover:opacity-100 transition">
                          {expandedImage === path ? "▲ hide" : "👁️ view"}
                        </span>
                      )}
                    </div>

                    {/* Inline Image Preview Card */}
                    {expandedImage === path && imageUrl && (
                      <div className="mt-1 mb-2 rounded-lg border border-[#333] bg-[#121212] p-2.5 shadow-md">
                        <div className="flex items-center justify-between border-b border-[#222] pb-2 mb-2">
                          <span className="text-xs text-[#999] truncate max-w-[140px]" title={name}>
                            {name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => handleCopyPath(e, `assets/${name}`)}
                              className="rounded bg-[#222] px-2 py-0.5 text-[10px] text-[#ccc] hover:bg-[#3b82f6] hover:text-white transition"
                              title="Copy path for HTML (<img src='assets/...' />)"
                            >
                              {copiedPath === `assets/${name}` ? "Copied!" : "Copy Path"}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setModalImage({ name, url: imageUrl, path: `assets/${name}` });
                              }}
                              className="rounded bg-[#222] px-2 py-0.5 text-[10px] text-[#ccc] hover:bg-[#333] hover:text-white transition"
                              title="Open Full Screen Preview"
                            >
                              🔍 Full
                            </button>
                          </div>
                        </div>
                        <div
                          className="flex items-center justify-center rounded bg-[#1a1a1a] p-3 overflow-hidden cursor-zoom-in"
                          style={{
                            backgroundImage: "radial-gradient(#333 1px, transparent 0)",
                            backgroundSize: "10px 10px",
                          }}
                          onClick={() => setModalImage({ name, url: imageUrl, path: `assets/${name}` })}
                        >
                          <img
                            src={imageUrl}
                            alt={name}
                            className="max-h-44 max-w-full object-contain rounded shadow-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Full-screen Lightbox Modal */}
      {modalImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setModalImage(null)}
        >
          <div
            className="relative flex flex-col max-h-[90vh] max-w-[90vw] rounded-xl border border-[#333] bg-[#181818] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-3 mb-4 gap-4">
              <div className="flex items-center gap-2 truncate">
                <span className="text-lg">🖼️</span>
                <span className="font-medium text-white truncate">{modalImage.name}</span>
                <span className="rounded bg-[#252525] px-2 py-0.5 text-xs font-mono text-[#9ca3af]">
                  {modalImage.path}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={(e) => handleCopyPath(e, modalImage.path)}
                  className="rounded bg-[#2a2a2a] px-3 py-1 text-xs font-medium text-[#d1d5db] hover:bg-[#3b82f6] hover:text-white transition"
                >
                  {copiedPath === modalImage.path ? "✓ Copied!" : "Copy HTML Path"}
                </button>
                <button
                  onClick={() => setModalImage(null)}
                  className="rounded-full bg-[#2a2a2a] px-2.5 py-1 text-sm font-bold text-[#9ca3af] hover:bg-[#ef4444] hover:text-white transition"
                  title="Close preview"
                >
                  ✕
                </button>
              </div>
            </div>
            <div
              className="flex-1 flex items-center justify-center overflow-auto rounded-lg bg-[#111] p-6 min-h-[250px]"
              style={{
                backgroundImage: "radial-gradient(#333 1px, transparent 0)",
                backgroundSize: "14px 14px",
              }}
            >
              <img
                src={modalImage.url}
                alt={modalImage.name}
                className="max-h-[70vh] max-w-full object-contain rounded shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
