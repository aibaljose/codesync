import React from 'react';
import Editor from '@monaco-editor/react';

const EditorPane = ({ htmlContent, onChange }) => {
  return (
    <div className="editor-container">
      <Editor
        height="100%"
        defaultLanguage="html"
        theme="vs-dark"
        value={htmlContent}
        onChange={onChange}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          autoIndent: 'full',
          formatOnPaste: true,
          formatOnType: true,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
};

export default EditorPane;
