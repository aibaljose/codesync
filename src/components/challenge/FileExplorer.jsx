import React from 'react';

const FileExplorer = ({ assets }) => {
  // Sort the assets for display
  const fileKeys = Object.keys(assets || {}).sort();

  return (
    <div className="file-explorer">
      <div className="explorer-header">Explorer</div>
      <ul className="file-tree">
        <li className="file-item active">
          <span className="file-icon">📄</span>
          <span className="file-name">starter.html</span>
        </li>
        <li className="folder-item">
          <span className="folder-icon">📁</span>
          <span className="folder-name">assets</span>
          {fileKeys.length > 0 && (
            <ul className="nested-tree">
              {fileKeys.map(path => {
                const name = path.replace(/^assets\//, '');
                return (
                  <li key={path} className="file-item read-only">
                    <span className="file-icon">🖼️</span>
                    <span className="file-name">{name}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      </ul>
    </div>
  );
};

export default FileExplorer;
