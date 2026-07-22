import React from "react";

const FileExplorer = ({ assets }) => {
  const fileKeys = Object.keys(assets || {}).sort();

  const getFileIcon = (name) => {
    if (
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".gif") ||
      name.endsWith(".svg")
    ) {
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
                  return (
                    <div
                      key={path}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[#bfbfbf] transition hover:bg-[#232323] hover:text-white"
                    >
                      <span>{getFileIcon(name)}</span>
                      <span className="truncate">{name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
    </div>
  );
};

export default FileExplorer;
